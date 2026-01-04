import { GoogleDriveSyncInternalStorage } from './google-drive-sync-internal-storage.js';
import { GoogleDriveSyncOauthClient } from './google-drive-sync-oauth-client.js';
import { GoogleDriveSyncRemoteStorage } from './google-drive-sync-remote-storage.js';

// polyfill for BigInt
if (typeof BigInt !== 'undefined') {
  BigInt.prototype.toJSON = function() { return this.toString(); }
}

/*
interface GoogleDriveSyncConfig {
  useOffline: boolean; // false. refresh token 사용하기
  saveRefreshToken: boolean; // false. refresh token local storage 에 저장하기
  usePrivate: boolean; // false. appDataFolder 사용하기
  flatten: boolean; // false. data vs *.json
  autoSync: boolean; // false.
  ignoreConflict: boolean; // false.
}
*/

const DIRTY_KEY = 'GDS.drity';
const REMOVED_KEY = 'GDS.removed';
const REMOTE_WRITE_MAX_ATTEMPTS = 3;
const REMOTE_WRITE_RETRY_DELAY_MS = 500;

/**
 * basic methods
 * - 데이터 저장하기, 불러오기
 *
 * google methods
 * - 구동하기
 * - 로그인하기, 로그아웃하기
 * - 데이터 저장하고 싱크하기, 데이터 싱크해서 불러오기
 *
 * events
 * - SyncReady (UserLogin)
 * - UserLogout
 * - TokenExpired
 */
export class GoogleDriveSync {
  #_oauth_client;
  #_internal_storage;
  #_remote_storage;

  #dirty;
  #removed;
  #mutex;

  constructor(config) {
    this.config = config;

    this.#_oauth_client = new GoogleDriveSyncOauthClient(config);
    this.#_internal_storage = new GoogleDriveSyncInternalStorage();
    this.#_remote_storage = new GoogleDriveSyncRemoteStorage(config);

    this.#dirty = new LocalStorageSet(DIRTY_KEY);
    this.#removed = new LocalStorageSet(REMOVED_KEY);
    this.#mutex = new Mutex();
  }

  load(key) {
    return this.#_internal_storage.load(key);
  }
  save(key, value) {
    const previousValue = this.load(key);
    if (isEqual(previousValue, value)) {
      return;
    }
    this.#dirty.add(key);
    this.#removed.delete(key);
    this.#_internal_storage.save(key, value);
  }
  remove(key) {
    this.#dirty.delete(key);
    this.#removed.add(key);
    this.#_internal_storage.remove(key);
  }

  async initGoogleLibrary() {
    await this.#_oauth_client.initGoogleLibrary();
  }

  login() {
    this.#_oauth_client.login();
  }

  logout() {
    this.#_oauth_client.logout();
  }

  /**
   * string -> any
   * string[] -> Array<Promise<any>>
   */
  async loadRemote(key) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }

    const isPlural = Array.isArray(key);

    const params = isPlural ? key : [key];

    const entries = params.map(key => ({
      key,
      internalData: this.#_internal_storage.load(key)
    }));
    // remote load
    const remoteDataPromises = await this.#_remote_storage.load(entries);
    const remoteData = await Promise.all(remoteDataPromises);
    // compare
    // if diff
      // selfMerge -> return remote load

    // ignoreConflict
    await this.#mutex.waitForUnlock();
    const finalData = remoteData.map((data, index) => {
      const key = params[index];
      if (this.#dirty.has(key)) {
        // save > load
        return this.#_internal_storage.load(key);
      }
      if (this.#removed.has(key)) {
        // remove > load
        this.#_internal_storage.remove(key);
        return undefined;
      }
      this.#_internal_storage.save(key, data);
      return data;
    });
    // internal load
    if (isPlural) {
      return finalData;
    } else {
      return finalData[0];
    }
    // else
      // ?
  }

  async loadRemoteForce(key) {
    const remoteData = await (await this.#_remote_storage.load([{ key }], true))[0];
    this.#_internal_storage.save(key, remoteData);
    return this.#_internal_storage.load(key);
  }

  #getDirtyRemovedEntries() {
    return [...this.#dirty].map((key) => ({
      type: 'save',
      key,
      value: this.#_internal_storage.load(key),
    })).concat([...this.#removed].map((key) => ({
      type: 'remove',
      key,
    })));
  }

  async #writeRemote(entries) {
    try {
      await this.#mutex.acquire();

      let currentEntries = entries ?? this.#getDirtyRemovedEntries();
      let attempt = 0;
      while (true) {
        if (currentEntries.length === 0) {
          return;
        }
        try {
          await this.#_remote_storage.save(currentEntries);

          this.#dirty.clear();
          this.#removed.clear();
          return;
        } catch (error) {
          if (error?.message === 'Conflict! load remote first') {
            throw error;
          }
          attempt += 1;
          if (attempt >= REMOTE_WRITE_MAX_ATTEMPTS) {
            throw error;
          }
          await delay(REMOTE_WRITE_RETRY_DELAY_MS * attempt);
          currentEntries = this.#getDirtyRemovedEntries();
        }
      }
    } finally {
      this.#mutex.release();
    }
  }

  async saveRemote(key, value) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }

    const previousValue = this.load(key);
    if (!isEqual(previousValue, value)) {
      this.#dirty.add(key);
      this.#removed.delete(key);
      this.#_internal_storage.save(key, value);
    }

    const entries = this.#getDirtyRemovedEntries();
    if (entries.length === 0) {
      return;
    }
    await this.#writeRemote(entries);
  }

  async removeRemote(key) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }

    const hasLocal = this.load(key) !== undefined;
    const isDirty = this.#dirty.has(key);
    const isRemoved = this.#removed.has(key);
    if (!hasLocal && !isDirty && !isRemoved) {
      return;
    }

    this.#dirty.delete(key);
    this.#removed.add(key);
    this.#_internal_storage.remove(key);

    const entries = this.#getDirtyRemovedEntries();
    if (entries.length === 0) {
      return;
    }
    await this.#writeRemote(entries);
  }

  async syncRemote() {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }

    if (this.#dirty.size === 0 && this.#removed.size === 0) {
      return;
    }

    const entries = this.#getDirtyRemovedEntries();
    await this.#writeRemote(entries);
  }
}

/**
 * 순서 보장 Mutex
 *
 * ```
 * // example
 * const lock = new Mutex();
 * async function job() {
 *   try {
 *     await lock.acquire();
 *     // critical section: do your async job
 *   } finally {
 *     lock.release();
 *   }
 * }
 * ```
 */
class Mutex {
  _lock = false;
  _notifies = [];
  _unlockNotifies = [];

  async acquire() {
    if (!this._lock) {
      this._lock = true; // 열쇠 획득
    } else {
      await new Promise(resolve => {
        this._notifies.push(resolve); // 줄 서기
      });
    }
  }

  release() {
    if (this._lock === true) {
      if (this._notifies.length > 0) {
        const notify = this._notifies.shift();
        notify(); // 다음 분!
      } else {
        this._lock = false; // 열쇠 두기
        if (this._unlockNotifies.length > 0) {
          const notifies = this._unlockNotifies.slice();
          this._unlockNotifies = [];
          notifies.forEach((notify) => notify());
        }
      }
    }
  }

  async waitForUnlock() {
    if (!this._lock) {
      return;
    }
    await new Promise(resolve => {
      this._unlockNotifies.push(resolve);
    });
  }
}

class LocalStorageSet {
  #key;
  #set;

  get [Symbol.iterator]() {
    return this.#set[Symbol.iterator].bind(this.#set);
  }

  constructor(key) {
    this.#key = key;
    this.#set = new Set(JSON.parse(localStorage.getItem(key)) ?? []);
  }

  #save() {
    localStorage.setItem(this.#key, JSON.stringify([...this.#set]));
  }

  add(value) {
    this.#set.add(value);
    this.#save();
  }

  has(value) {
    return this.#set.has(value);
  }

  delete(value) {
    this.#set.delete(value);
    this.#save();
  }

  clear(value) {
    this.#set.clear();
    this.#save();
  }
}

function isEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a && b && typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (error) {
      return false;
    }
  }
  return false;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

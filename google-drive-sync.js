import { GoogleDriveSyncInternalStorage } from './google-drive-sync-internal-storage.js';
import { GoogleDriveSyncOauthClient } from './google-drive-sync-oauth-client.js';
import { GoogleDriveSyncRemoteStorage } from './google-drive-sync-remote-storage.js';

// polyfill for BigInt
if (BigInt) {
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
    const remoteData = await this.#_remote_storage.load(entries);
    // compare
    // if diff
      // selfMerge -> return remote load

      // ignoreConflict
      remoteData.forEach(async (remoteDataPromise, index) => {
        const key = params[index];
        this.#_internal_storage.save(key, await remoteDataPromise);
      });
      // internal load
      if (isPlural) {
        return remoteData;
      } else {
        return remoteData[0];
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

      await this.#_remote_storage.save(entries);

      this.#dirty.clear();
      this.#removed.clear();
    } finally {
      this.#mutex.release();
    }
  }

  async saveRemote(key, value) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }

    this.#dirty.add(key);
    this.#removed.delete(key);

    const entries = this.#getDirtyRemovedEntries();
    await this.#writeRemote(entries);
    this.#_internal_storage.save(key, value);
  }

  async removeRemote(key) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }

    this.#dirty.delete(key);
    this.#removed.add(key);

    const entries = this.#getDirtyRemovedEntries();
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
      }
    }
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

  delete(value) {
    this.#set.delete(value);
    this.#save();
  }

  clear(value) {
    this.#set.clear();
    this.#save();
  }
}


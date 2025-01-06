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

  constructor(config) {
    this.config = config;

    this.#_oauth_client = new GoogleDriveSyncOauthClient(config);
    this.#_internal_storage = new GoogleDriveSyncInternalStorage();
    this.#_remote_storage = new GoogleDriveSyncRemoteStorage(config);

    this.#dirty = new Set(JSON.parse(localStorage.getItem(DIRTY_KEY)) || []);
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
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...this.#dirty]));
    this.#_internal_storage.save(key, value);
  }
  remove(key) {
    this.#dirty.delete(key);
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...this.#dirty]));
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

  async saveRemote(key, value) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }

    this.#_internal_storage.save(key, value);

    const entries = [...this.#dirty].map((key) => ({
      key,
      value: this.#_internal_storage.load(key),
    })).concat([{ key, value }]);
    await this.#_remote_storage.save(entries);

    this.#dirty = new Set();
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...this.#dirty]));
  }

  async syncRemote() {
    if (this.#dirty.size === 0) {
      return;
    }

    const entries = [...this.#dirty].map((key) => ({
      key,
      value: this.#_internal_storage.load(key),
    }));
    await this.#_remote_storage.save(entries);

    this.#dirty = new Set();
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...this.#dirty]));
  }
}


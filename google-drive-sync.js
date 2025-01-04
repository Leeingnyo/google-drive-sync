import { GoogleDriveSyncInternalStorage } from './google-drive-sync-internal-storage.js';
import { GoogleDriveSyncOauthClient } from './google-drive-sync-oauth-client.js';

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

  constructor(config) {
    this.config = config;

    this.#_oauth_client = new GoogleDriveSyncOauthClient(config);
    this.#_internal_storage = new GoogleDriveSyncInternalStorage();
  }

  load(key) {
    return this.#_internal_storage.load(key);
  }
  save(key, value) {
    this.#_internal_storage.save(key, value);
  }
  remove(key) {
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

  async loadRemote(key) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }
  }

  async saveRemote(key, value) {
    if (!this.#_oauth_client.isGoogleReady) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_oauth_client.isUserDriveReady) { throw Error('GoogleDriveSyncNotReady'); }
  }
}


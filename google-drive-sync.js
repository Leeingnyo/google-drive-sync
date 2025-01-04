// polyfill for BigInt
if (BigInt) {
  BigInt.prototype.toJSON = function() { return this.toString(); }
}

// gapi
import {
  getFiles,
  createFile,
  readFile,
} from './google-api.js';
import {
  authorizeGoogle,
  refreshToken,
} from './google-oauth.js';

const GOAUTH_REFRESH_TOKEN_KEY = 'goauth.refreshToken';

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
  // TODO: split into GoogleOauthClient / DriveSync

  #_google_ready;
  #_user_drive_ready;
  #_client;

  constructor(config) {
    this.config = config;

    this.#_google_ready = false;
    this.#_user_drive_ready = false;
  }

  #keytype(key) {
    return `GDS.${key}.type`;
  }

  #keydata(key) {
    return `GDS.${key}.data`;
  }

  load(key) {
    const type = localStorage.getItem(this.#keytype(key));
    if (type === null) {
      return;
    }

    const data = localStorage.getItem(this.#keydata(key));
    if (data === null) {
      return;
    }

    if (type === 'undefined') {
      return;
    } else if (type === 'bigint') {
      return BigInt(JSON.parse(data));
    } else if (type === 'number') {
      return JSON.parse(data);
    } else if (type === 'string') {
      return JSON.parse(data);
    } else if (type === 'boolean') {
      return JSON.parse(data);
    } else if (type === 'object') {
      return JSON.parse(data);
    }
  }

  save(key, value) {
    const type = typeof value;
    if (type === 'symbol' || type === 'function') { // ignored
      return;
    }

    localStorage.setItem(this.#keytype(key), type);
    // type === 'bigint' // nested bigint is transformed into string
    localStorage.setItem(this.#keydata(key), JSON.stringify(value));
    return;
  }

  remove(key) {
    localStorage.removeItem(this.#keytype(key));
    localStorage.removeItem(this.#keydata(key));
  }

  /**
   * 시작하기
   */
  async initGoogleLibrary() {
    console.debug('initialize google api client');
    await new Promise((resolve, reject) => {
      async function initializeGoogleApiClient() {
        try {
          await gapi.client.init({
            discoveryDocs: [
              'https://www.googleapis.com/discovery/v1/apis/oauth2/v1/rest',
              'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
            ],
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      }
      gapi.load('client', initializeGoogleApiClient);
    });
    console.debug('google api client initialized');

    // get access token with refresh token
    if (this.config.useOffline) {
      if (this.config.saveRefreshToken) {
        console.debug('try to get access token');
        const storedRefreshToken = localStorage.getItem(GOAUTH_REFRESH_TOKEN_KEY);
        if (storedRefreshToken) {
          console.debug('refresh token exists');
          console.debug('request access token');
          const token = await refreshToken({ refreshToken: storedRefreshToken });

          this.#handleLogin(token);
        } else {
          console.debug('refresh token doesn\'t exist');
        }
      }
    }

    if (!this.config.useOffline) {
      console.debug('set token client');
      this.#_client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: ['auth/drive.appdata', 'auth/userinfo.email']
          .map(scope => `https://www.googleapis.com/${scope}`)
          .concat(['openid'])
          .join(' '),
        prompt: 'consent',
        callback: this.#handleLogin.bind(this),
      });
    }

    this.#_google_ready = true;
  }

  #handleLogin(token) {
    token.expires_at = +Date.now() + token.expires_in * 1000;
    gapi.client.setToken(token);
    console.debug('access token acquired');

    setTimeout(() => { window.dispatchEvent(new Event('SyncReady')); });

    this.#_user_drive_ready = true;
  }

  /**
   * 로그인하기
   */
  login() {
    if (!this.#_google_ready) { throw Error('GoogleDriveSyncNotInitialized'); }

    if (this.config.useOffline) {
      // authorization code flow with PKCE
      const hasRefreshToken = localStorage.getItem(GOAUTH_REFRESH_TOKEN_KEY);
      const prompt = hasRefreshToken ? 'none' : 'consent';
      authorizeGoogle({ clientId, redirectUrl, prompt, onSuccess: this.#handleLogin.bind(this) });
    } else {
      // implicit flow
      this.#_client.requestAccessToken();
    }
  }

  /**
   * 로그아웃하기
   */
  logout() {
    if (!this.#_google_ready) { throw Error('GoogleDriveSyncNotInitialized'); }

    gapi.client.setToken('');
    console.log('access token revoked');
    localStorage.removeItem(GOAUTH_REFRESH_TOKEN_KEY);
    console.log('refresh token revoked');

    setTimeout(() => { window.dispatchEvent(new Event('UserLogout')); });

    this.#_user_drive_ready = false;
  }

  async loadRemote(key) {
    if (!this.#_google_ready) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_user_drive_ready) { throw Error('GoogleDriveSyncNotReady'); }
  }

  async saveRemote(key, value) {
    if (!this.#_google_ready) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this.#_user_drive_ready) { throw Error('GoogleDriveSyncNotReady'); }
  }
}

async function restoreIndex() {
  console.debug('restore index file');
  const { result: { files } } = await getFiles();
  const indexFile = files.find(({ name }) => name === 'index');

  if (indexFile === undefined) {
    console.debug('no index file');

    const folderIdOptional = localStorage.getItem('folderId');
    const folderId = folderIdOptional ? folderIdOptional : prompt('Insert folderId to store \'index\' file.\nex) https://drive.google.com/drive/u/0/folders/{folderId}');
    localStorage.setItem('folderId', folderId);
    console.debug('folderId:', folderId);

    await createFile({
      name: 'index',
      folderId: folderId,
      mimeType: 'application/json',
      contents: JSON.stringify({}),
    });
    restoreIndex();
    return;
  }

  const { result: index } = await readFile({ fileId: indexFile.id });
  console.log(index);

  // index
}


// gapi
import {
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
 * events
 * - SyncReady
 * - UserLogout
 * - TokenExpired
 */
export class GoogleDriveSync {

  constructor(config) {
    this.config = config;

    this._initialized = false;
    this._ready = false;
  }

  async init() {
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
      this._client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: ['auth/drive.appdata', 'auth/userinfo.email']
          .map(scope => `https://www.googleapis.com/${scope}`)
          .concat(['openid'])
          .join(' '),
        prompt: 'consent',
        callback: this.#handleLogin.bind(this),
      });
    }

    this._initialized = true;
  }

  async #prepareData() {
    setTimeout(() => { window.dispatchEvent(new Event('SyncReady')); });
  }

  #handleLogin(token) {
    token.expires_at = +Date.now() + token.expires_in * 1000;
    gapi.client.setToken(token);
    console.debug('access token acquired');

    this.#prepareData();
  }

  login() {
    if (!this._initialized) { throw Error('GoogleDriveSyncNotInitialized'); }

    if (this.config.useOffline) {
      // authorization code flow with PKCE
      const hasRefreshToken = localStorage.getItem(GOAUTH_REFRESH_TOKEN_KEY);
      const prompt = hasRefreshToken ? 'none' : 'consent';
      authorizeGoogle({ clientId, redirectUrl, prompt, onSuccess: this.#handleLogin.bind(this) });
    } else {
      // implicit flow
      this._client.requestAccessToken();
    }
  }

  logout() {
    gapi.client.setToken('');
    console.log('access token revoked');
    localStorage.removeItem(GOAUTH_REFRESH_TOKEN_KEY);
    console.log('refresh token revoked');

    setTimeout(() => { window.dispatchEvent(new Event('UserLogout')); });
  }

  async load() {
    if (!this._initialized) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this._ready) { throw Error('GoogleDriveSyncNotReady'); }
  }

  async update(name, data) {
    if (!this._initialized) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this._ready) { throw Error('GoogleDriveSyncNotReady'); }
  }

  async sync() {
    if (!this._initialized) { throw Error('GoogleDriveSyncNotInitialized'); }
    if (!this._ready) { throw Error('GoogleDriveSyncNotReady'); }
  }
}


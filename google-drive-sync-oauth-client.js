import {
  authorizeGoogle,
  refreshToken,
} from './google-oauth.js';

const GOAUTH_REFRESH_TOKEN_KEY = 'goauth.refreshToken';

export class GoogleDriveSyncOauthClient {
  #_google_ready;
  #_user_drive_ready;
  #_client;
  #_timeout;
  #_refresh_promise;

  constructor(config) {
    this.config = config;

    this.#_google_ready = false;
    this.#_user_drive_ready = false;
    this.#_refresh_promise = null;
  }

  get isGoogleReady() {
    return this.#_google_ready;
  }

  get isUserDriveReady() {
    return this.#_user_drive_ready;
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

    if (this.#_timeout) {
      clearTimeout(this.#_timeout);
    }
    this.#_timeout = setTimeout(() => {
      window.dispatchEvent(new Event('TokenExpired'));
    }, token.expires_in * 1000);

    this.#_user_drive_ready = true;
  }

  async refreshAccessToken() {
    if (this.#_refresh_promise) {
      return this.#_refresh_promise;
    }
    this.#_refresh_promise = this.#refreshAccessTokenInternal();
    try {
      return await this.#_refresh_promise;
    } finally {
      this.#_refresh_promise = null;
    }
  }

  async #refreshAccessTokenInternal() {
    if (!this.#_google_ready) {
      return false;
    }

    if (this.config.useOffline) {
      const storedRefreshToken = localStorage.getItem(GOAUTH_REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) {
        return false;
      }
      try {
        const token = await refreshToken({ refreshToken: storedRefreshToken });
        if (!token || token.error) {
          return false;
        }
        this.#handleLogin(token);
        return true;
      } catch (error) {
        return false;
      }
    }

    if (!this.#_client) {
      return false;
    }

    return new Promise((resolve) => {
      const originalCallback = this.#_client.callback;
      let done = false;
      const finish = (result) => {
        if (done) {
          return;
        }
        done = true;
        this.#_client.callback = originalCallback;
        resolve(result);
      };

      this.#_client.callback = (token) => {
        if (token?.error) {
          finish(false);
          return;
        }
        this.#handleLogin(token);
        finish(true);
      };

      this.#_client.requestAccessToken({ prompt: '' });
      setTimeout(() => finish(false), 10000);
    });
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
}

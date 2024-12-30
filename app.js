import {
  getUserInfo,
} from './google-api.js';
import {
  GoogleDriveSync,
} from './google-drive-sync.js';

const errorMessage = document.querySelector('#error-message');
const authButton = document.querySelector('#authorize-button');
const revokeButton = document.querySelector('#revoke-button');
const username = document.querySelector('#username');
const restTime = document.querySelector('#rest-time');

const googleDriveSync = new GoogleDriveSync({
  useOffline: true,
  saveRefreshToken: true,
  usePrivate: false,
  flatten: false,
  autoSync: false,
  ignoreConflict: true,
});

googleDriveSync.init();

authButton.addEventListener('click', () => {
  googleDriveSync.login();
});

window.addEventListener('SyncReady', () => {
  revokeButton.style.display = '';
  revokeButton.onclick = () => {
    googleDriveSync.logout();
  };
});
window.addEventListener('UserLogout', () => {
  revokeButton.style.display = 'none';
  revokeButton.onclick = null;
});

window.addEventListener('SyncReady', async () => {
  username.textContent = '(loading...)';
  const { result: userinfo } = await getUserInfo();
  username.textContent = `${userinfo.email}`;
});


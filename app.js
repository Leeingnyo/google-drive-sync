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


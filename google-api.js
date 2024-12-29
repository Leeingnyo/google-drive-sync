async function initializeGoogleApi() {
	await gapi.client.init({
	  discoveryDocs: [
      'https://www.googleapis.com/discovery/v1/apis/oauth2/v1/rest',
      'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
    ],
	});
  if (appReady) {
    appReady();
  }
}
gapi.load('client', initializeGoogleApi);

window.addEventListener('logged-in', ({ detail: token }) => {
	if (gapi.client) {
		gapi.client.setToken(token);
	}
});

function getUserInfo() {
  return gapi.client.oauth2.userinfo.v2.me.get();
}

function getFiles() {
  return gapi.client.drive.files.list();
}

function createDirectory({ name, folderId }) {
  return gapi.client.drive.files.create({
    name,
    ...(folderId ? { parents: [folderId] } : undefined),
    mimeType: 'application/vnd.google-apps.folder',
  });
}

function createFile({ name, folderId, mimeType, contents }) {
  return gapi.client.request({
    path:'/upload/drive/v3/files',
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/related; boundary=________foo_bar_baz________',

    },
    params: {
      uploadType: 'multipart'
    },
    body: `
--________foo_bar_baz________
Content-Type: application/json; charset=UTF-8

${JSON.stringify({
  name,
  ...(folderId ? { parents: [folderId] } : undefined),
})}
--________foo_bar_baz________
Content-Type: ${mimeType}

${contents}
--________foo_bar_baz________--
`.trim()
  });
}

async function createFile2({ name, folderId, mimeType, contents }) {
  
}

function getFile({ fileId }) {
  return gapi.client.drive.files.get({ fileId });
}

function readFile({ fileId }) {
  return gapi.client.drive.files.get({ fileId, alt: 'media' })
}

function updateFile({ fileId, mimeType = '*/*', contents }) {
  if (!fileId) {
     throw Error('\'fieldId\' is required');
  }
  return gapi.client.request({
    path:`/upload/drive/v3/files/${fileId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': mimeType,
    },
    params: {
      uploadType: 'media'
    },
    body: contents
  });
}


export function getUserInfo() {
  return gapi.client.oauth2.userinfo.v2.me.get();
}

export function getFiles({ q, fields } = {}) {
  return gapi.client.drive.files.list({ q, fields });
}

export function createDirectory({ name, folderId }) {
  return gapi.client.drive.files.create({
    name,
    ...(folderId ? { parents: [folderId] } : undefined),
    mimeType: 'application/vnd.google-apps.folder',
  });
}

export function createFile({ name, folderId, mimeType, contents }) {
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

export async function createFile2({ name, folderId, mimeType, contents }) {
  
}

export function getFile({ fileId, fields }) {
  return gapi.client.drive.files.get({ fileId, fiedls });
}

export function readFile({ fileId }) {
  return gapi.client.drive.files.get({ fileId, alt: 'media' })
}

export function getFileRevisions({ fileId, pageSize, pageToken }) {
  return gapi.client.drive.revisions.list({ fileId, pageSize, pageToken });
}

export function getFileRevision({ fileId, revisionId, acknowledgeAbuse }) {
  return gapi.client.drive.revisions.get({ fileId, revisions, acknowledgeAbuse });
}

export function updateFile({ fileId, mimeType = '*/*', contents }) {
  if (!fileId) {
     throw Error('\'fileId\' is required');
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

export function deleteFile({ fileId }) {
  if (!fileId) {
    throw Error('\'fileId\' is required');
  }
  return gapi.client.drive.files.delete({ fileId });
}


import { // gapi
  getFiles,
  createFile,
  getFileRevisions,
  getFileRevision,
  readFile,
  updateFile,
} from './google-api.js';

const MODIFIED_TIME_KEY = 'GDS.modifiedTime';

export class GoogleDriveSyncRemoteStorage {
  #config;

  #indexFileInfo;
  #indexFileContent;
  #modifiedTime;

  // #remoteData;

  constructor(config) {
    this.#config = config;

    this.#modifiedTime = JSON.parse(localStorage.getItem(MODIFIED_TIME_KEY));
  }

  #getRemoteFileName(key) {
    return `${key}.data`;
  }

  async #getIndexFileInfo(cache = true) {
    if (cache && this.#indexFileInfo) {
      return this.#indexFileInfo;
    }
    this.#indexFileInfo = await getIndexFileInfo();
    return this.#indexFileInfo;
  }

  async #readIndexFile(cache = true) {
    if (cache && this.#indexFileContent) {
      return this.#indexFileContent;
    }
    const { id } = await this.#getIndexFileInfo();
    console.debug('[API] read file:', 'index');
    const { result: indexFileContent } = await readFile({ fileId: id });
    return this.#indexFileContent = indexFileContent;
  }

  async #updateIndexFile(key, value, fileId, stringValue_, hash_) {
    const { id } = await this.#getIndexFileInfo();
    const stringValue = stringValue_ ?? JSON.stringify(value);
    const hash = hash_ ?? await digestMessage(stringValue);
    const indexFileContent = await this.#readIndexFile(false);
    indexFileContent[key] = {
      ...indexFileContent[key],
      fileId,
      hash,
    };

    this.#indexFileContent = indexFileContent;

    console.debug('[API] udpate index file');
    await updateFile({ fileId: id, mimeType: 'application/json', contents: indexFileContent });
  }

  // TODO: caching
  /*
  async #getRemoteData() {
    if (this.#remoteData === undefined) {
      this.#remoteData = {};
    }
    return this.#remoteData;
  }
  */

  async load(key) {
    // TODO: caching
    // const indexFileId = await this.#getIndexFileId();
    // 안 바뀌었으면
    // TODO: caching
    /*
    const [modified, lastModified] = await isIndexFileModified(indexFileId, this.#lastModified);
    if (!modified) {
      // 캐시 데이터 리턴
      const cachedData = this.#getRemoteData();
      return cachedData[key];
    }
    */

    // TODO: caching
    // save last modified
    /*
    this.#lastModified = lastModified;
    localStorage.setItem(MODIFIED_TIME_KEY, JSON.stringify(lastModified));
    */

    // TODO: caching
    // const indexFileContent = await readIndexFile(indexFileId);

    // 파일 데이터 읽음
    return this.#readData(key);

    
    // 캐시 데이터에 반영
    // 리턴
  }

  async save(key, value) {
    console.debug('save remote', key, value);
    const { modifiedTime: modifiedTimeString } = await this.#getIndexFileInfo(false); // 새로 가져옴
    const modifiedTime = +new Date(modifiedTimeString);
    const isModified = this.#modifiedTime < modifiedTime; // 남이 수정했는지 여부 체크

    // TODO: 캐시 데이터에 반영
    // const cachedData = this.#getRemoteData();
    // cachedData[key] = value;

    // index 해시 같은 값이면 업데이트 안 함
    const stringValue = JSON.stringify(value);
    const hash = await digestMessage(stringValue);
    const indexFileContent = await this.#readIndexFile();
    if (indexFileContent[key].hash === hash) {
      console.debug(key, 'not changed');
      return;
    }
    console.debug(key, 'changed');

    // 파일 업데이트
    const { id: fileId } = await this.#updateData(key, value, stringValue);
    // index 파일 업데이트
    {
      await this.#updateIndexFile(key, value, fileId, stringValue, hash);
      const { modifiedTime: modifiedTimeString } = await this.#getIndexFileInfo(false);
      const modifiedTime = +new Date(modifiedTimeString);

      this.#modifiedTime = modifiedTime;
      localStorage.setItem(MODIFIED_TIME_KEY, JSON.stringify(modifiedTime));
    }
  }

  async #readData(key) {
    // TODO: caching
    console.debug('[API] get file:', key);
    const { result: { files: files } } = await getFiles({ q: `name = '${this.#getRemoteFileName(key)}'` });
    const targetFile = files.find(({ name }) => name === this.#getRemoteFileName(key));
    
    if (targetFile) {
      console.debug('[API] read file:', key);
      const { result: fileContent } = await readFile({ fileId: targetFile.id });
      return fileContent;
    } else {
      return;
    }
  }

  async #updateData(key, value, stringValue_) {
    const stringValue = stringValue_ ?? JSON.stringify(value);

    // TODO: caching
    console.debug('[API] get file:', key);
    const { result: { files: files } } = await getFiles({ q: `name = '${this.#getRemoteFileName(key)}'` });
    const targetFile = files.find(({ name }) => name === this.#getRemoteFileName(key));

    if (targetFile) {
      console.debug('[API] update file:', key);
      const { result } = await updateFile({ fileId: targetFile.id, mimeType: 'text/plain', contents: stringValue });
      return result;
    } else {
      console.debug('[API] create file:', key);
      const { result } = await createFile({ name: this.#getRemoteFileName(key), mimeType: 'text/plain', contents: stringValue });
      return result;
    }
  }
}

async function getIndexFileInfo() {
  console.debug('[API] get index file info');
  const { result: { files } } = await getFiles({ q: 'name = \'index\'', fields: `files(${['id', 'name', 'mimeType', 'modifiedTime', 'headRevisionId'].join(', ')})` });
  const indexFile = files.find(({ name }) => name === 'index');

  if (indexFile === undefined) {
    console.debug('no index file');

    await createIndexFile();
    return getIndexFileInfo();
  }

  return indexFile;

  async function createIndexFile() {
    console.log('[API] create index file');
    const folderIdOptional = localStorage.getItem('folderId');
    const folderId = folderIdOptional ? folderIdOptional :
      prompt('Insert folderId to store \'index\' file.\nex) https://drive.google.com/drive/u/0/folders/{folderId}');
    localStorage.setItem('folderId', folderId);
    console.debug('folderId:', folderId);

    await createFile({
      name: 'index',
      folderId: folderId,
      mimeType: 'application/json',
      contents: JSON.stringify({}),
    });
  }
}

// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
async function digestMessage(message, algorithm = 'SHA-1') {
  const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
  const hashBuffer = await window.crypto.subtle.digest(algorithm, msgUint8); // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(''); // convert bytes to hex string
  return hashHex;
}


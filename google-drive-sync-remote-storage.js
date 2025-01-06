import { // gapi
  getFiles,
  createFile,
  getFileRevisions,
  getFileRevision,
  readFile,
  updateFile,
  deleteFile,
} from './google-api.js';

const MODIFIED_TIME_KEY = 'GDS.modifiedTime';

export class GoogleDriveSyncRemoteStorage {
  #config;

  #indexFileInfo;
  #indexFileContent;
  #modifiedTime;

  constructor(config) {
    this.#config = config;

    this.#modifiedTime = JSON.parse(localStorage.getItem(MODIFIED_TIME_KEY)) ?? undefined;
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

  async #updateIndexFile(modifiedData) {
    const indexFileContent = await this.#readIndexFile(false);

    await Promise.all(modifiedData.map(async ({ type, key, value, fileId, stringValue_, hash_ }) => {
      if (type === 'save') {
        const stringValue = stringValue_ ?? JSON.stringify(value);
        const hash = hash_ ?? await digestMessage(stringValue);
        indexFileContent[key] = {
          ...indexFileContent[key],
          fileId,
          hash,
        };
      } else if (type === 'remove') {
        delete indexFileContent[key];
      }
    }));

    this.#indexFileContent = indexFileContent;

    const { id } = await this.#getIndexFileInfo();
    console.debug('[API] udpate index file');
    await updateFile({ fileId: id, mimeType: 'application/json', contents: indexFileContent });
  }

  /**
   * @returns Promise<Array<Promise<any>>>
   */
  async load(entries, force = false) {
    console.debug('load remote', entries);
    const { modifiedTime: modifiedTimeString } = await this.#getIndexFileInfo(false); // 새로 가져옴
    const modifiedTime = +new Date(modifiedTimeString);
    const isModified =
        this.#modifiedTime === undefined || // 인덱스 파일이 없거나
        this.#modifiedTime < modifiedTime; // 남이 수정했는지 여부 체크

    if (!isModified && !force) {
      console.debug('not modified, return internalData');
      return entries.map(async ({ internalData }) => internalData);
    }

    // save last modified
    this.#modifiedTime = modifiedTime;
    localStorage.setItem(MODIFIED_TIME_KEY, JSON.stringify(modifiedTime));

    return entries.map(async ({ key, internalData }) => {
      // index 해시 같은 값이면 fetch 안 함
      const stringValue = JSON.stringify(internalData);
      const hash = await digestMessage(stringValue);
      const indexFileContent = await this.#readIndexFile();
      if (indexFileContent[key]?.hash === hash) {
        console.debug(key, 'same');
        return internalData;
      }
      console.debug(key, 'not same');

      // 파일 데이터 읽음
      return this.#readData(key);
    });
  }

  async save(entries) {
    console.debug('save remote', entries);
    const { modifiedTime: modifiedTimeString } = await this.#getIndexFileInfo(false); // 새로 가져옴
    const modifiedTime = +new Date(modifiedTimeString);
    const isModified =
        this.#modifiedTime !== undefined && // 인덱스 파일이 없고
        this.#modifiedTime < modifiedTime; // 남이 수정했는지 여부 체크

    if (isModified) {
      throw Error('Conflict! load remote first');
    }

    const updatedEntries = (await Promise.all(entries.map(async ({ type, key, value }) => {
      if (type === 'save') {
        // index 해시 같은 값이면 업데이트 안 함
        const stringValue = JSON.stringify(value);
        const hash = await digestMessage(stringValue);
        const indexFileContent = await this.#readIndexFile();
        if (indexFileContent[key]?.hash === hash) {
          console.debug(key, 'not changed');
          return;
        }
        console.debug(key, 'changed');

        // 파일 업데이트
        const { id: fileId } = await this.#updateData(key, value, stringValue);

        return {
          type,
          key,
          value,
          fileId,
          stringValue,
          hash,
        };
      } else if (type === 'remove') {
        await this.#removeFile(key);

        return {
          type,
          key,
        };
      }
    }))).filter(i => i);

    // index 파일 업데이트
    if (updatedEntries.length > 0) {
      await this.#updateIndexFile(updatedEntries);
      const { modifiedTime: modifiedTimeString } = await this.#getIndexFileInfo(false);
      const modifiedTime = +new Date(modifiedTimeString);

      this.#modifiedTime = modifiedTime;
      localStorage.setItem(MODIFIED_TIME_KEY, JSON.stringify(modifiedTime));
    }
  }

  // ----------- 개별 파일 관련 -----------
  #getRemoteFileName(key) {
    return `${key}.data`;
  }

  async #getFileId(key) {
    const indexFileContent = await this.#readIndexFile();
    const fileIdInIndex = indexFileContent[key]?.fileId;
    if (fileIdInIndex) {
      return fileIdInIndex;
    }

    console.debug('[API] get file:', key);
    const { result: { files: files } } = await getFiles({ q: `name = '${this.#getRemoteFileName(key)}'` });
    const targetFile = files.find(({ name }) => name === this.#getRemoteFileName(key));
    return targetFile?.id;
  }

  async #readData(key) {
    const fileId = await this.#getFileId(key);
    
    if (fileId) {
      console.debug('[API] read file:', key);
      const { result: fileContent } = await readFile({ fileId });
      return fileContent;
    } else {
      return;
    }
  }

  async #updateData(key, value, stringValue_) {
    const stringValue = stringValue_ ?? JSON.stringify(value);

    const fileId = await this.#getFileId(key);

    if (fileId) {
      console.debug('[API] update file:', key);
      const { result } = await updateFile({ fileId, mimeType: 'text/plain', contents: stringValue });
      return result;
    } else {
      const { parents } = await this.#getIndexFileInfo();
      console.debug('[API] create file:', key);
      const { result } = await createFile({ name: this.#getRemoteFileName(key), mimeType: 'text/plain', contents: stringValue, folderId: parents[0] });
      return result;
    }
  }

  async #removeFile(key) {
    const fileId = await this.#getFileId(key);

    if (fileId) {
      console.debug('[API] delete file:', key);
      const { result } = await deleteFile({ fileId });
    }
  }
}

async function getIndexFileInfo() {
  console.debug('[API] get index file info');
  const { result: { files } } = await getFiles({ q: 'name = \'index\'', fields: `files(${['id', 'name', 'mimeType', 'modifiedTime', 'headRevisionId', 'parents'].join(', ')})` });
  const indexFile = files.find(({ name }) => name === 'index');

  if (indexFile === undefined) {
    console.debug('no index file');

    await createIndexFile();
    return getIndexFileInfo();
  }

  return indexFile;

  async function createIndexFile() {
    console.debug('[API] create index file');
    const folderId = prompt('Insert folderId to store \'index\' file.\nex) https://drive.google.com/drive/u/0/folders/{folderId}');
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


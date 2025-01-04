export class GoogleDriveSyncInternalStorage {
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
  }

  remove(key) {
    localStorage.removeItem(this.#keytype(key));
    localStorage.removeItem(this.#keydata(key));
  }
}


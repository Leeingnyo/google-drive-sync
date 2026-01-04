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
    }

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      this.remove(key);
      return;
    }

    if (type === 'bigint') {
      try {
        return BigInt(parsed);
      } catch (error) {
        this.remove(key);
        return;
      }
    } else if (type === 'number') {
      return parsed;
    } else if (type === 'string') {
      return parsed;
    } else if (type === 'boolean') {
      return parsed;
    } else if (type === 'object') {
      return parsed;
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

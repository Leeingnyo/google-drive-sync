# Google Drive Sync

Save localStorage data into google drive for cross-access database in SPA.

## How to Use

### Prepare Google OAuth 2.0 Client

1. Follow [this link](https://developers.google.com/identity/protocols/oauth2#1.-obtain-oauth-2.0-credentials-from-the-dynamic_data.setvar.console_name-.), and make 'web' client type.
2. set `clientId` in `config.js`

```js
// config.js
const clientId = '<your client id>';
```

3. If you want to enable 'Authorization Code Flow', add `redirectUrl` in `config.js` and `clientSecret` in `secret.js`. Notice that leaking `clientSecret` is vulnerable.

```js
// config.js
const clientId = '<your client id>';
const redirectUrl = '<redirect page url>';
```

```js
// secret.js
const clientSecret = '<your client secret>';
```

### Make Instance

```js
const googleDriveSync = new GoogleDriveSync({
  useOffline: true, // require redirectUrl, clientSecret
  saveRefreshToken: true,
});
```

### Methods & Events

Methods

* local storage methods
  * load(key)
  * save(key, value)
  * remove(key)
* google methods
  * initGoogleLibrary
  * login
  * logout
* remote storage methods
  * loadRemote(key, options?) // options.merge or merge function
  * loadRemoteForce(key)
  * saveRemote(key, value)
  * removeRemote(key)
  * syncRemote()

Events

* SyncReady
* UserLogout
* TokenExpired

### Example

```js

const googleDriveSync = new GoogleDriveSync({
  useOffline: true,
  saveRefreshToken: true,
});

googleDriveSync.initGoogleLibrary();

const button = document.querySelector('button');
button.addEventListener('click', () => {
  googleDriveSync.login();
});

window.addEventListener('SyncReady', async () => {
  const localFoo = googleDriveSync.load('foo');
  const remoteFoo = await googleDriveSync.loadRemote('foo');
  const localFoo2 = googleDriveSync.load('foo'); // remoteFoo and localFoo2 are same

  await googleDriveSync.saveRemote('foo', { hello: 'world' });
  await googleDriveSync.saveRemote('foo', { hello: 'world' }); // ignored

  googleDriveSync.save('bar', {}); // no remote sync
  googleDriveSync.save('foo', { asdf: 'asdf' }); // no remote sync
  await googleDriveSync.saveRemote('baz', 'baz'); // sync 'bar', 'foo', 'baz' at this time
});
```

### Conflict Resolution (Merge)

`loadRemote` can accept a merge callback when local data is dirty/removed and remote differs.

```js
const remoteFoo = await googleDriveSync.loadRemote('foo', {
  merge: (localValue, remoteValue, key) => localValue,
});
```

You can also pass the merge function directly as the second argument:

```js
const remoteFoo = await googleDriveSync.loadRemote('foo', (localValue, remoteValue) => remoteValue);
```

Built-in helpers are exported from `google-drive-sync-merge.js`:

* mergeLastWriteWins: prefers newer `updatedAt`/`modifiedAt` if present, otherwise local
* mergeDeep: deep merge for plain objects (arrays keep local)
* mergeByConfirm: prompts user to choose local vs remote

```js
import { mergeDeep } from './google-drive-sync-merge.js';

const remoteFoo = await googleDriveSync.loadRemote('foo', { merge: mergeDeep });
```

## TODO

* Fix some bugs when data files have deleted in google drive by user
  * Please remove the index file to fix this bug

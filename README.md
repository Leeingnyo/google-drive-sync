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
  * loadRemote(key)
  * saveRemote(key, value)
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

## TODO

* Implement removeRemote(key)
* Implement loadRemoteBulk (interface)
* Implement methods to resolve conflict
* Implement mutex in saveRemote
* Fix some bugs when data files have deleted in google drive by user
  * Please remove the index file to fix this bug


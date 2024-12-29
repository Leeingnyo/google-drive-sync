let removeOnMessage;
function authorizeGoogle({
  clientId,
  redirectUrl,
  prompt = 'none',
  state = Math.random(),
}) {
  const codeVerifier = `${Math.random()}${Math.random()}${Math.random()}${Math.random()}${Math.random()}`;
  const codeChallenge = codeVerifier;
  const path = 'https://accounts.google.com/o/oauth2/v2/auth';
  const queryParams = {
    client_id: clientId,
    redirect_uri: redirectUrl,
    response_type: 'code',
    scope: ['auth/drive.file']
        .map(scope => `https://www.googleapis.com/${scope}`)
        .join(' '),
    access_type: 'offline',

    code_challenge: codeChallenge,
    code_challenge_method: 'plain',

    prompt,
    state: state,
    include_granted_scopes: true,
  };

  const url = new URL(path);
  url.search = new URLSearchParams(queryParams);

  const popupWindow = window.open(url.href, 'oauth2', 'popup=true');

  function onFocus() {
    if (!popupWindow.closed) {
      return;
    }

    const token = JSON.parse(localStorage.getItem('goauth'));
    if (token) {
      handleLogin(token);
    }
    window.removeEventListener('focus', onFocus);
  };
  window.addEventListener('focus', onFocus);

  function onMessage(e) {
    if (e.origin !== location.origin) {
      return;
    }
    if (e.data.type !== 'request_code_verifier') {
      return;
    }

    popupWindow.postMessage({ type: 'code_verifier', codeVerifier });

    window.removeEventListener('message', onMessage);
    removeOnMessage = undefined;
  }
  if (removeOnMessage) {
    removeOnMessage();
  }
  window.addEventListener('message', onMessage);
  removeOnMessage = () => {
    window.removeEventListener('message', onMessage);
  };
};

function refreshToken({
  refreshToken,
}) {
  fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'referer': undefined,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: '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',
      redirect_uri: redirectUrl,
    }).toString()
  }).then(r => r.json())
  .then(token => {
    console.log(token);
    localStorage.setItem('goauth', JSON.stringify(token));
    // window.close();
  });
}


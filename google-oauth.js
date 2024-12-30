// authorization code flow
let removeOnMessageRequestCodeVerifier;
let removeOnMessageReceiveToken;
export function authorizeGoogle({
  clientId,
  redirectUrl,
  prompt = 'none',
  state = Math.random(),

  onSuccess,
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

  function onMessageRequestCodeVerifier(e) {
    if (e.origin !== location.origin) {
      return;
    }
    if (e.data.type !== 'request_code_verifier') {
      return;
    }

    popupWindow.postMessage({ type: 'code_verifier', codeVerifier });

    window.removeEventListener('message', onMessageRequestCodeVerifier);
    removeOnMessageRequestCodeVerifier = undefined;
  }
  if (removeOnMessageRequestCodeVerifier) {
    removeOnMessageRequestCodeVerifier();
  }
  window.addEventListener('message', onMessageRequestCodeVerifier);
  removeOnMessageRequestCodeVerifier = () => {
    window.removeEventListener('message', onMessageRequestCodeVerifier);
  };

  function onMessageReceiveToken(e) {
    if (e.origin !== location.origin) {
      return;
    }
    const { type, token } = e.data;
    if (type !== 'send_token_result') {
      return;
    }

    onSuccess?.(token);

    window.removeEventListener('message', onMessageReceiveToken);
    removeOnMessageReceiveToken = undefined;
  }
  if (removeOnMessageReceiveToken) {
    removeOnMessageReceiveToken();
  }
  window.addEventListener('message', onMessageReceiveToken);
  removeOnMessageReceiveToken = () => {
    window.removeEventListener('message', onMessageReceiveToken);
  };
};

export function refreshToken({
  refreshToken,
}) {
  return fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'referer': undefined,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUrl,
    }).toString()
  }).then(r => r.json())
}


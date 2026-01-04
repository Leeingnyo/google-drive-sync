// authorization code flow
let removeOnMessageRequestCodeVerifier;
let removeOnMessageReceiveToken;
export async function authorizeGoogle({
  clientId,
  redirectUrl,
  prompt = 'none',
  state = createRandomString(16),

  onSuccess,
}) {
  const codeVerifier = createRandomString(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
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
    code_challenge_method: 'S256',

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

function createRandomString(length) {
  if (!window.crypto?.getRandomValues) {
    return `${Math.random()}`.repeat(Math.ceil(length / 10)).slice(0, length);
  }
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}

async function createCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  if (!window.crypto?.subtle?.digest) {
    return codeVerifier;
  }
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

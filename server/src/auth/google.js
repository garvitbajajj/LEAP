/**
 * Google OAuth 2.0 authorization-code flow with PKCE (RFC 7636).
 * Pure helpers - `fetchImpl` is injectable so tests never call Google.
 */
const crypto = require('crypto');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const base64url = (buf) => buf.toString('base64url');

/** PKCE S256: the challenge goes to Google up front, the verifier only at code exchange. */
function pkceChallenge(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

function newFlow() {
  const verifier = base64url(crypto.randomBytes(32));
  return { state: base64url(crypto.randomBytes(16)), verifier, challenge: pkceChallenge(verifier) };
}

function authorizationUrl({ clientId, redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${params}`;
}

async function exchangeCode({
  code, verifier, clientId, clientSecret, redirectUri, fetchImpl = fetch,
}) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const tokens = await res.json();
  if (!tokens.access_token) throw new Error('token exchange returned no access token');
  return tokens;
}

/** Returns { googleId, email, name } for a Google account with a verified email. */
async function fetchProfile(accessToken, fetchImpl = fetch) {
  const res = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
  const p = await res.json();
  if (!p.email || p.email_verified !== true) throw new Error('Google account email is not verified');
  return { googleId: p.sub, email: p.email.toLowerCase(), name: p.name || p.email.split('@')[0] };
}

module.exports = {
  newFlow, pkceChallenge, authorizationUrl, exchangeCode, fetchProfile,
};

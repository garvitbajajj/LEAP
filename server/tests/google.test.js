process.env.NODE_ENV = 'test';
const request = require('supertest');
const config = require('../src/config');
const google = require('../src/auth/google');
const { createApp } = require('../src/app');

const res = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });

describe('Google OAuth helpers', () => {
  test('PKCE challenge matches the RFC 7636 test vector', () => {
    expect(google.pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  test('each flow gets a fresh state and a verifier that matches its challenge', () => {
    const a = google.newFlow();
    const b = google.newFlow();
    expect(a.state).not.toBe(b.state);
    expect(google.pkceChallenge(a.verifier)).toBe(a.challenge);
  });

  test('the authorization URL requests S256 PKCE and the OpenID scopes', () => {
    const url = new URL(google.authorizationUrl({ clientId: 'cid', redirectUri: 'http://x/cb', state: 's1', challenge: 'c1' }));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'cid', response_type: 'code', state: 's1', code_challenge: 'c1', code_challenge_method: 'S256',
    });
    expect(url.searchParams.get('scope')).toContain('email');
  });

  test('code exchange posts the verifier and secret as a form', async () => {
    const fetchImpl = jest.fn(() => res(200, { access_token: 'at' }));
    await google.exchangeCode({ code: 'c', verifier: 'v', clientId: 'id', clientSecret: 'sec', redirectUri: 'r', fetchImpl });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(opts.body)).toMatchObject({ code: 'c', code_verifier: 'v', client_secret: 'sec', grant_type: 'authorization_code' });
  });

  test('a failed code exchange throws', async () => {
    await expect(google.exchangeCode({ code: 'c', fetchImpl: () => res(400, {}) })).rejects.toThrow(/400/);
  });

  test('profiles must have a verified email, and emails are normalised', async () => {
    const ok = await google.fetchProfile('at', () => res(200, { sub: 'g1', email: 'Asha@Example.com', email_verified: true, name: 'Asha' }));
    expect(ok).toEqual({ googleId: 'g1', email: 'asha@example.com', name: 'Asha' });
    await expect(google.fetchProfile('at', () => res(200, { sub: 'g2', email: 'x@y.z', email_verified: false })))
      .rejects.toThrow(/not verified/);
  });
});

describe('Google OAuth routes', () => {
  const app = createApp();
  const saved = { ...config.google };
  afterEach(() => Object.assign(config.google, saved));

  test('providers reports Google as unavailable without credentials', async () => {
    config.google.clientId = '';
    const r = await request(app).get('/api/v1/auth/providers');
    expect(r.body).toEqual({ password: true, google: false });
  });

  test('starting sign-in redirects to Google with PKCE and sets the flow cookie', async () => {
    Object.assign(config.google, { clientId: 'cid', clientSecret: 'sec' });
    const r = await request(app).get('/api/v1/auth/google');
    expect(r.status).toBe(302);
    const target = new URL(r.headers.location);
    expect(target.hostname).toBe('accounts.google.com');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = r.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/leap_oauth=.+\..+/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test('a callback whose state does not match the cookie is rejected', async () => {
    const r = await request(app)
      .get('/api/v1/auth/google/callback?code=abc&state=attacker')
      .set('Cookie', 'leap_oauth=real-state.verifier');
    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/oauth=state_mismatch/);
  });

  test('a callback without the flow cookie is rejected', async () => {
    const r = await request(app).get('/api/v1/auth/google/callback?code=abc&state=s');
    expect(r.headers.location).toMatch(/oauth=state_mismatch/);
  });

  test('a user cancelling at Google is sent back with a clear reason', async () => {
    const r = await request(app).get('/api/v1/auth/google/callback?error=access_denied');
    expect(r.headers.location).toMatch(/oauth=denied/);
  });
});

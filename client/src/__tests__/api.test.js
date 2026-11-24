import { beforeEach, describe, expect, test, vi } from 'vitest';
import { api, setUnauthorisedHandler, tokenStore } from '../api';

const json = (status, body) => Promise.resolve({
  ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body),
});
const expired = () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });

beforeEach(() => {
  tokenStore.set('old-access');
  setUnauthorisedHandler(() => {});
});

describe('silent token refresh', () => {
  test('an expired token is refreshed once and the request is retried', async () => {
    const calls = [];
    globalThis.fetch = vi.fn((url, opts) => {
      calls.push([url, opts.headers.Authorization]);
      if (url.endsWith('/auth/refresh')) return json(200, { token: 'new-access', user: {} });
      return opts.headers.Authorization === 'Bearer new-access' ? json(200, { ok: 1 }) : expired();
    });
    await expect(api('/me')).resolves.toEqual({ ok: 1 });
    expect(calls.map(([u]) => u)).toEqual(['/api/v1/me', '/api/v1/auth/refresh', '/api/v1/me']);
    expect(tokenStore.get()).toBe('new-access');
  });

  test('concurrent expired requests share a single refresh call', async () => {
    let refreshes = 0;
    globalThis.fetch = vi.fn((url, opts) => {
      if (url.endsWith('/auth/refresh')) { refreshes += 1; return json(200, { token: 'new-access', user: {} }); }
      return opts.headers.Authorization === 'Bearer new-access' ? json(200, { ok: 1 }) : expired();
    });
    await Promise.all([api('/a'), api('/b'), api('/c')]);
    expect(refreshes).toBe(1);
  });

  test('a failed refresh signs the user out and surfaces the original error', async () => {
    const signedOut = vi.fn();
    setUnauthorisedHandler(signedOut);
    globalThis.fetch = vi.fn((url) => (url.endsWith('/auth/refresh')
      ? json(401, { error: { code: 'REFRESH_TOKEN_REUSED' } })
      : expired()));
    await expect(api('/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  test('a request is retried at most once', async () => {
    globalThis.fetch = vi.fn((url) => (url.endsWith('/auth/refresh')
      ? json(200, { token: 'still-bad', user: {} })
      : expired()));
    await expect(api('/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});

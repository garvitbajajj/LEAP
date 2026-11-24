/**
 * Thin fetch wrapper. Attaches the access JWT and parses the shared error envelope
 * into an ApiError. When the access token has expired it silently exchanges the
 * HttpOnly refresh cookie for a new one and retries the request once; concurrent
 * requests that all hit an expired token share that single refresh.
 */
const BASE = import.meta.env.VITE_API_URL || '/api/v1';
const TOKEN_KEY = 'leap.token';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

let onUnauthorised = () => {};
export const setUnauthorisedHandler = (fn) => { onUnauthorised = fn; };

async function request(path, { method = 'GET', body, keepalive } = {}, { retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, headers, keepalive, credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the LEAP server. Is it running?');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (res.ok) return data;

  const e = data?.error || {};
  const failure = new ApiError(res.status, e.code || 'HTTP_ERROR', e.message || `Request failed (${res.status})`, e.details);

  if (res.status === 401 && retry && e.code === 'TOKEN_EXPIRED') {
    try {
      await refreshSession();
    } catch {
      onUnauthorised();
      throw failure;
    }
    return request(path, { method, body, keepalive }, { retry: false });
  }
  if (res.status === 401 && e.code === 'INVALID_TOKEN') onUnauthorised();
  throw failure;
}

let inFlightRefresh = null;

/** Trades the refresh cookie for a new access token. Concurrent callers share one call. */
export function refreshSession() {
  if (!inFlightRefresh) {
    inFlightRefresh = request('/auth/refresh', { method: 'POST' }, { retry: false })
      .then((session) => {
        tokenStore.set(session.token);
        return session;
      })
      .finally(() => { inFlightRefresh = null; });
  }
  return inFlightRefresh;
}

export const api = (path, options) => request(path, options);

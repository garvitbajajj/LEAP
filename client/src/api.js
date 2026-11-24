/**
 * Thin fetch wrapper. Attaches the JWT, parses the shared error envelope into an
 * ApiError, and signs the user out on an expired or invalid token.
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

export async function api(path, { method = 'GET', body, keepalive } = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, headers, keepalive, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the LEAP server. Is it running?');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error || {};
    if (res.status === 401 && ['INVALID_TOKEN', 'TOKEN_EXPIRED'].includes(e.code)) onUnauthorised();
    throw new ApiError(res.status, e.code || 'HTTP_ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

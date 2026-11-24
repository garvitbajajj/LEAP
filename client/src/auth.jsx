import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api, refreshSession, setUnauthorisedHandler, tokenStore,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  /** Forgets the session locally - used when the server has already rejected it. */
  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setProfile(null);
  }, []);

  /** User-initiated logout: revoke the refresh token on the server too. */
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    clearSession();
  }, [clearSession]);

  const refresh = useCallback(async () => {
    const me = await api('/me');
    setUser(me.user);
    setProfile(me.profile);
    return me;
  }, []);

  // On load, resume from the stored access token, or silently from the refresh cookie
  // (which is also how a Google sign-in lands back in the app).
  useEffect(() => {
    setUnauthorisedHandler(clearSession);
    const resume = tokenStore.get() ? refresh() : refreshSession().then(refresh);
    resume.catch(clearSession).finally(() => setLoading(false));
  }, [clearSession, refresh]);

  const start = useCallback(async (session) => {
    tokenStore.set(session.token);
    setUser(session.user);
    await refresh();
  }, [refresh]);

  const login = useCallback((email, password) => api('/auth/login', { method: 'POST', body: { email, password } }).then(start), [start]);
  const loginWithOtp = useCallback((email, code) => api('/auth/otp/verify', { method: 'POST', body: { email, code, purpose: 'login_otp' } }).then(start), [start]);
  const register = useCallback((name, email, password) => api('/auth/register', { method: 'POST', body: { name, email, password } }).then(start), [start]);

  const value = useMemo(() => ({
    user, profile, loading, login, loginWithOtp, register, logout, refresh, setProfile,
  }), [user, profile, loading, login, loginWithOtp, register, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

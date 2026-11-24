import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorisedHandler, tokenStore } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setProfile(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api('/me');
    setUser(me.user);
    setProfile(me.profile);
    return me;
  }, []);

  useEffect(() => {
    setUnauthorisedHandler(logout);
    if (!tokenStore.get()) return;
    refresh().catch(logout).finally(() => setLoading(false));
  }, [logout, refresh]);

  const start = useCallback(async (session) => {
    tokenStore.set(session.token);
    setUser(session.user);
    await refresh();
  }, [refresh]);

  const login = useCallback((email, password) => api('/auth/login', { method: 'POST', body: { email, password } }).then(start), [start]);
  const register = useCallback((name, email, password) => api('/auth/register', { method: 'POST', body: { name, email, password } }).then(start), [start]);

  const value = useMemo(() => ({
    user, profile, loading, login, register, logout, refresh, setProfile,
  }), [user, profile, loading, login, register, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

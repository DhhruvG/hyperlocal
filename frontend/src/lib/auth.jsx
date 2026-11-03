import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const persistToken = (token) => {
    if (token) localStorage.setItem('lp_token', token);
  };

  const loginConsumer = async (email, password) => {
    const { data } = await api.post(`/auth/login?role=consumer`, { email, password });
    persistToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const loginVendor = async (email, password) => {
    const { data } = await api.post(`/auth/login?role=vendor`, { email, password });
    persistToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const registerConsumer = async (payload) => {
    const { data } = await api.post('/auth/consumer/register', payload);
    persistToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const registerVendor = async (payload) => {
    const { data } = await api.post('/auth/vendor/register', payload);
    persistToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('lp_token');
    setUser(false);
  };

  const refresh = fetchMe;

  return (
    <AuthContext.Provider value={{ user, loading, loginConsumer, loginVendor, registerConsumer, registerVendor, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

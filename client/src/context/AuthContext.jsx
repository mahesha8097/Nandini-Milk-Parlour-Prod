import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(true);

  const checkStatus = async () => {
    try {
      const status = await api.get('/auth/init-status');
      setHasAdmin(status.hasAdmin);

      const token = localStorage.getItem('nandini_token');
      if (token) {
        const meData = await api.get('/auth/me');
        setUser(meData.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Auth verification error:', err);
      localStorage.removeItem('nandini_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('nandini_token', res.token);
    setUser(res.user);
    return res.user;
  };

  const registerAdmin = async (adminData) => {
    const res = await api.post('/auth/register-admin', adminData);
    localStorage.setItem('nandini_token', res.token);
    setUser(res.user);
    setHasAdmin(true);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('nandini_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, hasAdmin, login, registerAdmin, logout, refreshUser: checkStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

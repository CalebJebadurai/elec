import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getMe()
        .then(setUser)
        .catch(() => {
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (mobile, firebaseIdToken) => {
    const result = await api.verifyOtp(mobile, firebaseIdToken);
    api.setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const linkGoogle = useCallback(async (googleIdToken, googleAccessToken) => {
    await api.linkGoogle(googleIdToken, googleAccessToken);
    const updated = await api.getMe();
    setUser(updated);
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data) => {
    await api.updateMe(data);
    const updated = await api.getMe();
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, linkGoogle, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../api';
import type { User, UserProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (mobile: string, firebaseIdToken: string) => Promise<User>;
  logout: () => void;
  linkGoogle: (googleIdToken: string, googleAccessToken: string) => Promise<void>;
  updateProfile: (data: UserProfile) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api
        .getMe()
        .then(setUser)
        .catch(() => {
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (mobile: string, firebaseIdToken: string) => {
    const result = await api.verifyOtp(mobile, firebaseIdToken);
    api.setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const linkGoogle = useCallback(async (googleIdToken: string, googleAccessToken: string) => {
    await api.linkGoogle(googleIdToken, googleAccessToken);
    const updated = await api.getMe();
    setUser(updated);
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data: UserProfile) => {
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

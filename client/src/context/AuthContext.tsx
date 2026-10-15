import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export interface User {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  role: string;
  roleNameAr: string;
  permissions: string[];
  allowedWarehouseId?: string | null;
  branch?: { id: string; name: string };
  employee?: { id: string; name: string };
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: any) => Promise<void>;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('autocare_token'));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    api
      .getMe()
      .then((res) => {
        if (active && res.user) setUser(res.user);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('Auto-login session expired or unavailable:', err);
        localStorage.removeItem('autocare_token');
        setToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const login = async (credentials: any) => {
    setLoading(true);
    try {
      const res = await api.login(credentials);
      localStorage.setItem('autocare_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('autocare_token');
    setToken(null);
    setUser(null);
  };

  const hasPermission = (perm: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(perm) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, isOfflineApiError } from '../services/api';
import { clearCachedResponses } from '../services/offlineCache';

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
  login: (credentials: any) => Promise<any>;
  completeLogin: (response: { token: string; user: User }) => void;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const isCachedUser = (value: unknown): value is User =>
  Boolean(value
    && typeof value === 'object'
    && 'id' in value
    && typeof value.id === 'string'
    && 'username' in value
    && typeof value.username === 'string'
    && 'role' in value
    && typeof value.role === 'string'
    && 'permissions' in value
    && Array.isArray(value.permissions)
    && value.permissions.every((permission) => typeof permission === 'string'));

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
        if (active && res.user) {
          setUser(res.user);
          localStorage.setItem('autocare_cached_user', JSON.stringify(res.user));
        }
      })
      .catch((err) => {
        if (!active) return;
        if ((typeof navigator !== 'undefined' && !navigator.onLine) || err instanceof TypeError || isOfflineApiError(err)) {
          try {
            const cachedUser = localStorage.getItem('autocare_cached_user');
            if (cachedUser) {
              const parsedUser: unknown = JSON.parse(cachedUser);
              if (isCachedUser(parsedUser)) {
                setUser(parsedUser);
                return;
              }
              localStorage.removeItem('autocare_cached_user');
            }
          } catch (cacheError) {
            console.error('Could not restore the previously authenticated offline user:', cacheError);
          }
          console.warn('Offline sign-in is unavailable because this device has no previously authenticated user.');
          return;
        }
        console.warn('Auto-login session expired or unavailable:', err);
        localStorage.removeItem('autocare_token');
        localStorage.removeItem('autocare_cached_user');
        setUser(null);
        setToken(null);
        void clearCachedResponses().catch((cacheError) => {
          console.error('Could not clear offline API data after session failure:', cacheError);
        });
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
      if (res.token && res.user) completeLogin(res);
      return res;
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (res: { token: string; user: User }) => {
    localStorage.setItem('autocare_token', res.token);
    localStorage.setItem('autocare_cached_user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('autocare_token');
    localStorage.removeItem('autocare_cached_user');
    void clearCachedResponses().catch((error) => {
      console.error('Could not clear offline API data on logout:', error);
    });
    setToken(null);
    setUser(null);
  };

  const hasPermission = (perm: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(perm) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, completeLogin, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

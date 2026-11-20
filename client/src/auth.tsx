import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setCsrfToken, setUnauthorizedHandler } from './lib/api';
import type { User } from '../../shared/types';

interface AuthContextValue {
  user: User | null;
  csrfToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface MeResponse {
  user: User | null;
  csrfToken: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [csrfToken, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((response: MeResponse) => {
    setUser(response.user);
    setToken(response.csrfToken);
    setCsrfToken(response.csrfToken);
  }, []);

  const refresh = useCallback(async () => {
    const response = await api<MeResponse>('/auth/me');
    apply(response);
  }, [apply]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
      setCsrfToken(null);
    });
    refresh()
      .catch(() => apply({ user: null, csrfToken: null }))
      .finally(() => setLoading(false));
  }, [refresh, apply]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api<{ user: User; csrfToken: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setUser(response.user);
    setToken(response.csrfToken);
    setCsrfToken(response.csrfToken);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setToken(null);
      setCsrfToken(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, csrfToken, loading, login, logout, refresh }),
    [user, csrfToken, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function canWrite(user: User | null): boolean {
  return user !== null && user.role !== 'reviewer';
}

export function isAdmin(user: User | null): boolean {
  return user !== null && user.role === 'admin';
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  clientApi,
  publicApi,
  setClientActivityHandler,
  setClientCsrfToken,
  setClientUnauthorizedHandler,
} from './lib/public-api';
import type { ClientUser } from '../../shared/client-types';

interface MeResponse {
  user: ClientUser | null;
  csrfToken: string | null;
  expiresAt: string | null;
}

interface LoginResponse {
  user: ClientUser;
  csrfToken: string;
  expiresAt: string;
}

interface ClientAuthValue {
  user: ClientUser | null;
  loading: boolean;
  warning: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  staySignedIn: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthValue | null>(null);
const SESSION_MS = 5 * 60 * 1000;

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);
  const navigate = useNavigate();

  const clear = useCallback(() => {
    setUser(null);
    setExpiresAt(null);
    setWarning(false);
    setClientCsrfToken(null);
  }, []);

  const refresh = useCallback(async () => {
    const response = await clientApi<MeResponse>('/me');
    setUser(response.user);
    setClientCsrfToken(response.csrfToken);
    setExpiresAt(response.expiresAt);
    setWarning(false);
  }, []);

  useEffect(() => {
    setClientUnauthorizedHandler(clear);
    setClientActivityHandler(() => {
      setExpiresAt(new Date(Date.now() + SESSION_MS).toISOString());
      setWarning(false);
    });
    refresh()
      .catch(() => clear())
      .finally(() => setLoading(false));
    return () => {
      setClientUnauthorizedHandler(null);
      setClientActivityHandler(null);
    };
  }, [clear, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await publicApi<LoginResponse>('/client/login', {
      method: 'POST',
      body: { email, password },
    });
    setClientCsrfToken(response.csrfToken);
    setUser(response.user);
    setExpiresAt(response.expiresAt);
    setWarning(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await clientApi('/logout', { method: 'POST' });
    } catch {
      // The local session must be cleared even if the server already expired it.
    } finally {
      clear();
    }
  }, [clear]);

  const staySignedIn = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user || !expiresAt) return;
    const expiry = Date.parse(expiresAt);
    const warnAt = Math.max(0, expiry - Date.now() - 30_000);
    const endAt = Math.max(0, expiry - Date.now());
    const warnTimer = window.setTimeout(() => setWarning(true), warnAt);
    const endTimer = window.setTimeout(async () => {
      await logout();
      navigate('/client/login?expired=1', { replace: true });
    }, endAt);
    return () => {
      window.clearTimeout(warnTimer);
      window.clearTimeout(endTimer);
    };
  }, [user, expiresAt, logout, navigate]);

  const value = useMemo(
    () => ({ user, loading, warning, login, logout, refresh, staySignedIn }),
    [user, loading, warning, login, logout, refresh, staySignedIn],
  );

  return <ClientAuthContext.Provider value={value}>{children}</ClientAuthContext.Provider>;
}

export function useClientAuth(): ClientAuthValue {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error('useClientAuth must be used inside ClientAuthProvider');
  return ctx;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { api, ApiError } from '../api/client';
import { syncHomeSession } from '../public-shell';
import type { AuthSessionResponse, AuthUser } from '@/shared/types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type LoginProvider = 'google' | 'github';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (provider: LoginProvider) => void;
  bindProvider: (provider: LoginProvider) => void;
  register: (input: { username: string; password: string }) => Promise<void>;
  signInWithPassword: (identifier: string, password: string) => Promise<void>;
  setPassword: (input: { currentPassword?: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  markUnauthenticated: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useRef<Promise<AuthSessionResponse> | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    import.meta.env.SSR || typeof document === 'undefined' ? 'loading' : 'unauthenticated',
  );
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    const response = (session.current ??= api.getSession());
    try {
      await syncHomeSession(() => response);
      const result = await response;
      setUser(result.user);
      setStatus('authenticated');
    } catch (error) {
      session.current = null;
      setUser(null);
      setStatus('unauthenticated');
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.error('[auth] session request failed', error);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback((provider: LoginProvider) => {
    window.location.assign(`/api/auth/${provider}`);
  }, []);

  const bindProvider = useCallback((provider: LoginProvider) => {
    window.location.assign(`/api/auth/${provider}?bind=1`);
  }, []);

  const register = useCallback(async (input: { username: string; password: string }) => {
    const session = await api.register(input);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const signInWithPassword = useCallback(async (identifier: string, password: string) => {
    const session = await api.loginWithPassword(identifier, password);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const setPassword = useCallback(async (input: { currentPassword?: string; password: string }) => {
    const session = await api.setPassword(input);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const markUnauthenticated = useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      signIn,
      bindProvider,
      register,
      signInWithPassword,
      setPassword,
      signOut,
      refresh,
      markUnauthenticated,
    }),
    [
      bindProvider,
      markUnauthenticated,
      refresh,
      register,
      setPassword,
      signIn,
      signInWithPassword,
      signOut,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}

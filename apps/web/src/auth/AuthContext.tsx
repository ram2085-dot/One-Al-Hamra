import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { apiClient } from '../api/client';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  department: string;
  role: 'EMPLOYEE' | 'ADMIN';
}

export interface AuthContextValue {
  user: CurrentUser | null;
  /** True until the on-mount session probe resolves. Route guards must wait on this. */
  initializing: boolean;
  logout: () => Promise<void>;
}

/**
 * Exported so tests can supply a fixed context value directly instead of driving the real login
 * flow through a mocked `apiClient.post`. Application code should use `useAuth()`.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Session restore: the session cookie is httpOnly and lives for 8 hours server-side, but `user`
  // is in-memory only, so every refresh would otherwise bounce a signed-in user to /login.
  // A 401 here is the normal logged-out case, not an error to surface.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiClient.get<CurrentUser>('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, initializing, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

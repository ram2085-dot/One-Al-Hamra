import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { apiClient } from '../api/client';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  department: string;
  role: 'EMPLOYEE' | 'SERVICE_OWNER' | 'CATALOG_ADMIN' | 'HELP_DESK' | 'SECURITY_ADMIN';
}

interface AuthContextValue {
  user: CurrentUser | null;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  const login = useCallback(async (email: string) => {
    const loggedIn = await apiClient.post<CurrentUser>('/auth/login', { email });
    setUser(loggedIn);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

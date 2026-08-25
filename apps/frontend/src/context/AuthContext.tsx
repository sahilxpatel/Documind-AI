import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import apiClient, {
  setUnauthorizedHandler,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from '../api/client';

interface User {
  id: string;
  email: string;
  name: string | null;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredUser(): User | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    // Corrupt entry - drop it rather than crashing the whole app on boot.
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }, []);

  const login = useCallback((newToken: string, userData: User) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  }, []);

  // Any 401 on a normal request means the token is expired or revoked.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    let cancelled = false;

    // Tokens last 7 days, so a stored token is often stale. Verifying it against
    // the API on boot avoids showing a signed-in shell that fails every request.
    async function verifySession() {
      if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await apiClient.get('/api/auth/profile');
        if (cancelled) return;
        const freshUser = response.data.user as User;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(freshUser));
        setUser(freshUser);
      } catch (error) {
        // 401 is already handled by the interceptor, which calls logout. Other
        // failures (API cold start, network blip) should not sign the user out:
        // keep the cached profile and let subsequent requests decide.
        if (!cancelled && (error as { response?: { status?: number } })?.response?.status === 401) {
          logout();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void verifySession();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!token,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

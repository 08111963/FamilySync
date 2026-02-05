import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import { getApiUrl } from '@/lib/query-client';

const STORAGE_KEY = '@family_sync_auth';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface StoredAuth {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const saveAuth = useCallback(async (auth: StoredAuth) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      setUser(auth.user);
      setAccessToken(auth.accessToken);
      setRefreshToken(auth.refreshToken);
    } catch (error) {
      console.error('Error saving auth:', error);
    }
  }, []);

  const clearAuth = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
    } catch (error) {
      console.error('Error clearing auth:', error);
    }
  }, []);

  const loadStoredAuth = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const auth = JSON.parse(stored) as StoredAuth;
        setUser(auth.user);
        setAccessToken(auth.accessToken);
        setRefreshToken(auth.refreshToken);
        return auth;
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    }
    return null;
  }, []);

  const validateAuth = useCallback(async (token: string) => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/auth/me', baseUrl);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const userData = (await res.json()) as User;
        return userData;
      }
      return null;
    } catch (error) {
      console.error('Error validating auth:', error);
      return null;
    }
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (!refreshToken) return null;

    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/auth/refresh', baseUrl);
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.ok) {
        const { accessToken: newAccessToken } = (await res.json()) as { accessToken: string };
        setAccessToken(newAccessToken);
        if (user) {
          await saveAuth({ user, accessToken: newAccessToken, refreshToken });
        }
        return newAccessToken;
      } else {
        await clearAuth();
        return null;
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      await clearAuth();
      return null;
    }
  }, [refreshToken, user, saveAuth, clearAuth]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const stored = await loadStoredAuth();
        if (stored) {
          const userData = await validateAuth(stored.accessToken);
          if (userData) {
            setUser(userData);
          } else {
            const newToken = await refreshAccessToken();
            if (!newToken) {
              await clearAuth();
            }
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const baseUrl = getApiUrl();
        const url = new URL('/api/auth/login', baseUrl);
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const error = await res.text();
          throw new Error(error || 'Errore durante il login');
        }

        const { user: userData, accessToken: newAccessToken, refreshToken: newRefreshToken } = (await res.json()) as {
          user: User;
          accessToken: string;
          refreshToken: string;
        };

        await saveAuth({
          user: userData,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore durante il login';
        throw new Error(message);
      }
    },
    [saveAuth]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      try {
        const baseUrl = getApiUrl();
        const url = new URL('/api/auth/signup', baseUrl);
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });

        if (!res.ok) {
          const error = await res.text();
          throw new Error(error || 'Errore durante la registrazione');
        }

        const { user: userData, accessToken: newAccessToken, refreshToken: newRefreshToken } = (await res.json()) as {
          user: User;
          accessToken: string;
          refreshToken: string;
        };

        await saveAuth({
          user: userData,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore durante la registrazione';
        throw new Error(message);
      }
    },
    [saveAuth]
  );

  const logout = useCallback(async () => {
    await clearAuth();
  }, [clearAuth]);

  const isAuthenticated = !!user && !!accessToken;

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      accessToken,
      login,
      signup,
      logout,
      refreshAccessToken,
    }),
    [user, isLoading, isAuthenticated, accessToken, login, signup, logout, refreshAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

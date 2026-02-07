import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react';
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
  const refreshTokenRef = useRef<string | null>(null);

  const updateRefreshToken = useCallback((token: string | null) => {
    setRefreshToken(token);
    refreshTokenRef.current = token;
  }, []);

  const saveAuth = useCallback(async (auth: StoredAuth) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      setUser(auth.user);
      setAccessToken(auth.accessToken);
      updateRefreshToken(auth.refreshToken);
    } catch (error) {
      console.error('Error saving auth:', error);
    }
  }, [updateRefreshToken]);

  const clearAuth = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setUser(null);
      setAccessToken(null);
      updateRefreshToken(null);
    } catch (error) {
      console.error('Error clearing auth:', error);
    }
  }, [updateRefreshToken]);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const currentRefreshToken = refreshTokenRef.current;
    if (!currentRefreshToken) {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      try {
        const auth = JSON.parse(stored) as StoredAuth;
        if (!auth.refreshToken) return null;
        refreshTokenRef.current = auth.refreshToken;
        return doRefresh(auth.refreshToken, auth.user);
      } catch {
        return null;
      }
    }
    return doRefresh(currentRefreshToken, user);

    async function doRefresh(token: string, currentUser: User | null): Promise<string | null> {
      try {
        const baseUrl = getApiUrl();
        const url = new URL('/api/auth/refresh', baseUrl);
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: token }),
        });

        if (res.ok) {
          const { accessToken: newAccessToken } = (await res.json()) as { accessToken: string };
          setAccessToken(newAccessToken);
          if (currentUser) {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
              user: currentUser,
              accessToken: newAccessToken,
              refreshToken: token,
            }));
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
    }
  }, [user, clearAuth]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const auth = JSON.parse(stored) as StoredAuth;
        setUser(auth.user);
        setAccessToken(auth.accessToken);
        updateRefreshToken(auth.refreshToken);

        const baseUrl = getApiUrl();
        const meUrl = new URL('/api/auth/me', baseUrl);
        const res = await fetch(meUrl.toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });

        if (res.ok) {
          const userData = (await res.json()) as User;
          setUser(userData);
        } else {
          const refreshUrl = new URL('/api/auth/refresh', baseUrl);
          const refreshRes = await fetch(refreshUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: auth.refreshToken }),
          });

          if (refreshRes.ok) {
            const { accessToken: newAccessToken } = (await refreshRes.json()) as { accessToken: string };
            setAccessToken(newAccessToken);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
              user: auth.user,
              accessToken: newAccessToken,
              refreshToken: auth.refreshToken,
            }));
          } else {
            await clearAuth();
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

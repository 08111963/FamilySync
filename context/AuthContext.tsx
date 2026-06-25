import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApiUrl } from '@/lib/query-client';

const authFetch = globalThis.fetch.bind(globalThis);

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
  signup: (email: string, password: string, name: string, acceptedTerms: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  refreshUser: () => Promise<User | null>;
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
        const res = await authFetch(url.toString(), {
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
        const res = await authFetch(meUrl.toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });

        if (res.ok) {
          const userData = (await res.json()) as User;
          setUser(userData);
        } else {
          const refreshUrl = new URL('/api/auth/refresh', baseUrl);
          const refreshRes = await authFetch(refreshUrl.toString(), {
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
      let baseUrl: string;
      try {
        baseUrl = getApiUrl();
      } catch {
        throw new Error('Impossibile connettersi al server. Riprova più tardi.');
      }
      const url = new URL('/api/auth/login', baseUrl);

      let res: Response;
      try {
        res = await authFetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch (networkError) {
        throw new Error('Errore di connessione. Verifica la tua connessione internet e riprova.');
      }

      if (!res.ok) {
        let errorBody: any = null;
        try { errorBody = await res.json(); } catch { try { await res.text(); } catch {} }
        const serverMsg = errorBody?.error?.message;
        if (res.status === 401) {
          throw new Error(serverMsg || 'Credenziali non valide');
        }
        throw new Error(serverMsg || `Errore durante il login (${res.status})`);
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
    },
    [saveAuth]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string, acceptedTerms: boolean) => {
      let baseUrl: string;
      try {
        baseUrl = getApiUrl();
      } catch {
        throw new Error('Impossibile connettersi al server. Riprova più tardi.');
      }
      const url = new URL('/api/auth/signup', baseUrl);

      let res: Response;
      try {
        res = await authFetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, acceptedTerms }),
        });
      } catch (networkError) {
        throw new Error('Errore di connessione. Verifica la tua connessione internet e riprova.');
      }

      if (!res.ok) {
        let errorBody: any = null;
        try { errorBody = await res.json(); } catch { try { await res.text(); } catch {} }
        const serverMsg = errorBody?.error?.message;
        if (res.status === 400) {
          throw new Error(serverMsg || 'Dati non validi');
        }
        throw new Error(serverMsg || `Errore durante la registrazione (${res.status})`);
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
    },
    [saveAuth]
  );

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const auth = JSON.parse(stored) as StoredAuth;

      let token = auth.accessToken;
      const baseUrl = getApiUrl();
      const meUrl = new URL('/api/auth/me', baseUrl);

      let res = await authFetch(meUrl.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (!newToken) return null;
        token = newToken;
        res = await authFetch(meUrl.toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (!res.ok) return null;

      const userData = (await res.json()) as User;
      setUser(userData);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...auth,
        accessToken: token,
        user: userData,
      }));
      return userData;
    } catch (error) {
      console.error('Error refreshing user:', error);
      return null;
    }
  }, [refreshAccessToken]);

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
      refreshUser,
    }),
    [user, isLoading, isAuthenticated, accessToken, login, signup, logout, refreshAccessToken, refreshUser]
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

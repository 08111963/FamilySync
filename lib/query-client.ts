import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_STORAGE_KEY = "@family_sync_auth";

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.accessToken || null;
    }
  } catch {}
  return null;
}

async function tryRefreshToken(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    const auth = JSON.parse(stored);
    if (!auth.refreshToken) return null;

    const baseUrl = getApiUrl();
    const url = new URL("/api/auth/refresh", baseUrl);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });

    if (res.ok) {
      const { accessToken: newToken } = (await res.json()) as { accessToken: string };
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        ...auth,
        accessToken: newToken,
      }));
      return newToken;
    }
  } catch {}
  return null;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch {}
    let body: any = null;
    if (text) { try { body = JSON.parse(text); } catch {} }
    // Manteniamo il formato messaggio storico ("<status>: <testo>") per
    // retrocompatibilità, ma alleghiamo status/body strutturati così i chiamanti
    // possono riconoscere codici come FREE_DAILY_LIMIT_REACHED.
    const err = new Error(`${res.status}: ${text || res.statusText}`) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = res.status;
    err.body = body;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  let token = await getAccessToken();

  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      const retryHeaders: Record<string, string> = {};
      if (data) retryHeaders["Content-Type"] = "application/json";
      retryHeaders["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url.toString(), {
        method,
        headers: retryHeaders,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
    }
  }

  await throwIfResNotOk(res);
  return res;
}

export async function apiFetch<T>(route: string, options?: { method?: string; body?: any }): Promise<T> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  let token = await getAccessToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options?.body) headers["Content-Type"] = "application/json";

  let res = await globalThis.fetch(url.toString(), {
    method: options?.method || "GET",
    headers,
    credentials: "include",
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await globalThis.fetch(url.toString(), {
        method: options?.method || "GET",
        headers,
        credentials: "include",
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
    }
  }

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { try { await res.text(); } catch {} }
    throw { status: res.status, body };
  }
  return res.json();
}

/**
 * Upload multipart autenticato (FormData). Non imposta Content-Type manualmente:
 * il boundary viene gestito da fetch. Errori nello stesso formato di apiFetch
 * ({ status, body }) così aiErrorMessage funziona anche qui.
 */
export async function apiUpload<T>(route: string, formData: FormData): Promise<T> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  let token = await getAccessToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await globalThis.fetch(url.toString(), {
    method: "POST",
    headers,
    credentials: "include",
    body: formData as any,
  });

  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers,
        credentials: "include",
        body: formData as any,
      });
    }
  }

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { try { await res.text(); } catch {} }
    throw { status: res.status, body };
  }
  return res.json();
}

export async function apiStream(
  route: string,
  body: any,
  onLine: (obj: any) => void,
): Promise<void> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  let token = await getAccessToken();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(url.toString(), {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url.toString(), {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    let errBody: any = null;
    try { errBody = await res.json(); } catch { try { await res.text(); } catch {} }
    throw { status: res.status, body: errBody };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t) { try { onLine(JSON.parse(t)); } catch {} }
    }
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (t) { try { onLine(JSON.parse(t)); } catch {} }
    }
  }
  const last = buffer.trim();
  if (last) { try { onLine(JSON.parse(last)); } catch {} }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    let token = await getAccessToken();

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let res = await fetch(url.toString(), {
      headers,
      credentials: "include",
    });

    if (res.status === 401) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(url.toString(), {
          headers,
          credentials: "include",
        });
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

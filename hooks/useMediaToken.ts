import { useState, useEffect, useCallback } from "react";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

const authFetch = globalThis.fetch.bind(globalThis);

export function useMediaToken() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [mediaToken, setMediaToken] = useState<string | null>(null);

  const fetchToken = useCallback(
    async (filePath?: string): Promise<string | null> => {
      let token = accessToken;
      if (!token) {
        token = await refreshAccessToken();
        if (!token) return null;
      }

      const url = new URL("/api/auth/media-token", getApiUrl());
      const body = JSON.stringify(filePath ? { filePath } : {});

      const request = (bearer: string) =>
        authFetch(url.toString(), {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body,
        });

      try {
        let res = await request(token);
        if (res.status === 401) {
          const newToken = await refreshAccessToken();
          if (!newToken) return null;
          res = await request(newToken);
        }
        if (!res.ok) return null;
        const data = (await res.json()) as { mediaToken: string };
        return data.mediaToken;
      } catch {
        return null;
      }
    },
    [accessToken, refreshAccessToken]
  );

  useEffect(() => {
    if (!accessToken) {
      setMediaToken(null);
      return;
    }

    let active = true;
    const load = async () => {
      const t = await fetchToken();
      if (active && t) setMediaToken(t);
    };

    load();
    const interval = setInterval(load, 4 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [accessToken, fetchToken]);

  return { mediaToken, getFileToken: fetchToken };
}

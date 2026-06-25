import { useState, useEffect, useCallback } from "react";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

const authFetch = globalThis.fetch.bind(globalThis);

export function useMediaToken(familyId?: string) {
  const { accessToken, refreshAccessToken } = useAuth();
  const [mediaToken, setMediaToken] = useState<string | null>(null);

  const fetchToken = useCallback(
    async (scope: { filePath?: string; familyId?: string }): Promise<string | null> => {
      if (!scope.filePath && !scope.familyId) return null;

      let token = accessToken;
      if (!token) {
        token = await refreshAccessToken();
        if (!token) return null;
      }

      const url = new URL("/api/auth/media-token", getApiUrl());
      const body = JSON.stringify(
        scope.filePath ? { filePath: scope.filePath } : { familyId: scope.familyId }
      );

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
    if (!accessToken || !familyId) {
      setMediaToken(null);
      return;
    }

    let active = true;
    const load = async () => {
      const t = await fetchToken({ familyId });
      if (active && t) setMediaToken(t);
    };

    load();
    const interval = setInterval(load, 4 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [accessToken, familyId, fetchToken]);

  const getFileToken = useCallback(
    (filePath: string) => fetchToken({ filePath }),
    [fetchToken]
  );

  return { mediaToken, getFileToken };
}

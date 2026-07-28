import { useEffect, useState } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { apiFetch, getApiUrl } from "@/lib/query-client";

// Cache in memoria (per sessione): titolo normalizzato -> URL relativo.
// Evita richieste duplicate quando la stessa ricetta appare più volte.
const urlCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function cacheKey(title: string): string {
  return title.trim().toLowerCase();
}

/** URL relativo (/uploads/...) della foto già generata per questo titolo, se esiste. */
export function getCachedRecipeImage(title: string): string | undefined {
  return urlCache.get(cacheKey(title));
}

export function toAbsoluteUploadUrl(relativeUrl: string): string {
  return new URL(relativeUrl, getApiUrl()).toString();
}

// ---- Risoluzione batch delle foto già in cache sul server ----
// Quando una lista di ricette appare, ogni card chiede la sua foto: invece di
// N richieste separate, raggruppiamo i titoli per ~40ms e facciamo UNA sola
// chiamata di lookup. Solo i titoli senza foto in cache passano alla
// generazione individuale (lenta, AI).
let resolveQueue: Map<string, ((url: string | null) => void)[]> | null = null;
let resolveTimer: ReturnType<typeof setTimeout> | null = null;
let resolveFamilyId: string | null = null;

function resolveCachedUrl(familyId: string, title: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!resolveQueue || resolveFamilyId !== familyId) {
      // Famiglia diversa (caso raro): svuota subito la coda precedente.
      if (resolveQueue) flushResolveQueue();
      resolveQueue = new Map();
      resolveFamilyId = familyId;
    }
    const waiters = resolveQueue.get(title) || [];
    waiters.push(resolve);
    resolveQueue.set(title, waiters);
    if (!resolveTimer) {
      resolveTimer = setTimeout(flushResolveQueue, 40);
    }
  });
}

async function flushResolveQueue() {
  const queue = resolveQueue;
  const familyId = resolveFamilyId;
  resolveQueue = null;
  resolveFamilyId = null;
  if (resolveTimer) {
    clearTimeout(resolveTimer);
    resolveTimer = null;
  }
  if (!queue || !familyId || queue.size === 0) return;

  const titles = Array.from(queue.keys());
  let urls: Record<string, string | null> = {};
  try {
    const data = await apiFetch<{ urls: Record<string, string | null> }>(
      `/api/ai/${familyId}/recipe-images/resolve`,
      { method: "POST", body: { titles } }
    );
    urls = data.urls || {};
  } catch {
    // Lookup fallito: i chiamanti proseguiranno con la generazione individuale.
  }
  for (const [title, waiters] of queue) {
    const url = urls[title.trim()] ?? urls[title] ?? null;
    if (url) urlCache.set(cacheKey(title), url);
    waiters.forEach((w) => w(url));
  }
}

async function requestRecipeImage(
  familyId: string,
  title: string,
  description?: string
): Promise<string> {
  const key = cacheKey(title);
  const cached = urlCache.get(key);
  if (cached) return cached;

  // Dedup per (famiglia, titolo): la stessa foto è un asset condiviso tra
  // famiglie, ma la richiesta HTTP è autorizzata per famiglia, quindi una
  // richiesta di un'altra famiglia non deve agganciarsi a quella in corso.
  const flightKey = `${familyId}:${key}`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const task = (async () => {
    try {
      // 1) Lookup batch: se la foto è già in cache sul server, nessuna
      //    generazione e risposta quasi istantanea.
      const resolved = await resolveCachedUrl(familyId, title);
      if (resolved) return resolved;

      // 2) Cache miss: generazione AI individuale (lenta).
      const data = await apiFetch<{ url: string }>(
        `/api/ai/${familyId}/recipe-image`,
        { method: "POST", body: { title, description } }
      );
      if (!data.url) throw new Error("no url");
      urlCache.set(key, data.url);
      return data.url;
    } finally {
      inFlight.delete(flightKey);
    }
  })();
  inFlight.set(flightKey, task);
  return task;
}

/**
 * Foto di una ricetta generata dall'AI.
 * - Se `imageUrl` è fornito (ricetta salvata), mostra direttamente quella foto.
 * - Altrimenti chiede al backend di generarla (cache lato server per titolo).
 * - In caso di errore o quota esaurita mostra un segnaposto discreto, senza avvisi.
 */
export function RecipeAiImage({
  familyId,
  title,
  description,
  imageUrl,
  height = 150,
  borderRadius = 12,
}: {
  familyId?: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  height?: number;
  borderRadius?: number;
}) {
  const { colors } = useTheme();
  const preset = imageUrl || getCachedRecipeImage(title) || null;
  const [relUrl, setRelUrl] = useState<string | null>(preset);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (relUrl || failed || !familyId) return;
    let cancelled = false;
    requestRecipeImage(familyId, title, description)
      .then((url) => {
        if (!cancelled) setRelUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [relUrl, failed, familyId, title, description]);

  if (failed || (!relUrl && !familyId)) {
    return (
      <View
        style={[
          styles.placeholder,
          { height, borderRadius, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Ionicons name="restaurant-outline" size={28} color={colors.textSecondary} />
      </View>
    );
  }

  if (!relUrl) {
    return (
      <View
        style={[
          styles.placeholder,
          { height, borderRadius, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <ActivityIndicator size="small" color={colors.textSecondary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: toAbsoluteUploadUrl(relUrl) }}
      style={{ width: "100%", height, borderRadius }}
      contentFit="cover"
      transition={250}
      onError={() => setFailed(true)}
      accessibilityLabel={`Foto di ${title}`}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
});

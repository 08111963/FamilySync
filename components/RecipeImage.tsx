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

async function requestRecipeImage(
  familyId: string,
  title: string,
  description?: string
): Promise<string> {
  const key = cacheKey(title);
  const cached = urlCache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const data = await apiFetch<{ url: string }>(
        `/api/ai/${familyId}/recipe-image`,
        { method: "POST", body: { title, description } }
      );
      if (!data.url) throw new Error("no url");
      urlCache.set(key, data.url);
      return data.url;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
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

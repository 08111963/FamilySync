import { View, Text, StyleSheet, Image } from "react-native";
import { getApiUrl } from "@/lib/query-client";

interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  avatarUrl?: string | null;
}

// Costruisce l'URL assoluto della foto profilo. Gli avatar sono serviti
// pubblicamente da /uploads/avatars (nessun media-token necessario).
function resolveAvatarUri(avatarUrl?: string | null): string | null {
  if (!avatarUrl) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  try {
    return new URL(avatarUrl, getApiUrl()).toString();
  } catch {
    return null;
  }
}

export function Avatar({ name, color, size = 40, avatarUrl }: AvatarProps) {
  const uri = resolveAvatarUri(avatarUrl);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
});

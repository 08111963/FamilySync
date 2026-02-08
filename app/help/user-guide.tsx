import { useState } from "react";
import { StyleSheet, Text, View, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { WebView } from "react-native-webview";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";

export default function UserGuideScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const guideUrl = `${getApiUrl()}/help/user-guide`;

  const renderWebContent = () => {
    if (Platform.OS === "web") {
      return (
        <iframe
          src={guideUrl}
          style={{ flex: 1, border: "none", width: "100%", height: "100%" } as any}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
      );
    }

    return (
      <WebView
        source={{ uri: guideUrl }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        startInLoadingState={false}
        javaScriptEnabled
        domStorageEnabled
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Guida Utente</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Caricamento guida...</Text>
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Impossibile caricare la guida</Text>
          <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>Verifica la connessione e riprova</Text>
          <Pressable
            onPress={() => { setError(false); setLoading(true); }}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.retryText}>Riprova</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.webviewContainer, { paddingBottom: bottomInset }]}>
          {renderWebContent()}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  webviewContainer: { flex: 1 },
  webview: { flex: 1 },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

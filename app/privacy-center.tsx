import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Switch, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, queryClient } from "@/lib/query-client";

interface ConsentRecord {
  id: string;
  consentType: string;
  granted: boolean;
  policyVersion: string;
  createdAt: string;
}

const CONSENT_LABELS: Record<string, string> = {
  terms: "Termini d'Uso e Privacy Policy",
  ai_features: "Funzioni AI",
};

export default function PrivacyCenterScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: prefsData } = useQuery<{ aiFeaturesEnabled: boolean }>({
    queryKey: ["/api/moderation/preferences"],
  });

  const { data: consents, isLoading: consentsLoading } = useQuery<ConsentRecord[]>({
    queryKey: ["/api/moderation/consents"],
  });

  const handleToggleAI = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiRequest("PATCH", "/api/moderation/preferences", { aiFeaturesEnabled: value });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/consents"] });
    } catch {
      // lo stato reale verrà rifetchato
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/preferences"] });
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/family")} hitSlop={12} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Centro Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CONSENSI</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: colors.secondary + "20" }]}>
              <Ionicons name="sparkles-outline" size={22} color={colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Funzioni AI</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Se attive, alcuni dati minimizzati vengono inviati al fornitore AI (OpenAI) per generare suggerimenti. Revocabile in qualsiasi momento.
              </Text>
            </View>
            <Switch
              value={prefsData?.aiFeaturesEnabled ?? false}
              onValueChange={handleToggleAI}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#FFFFFF"
              testID="ai-consent-switch"
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>INFORMATIVE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable style={styles.row} onPress={() => router.push("/legal/privacy")} testID="link-privacy">
            <View style={[styles.rowIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Privacy Policy</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>Informativa completa sul trattamento dei dati</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.row} onPress={() => router.push("/legal/minors")} testID="link-minors">
            <View style={[styles.rowIcon, { backgroundColor: "#34C75920" }]}>
              <Ionicons name="happy-outline" size={22} color="#34C759" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Privacy per Ragazzi</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>Informativa semplificata per i più giovani</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.row} onPress={() => router.push("/legal/terms")} testID="link-terms">
            <View style={[styles.rowIcon, { backgroundColor: colors.textSecondary + "15" }]}>
              <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Termini d'Uso</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>Condizioni di utilizzo del servizio</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>REGISTRO DEI TUOI CONSENSI</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {consentsLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !consents || consents.length === 0 ? (
            <View style={styles.loadingBox}>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Nessun consenso registrato finora.
              </Text>
            </View>
          ) : (
            consents.map((c, idx) => (
              <View key={c.id}>
                {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <View style={styles.row}>
                  <Ionicons
                    name={c.granted ? "checkmark-circle" : "close-circle"}
                    size={22}
                    color={c.granted ? "#34C759" : colors.error}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      {CONSENT_LABELS[c.consentType] ?? c.consentType}
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                      {c.granted ? "Prestato" : "Revocato/Non prestato"} · {formatDate(c.createdAt)} · Policy v{c.policyVersion}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
          Per esercitare i tuoi diritti (accesso, rettifica, cancellazione, portabilità) scrivi a assistenza@familysync.it. Puoi eliminare il tuo account dalla scheda Famiglia.
        </Text>
      </ScrollView>
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
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 52,
  },
  loadingBox: {
    paddingVertical: 20,
    alignItems: "center",
  },
  footerNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    textAlign: "center",
    marginTop: 24,
  },
});

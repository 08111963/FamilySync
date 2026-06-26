import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CredentialsCard, MemberCredentials } from "@/components/CredentialsCard";
import { apiRequest } from "@/lib/query-client";

export default function MemberAccessScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { memberId, familyId, memberName } = useLocalSearchParams<{
    memberId: string;
    familyId: string;
    memberName: string;
  }>();

  const [credentials, setCredentials] = useState<MemberCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!memberId || !familyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", `/api/families/${familyId}/members/${memberId}/reset-access`);
      const data = await res.json();
      setCredentials({
        loginEmail: data.credentials.loginEmail,
        tempPassword: data.credentials.tempPassword,
        hasRealEmail: data.credentials.hasRealEmail,
        memberName: data.member.name,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError("Errore nella generazione dell'accesso. Riprova.");
      console.error("Reset access error:", err);
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Invia Accesso</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!credentials ? (
          <View>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
                  <Ionicons name="key-outline" size={40} color={colors.primary} />
                </View>
                <Text style={[styles.heading, { color: colors.text }]}>
                  Accesso per {memberName || "questo membro"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Per sicurezza la password precedente non può essere recuperata. Genera una nuova
                  password temporanea da inviare al membro.
                </Text>
              </View>
            </Card>

            <Text style={[styles.warnText, { color: colors.textSecondary }]}>
              Generando un nuovo accesso, la vecchia password smette di funzionare.
            </Text>

            {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

            <Button
              title={loading ? "Generazione..." : "Genera nuovo accesso"}
              onPress={handleGenerate}
              disabled={loading}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : (
          <View>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.iconCircle, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                </View>
                <Text style={[styles.heading, { color: colors.text }]}>Accesso pronto</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Invia questi dati a {credentials.memberName}
                </Text>
              </View>
            </Card>

            <View style={{ marginTop: 16 }}>
              <CredentialsCard credentials={credentials} />
            </View>

            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.doneButton, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.doneLabel, { color: colors.textSecondary }]}>Fatto</Text>
            </Pressable>
          </View>
        )}
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
    paddingBottom: 16,
  },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  placeholder: { width: 40 },
  content: { flex: 1, paddingHorizontal: 20 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  warnText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 16, marginBottom: 8 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8, textAlign: "center" },
  doneButton: { alignItems: "center", paddingVertical: 14, marginTop: 24 },
  doneLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});

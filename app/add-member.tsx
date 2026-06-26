import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

const ROLES = [
  { value: "adult", label: "Adulto", icon: "person" as const },
  { value: "child", label: "Ragazzo/a", icon: "happy" as const },
];

interface CreatedCredentials {
  loginEmail: string;
  tempPassword: string;
  hasRealEmail: boolean;
  memberName: string;
}

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "adult" | "child">("adult");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateMember = async () => {
    if (!currentFamily) return;
    if (!name.trim()) {
      setError("Inserisci il nome del membro");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest("POST", `/api/families/${currentFamily.id}/members`, {
        name: name.trim(),
        email: email.trim() || undefined,
        role,
      });
      const data = await res.json();
      setCredentials({
        loginEmail: data.credentials.loginEmail,
        tempPassword: data.credentials.tempPassword,
        hasRealEmail: data.credentials.hasRealEmail,
        memberName: data.member.name,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const message =
        typeof err?.message === "string" && err.message.includes("409")
          ? "Esiste già un account con questa email"
          : "Errore nella creazione del membro. Riprova.";
      setError(message);
      console.error("Create member error:", err);
    } finally {
      setLoading(false);
    }
  };

  const credentialsText = (c: CreatedCredentials) =>
    `Accesso a FamilySync per ${c.memberName}\n\nEmail/Accesso: ${c.loginEmail}\nPassword temporanea: ${c.tempPassword}\n\nApri l'app FamilySync e accedi con questi dati.`;

  const handleCopy = async () => {
    if (!credentials) return;
    await Clipboard.setStringAsync(credentialsText(credentials));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!credentials) return;
    try {
      await Share.share({ message: credentialsText(credentials) });
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  const handleNewMember = () => {
    setCredentials(null);
    setName("");
    setEmail("");
    setRole("adult");
    setError(null);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Aggiungi Membro</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!credentials ? (
          <>
            <View style={styles.field}>
              <Input
                label="Nome"
                placeholder="Es. Marco"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.field}>
              <Input
                label="Email (facoltativa)"
                placeholder="Lascia vuoto per i bambini"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Se non metti l'email, l'app crea un accesso automatico.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Ruolo</Text>
              <View style={styles.roleOptions}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setRole(r.value as "admin" | "adult" | "child");
                    }}
                    style={[
                      styles.roleOption,
                      {
                        backgroundColor: role === r.value ? colors.primary : colors.surface,
                        borderColor: role === r.value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={r.icon}
                      size={20}
                      color={role === r.value ? "#FFFFFF" : colors.text}
                    />
                    <Text
                      style={[
                        styles.roleLabel,
                        { color: role === r.value ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {error && (
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            )}

            <Button
              title={loading ? "Creazione..." : "Crea Account"}
              onPress={handleCreateMember}
              disabled={loading}
              style={{ marginTop: 8 }}
            />
          </>
        ) : (
          <View style={styles.successContainer}>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: colors.text }]}>Account Creato</Text>
                <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
                  Passa questi dati a {credentials.memberName} per accedere
                </Text>
              </View>
            </Card>

            <Card style={{ marginTop: 16 }}>
              <View style={styles.credRow}>
                <Text style={[styles.credLabel, { color: colors.textSecondary }]}>
                  {credentials.hasRealEmail ? "Email" : "Accesso"}
                </Text>
                <Text style={[styles.credValue, { color: colors.text }]} selectable>
                  {credentials.loginEmail}
                </Text>
              </View>
              <View style={[styles.credDivider, { backgroundColor: colors.border }]} />
              <View style={styles.credRow}>
                <Text style={[styles.credLabel, { color: colors.textSecondary }]}>
                  Password temporanea
                </Text>
                <Text style={[styles.credValue, styles.credPassword, { color: colors.text }]} selectable>
                  {credentials.tempPassword}
                </Text>
              </View>
            </Card>

            <Text style={[styles.warnText, { color: colors.textSecondary }]}>
              Salva o invia subito questi dati: la password non sarà più mostrata.
            </Text>

            <View style={styles.actionsColumn}>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>{copied ? "Copiato!" : "Copia dati"}</Text>
              </Pressable>

              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="share-outline" size={20} color={colors.text} />
                <Text style={[styles.actionButtonText, { color: colors.text }]}>Condividi</Text>
              </Pressable>
            </View>

            <View style={styles.bottomButtons}>
              <Pressable
                onPress={handleNewMember}
                style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Altro membro</Text>
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Chiudi</Text>
              </Pressable>
            </View>
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
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  roleOptions: { flexDirection: "row", gap: 12 },
  roleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8, textAlign: "center" },
  successContainer: { gap: 0 },
  successIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  credRow: { gap: 4 },
  credLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  credValue: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  credPassword: { letterSpacing: 2 },
  credDivider: { height: 1, marginVertical: 14 },
  warnText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 12, marginBottom: 8 },
  actionsColumn: { gap: 12, marginTop: 12 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  actionButtonText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  bottomButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
  },
  textButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  textButtonLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});

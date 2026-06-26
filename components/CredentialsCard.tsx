import { useState } from "react";
import { StyleSheet, Text, View, Pressable, Platform, Share, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/hooks/useTheme";
import { Card } from "@/components/Card";

export interface MemberCredentials {
  loginEmail: string;
  tempPassword: string;
  hasRealEmail: boolean;
  memberName: string;
}

export function credentialsText(c: MemberCredentials): string {
  return `Accesso a FamilySync per ${c.memberName}\n\nEmail/Accesso: ${c.loginEmail}\nPassword temporanea: ${c.tempPassword}\n\nApri l'app FamilySync e accedi con questi dati.`;
}

export function CredentialsCard({ credentials }: { credentials: MemberCredentials }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(credentialsText(credentials));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `https://wa.me/?text=${encodeURIComponent(credentialsText(credentials))}`;
    try {
      await Linking.openURL(url);
    } catch (err) {
      console.error("WhatsApp share error:", err);
    }
  };

  const handleEmail = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const subject = `Accesso a FamilySync per ${credentials.memberName}`;
    const body = credentialsText(credentials);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(Platform.OS === "web" ? gmailUrl : mailtoUrl);
    } catch (err) {
      console.error("Email share error:", err);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: credentialsText(credentials) });
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  return (
    <View>
      <Card>
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
          <Text style={[styles.credLabel, { color: colors.textSecondary }]}>Password temporanea</Text>
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

        <View style={styles.actionsRow}>
          <Pressable
            onPress={handleWhatsApp}
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionHalf,
              { backgroundColor: "#25D366", opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>WhatsApp</Text>
          </Pressable>

          <Pressable
            onPress={handleEmail}
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionHalf,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="mail-outline" size={20} color={colors.text} />
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Email</Text>
          </Pressable>
        </View>

        {Platform.OS !== "web" && (
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="share-outline" size={20} color={colors.text} />
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Altre app</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  credRow: { gap: 4 },
  credLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  credValue: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  credPassword: { letterSpacing: 2 },
  credDivider: { height: 1, marginVertical: 14 },
  warnText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 12, marginBottom: 8 },
  actionsColumn: { gap: 12, marginTop: 12 },
  actionsRow: { flexDirection: "row", gap: 12 },
  actionHalf: { flex: 1 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  actionButtonText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

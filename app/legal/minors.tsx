import { StyleSheet, Text, View, ScrollView, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";

export default function MinorsPrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy per Ragazzi</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Questa pagina spiega in modo semplice come FamilySync usa le tue informazioni. La versione completa è nella Privacy Policy, che può leggerti anche un adulto della tua famiglia.
        </Text>

        <Section title="Cosa sappiamo di te" icon="person-circle-outline" colors={colors}>
          <Bullet colors={colors}>Il tuo nome (o soprannome) e la tua email, che servono per farti entrare nell'app</Bullet>
          <Bullet colors={colors}>Le cose che tu e la tua famiglia scrivete nell'app: eventi del calendario, liste della spesa, faccende, messaggi in chat</Bullet>
        </Section>

        <Section title="Chi vede le tue cose" icon="eye-outline" colors={colors}>
          <P colors={colors}>Quello che scrivi nell'app lo vedono solo i membri della tua famiglia. Non lo mostriamo ad altre persone e non lo usiamo per pubblicità.</P>
        </Section>

        <Section title="Se hai meno di 14 anni" icon="shield-half-outline" colors={colors}>
          <Bullet colors={colors}>Non puoi creare un account da solo/a: serve un genitore o un adulto che si occupa di te</Bullet>
          <Bullet colors={colors}>Il tuo profilo viene creato e controllato da un adulto della famiglia</Bullet>
          <Bullet colors={colors}>Le funzioni di intelligenza artificiale (i "suggerimenti automatici") non sono disponibili per te</Bullet>
        </Section>

        <Section title="Consigli utili" icon="bulb-outline" colors={colors}>
          <Bullet colors={colors}>Non scrivere in chat o nelle note informazioni molto personali (es. dati sulla salute) se non serve</Bullet>
          <Bullet colors={colors}>Se qualcosa ti sembra strano o ti mette a disagio, parlane subito con un genitore</Bullet>
          <Bullet colors={colors}>Tu e i tuoi genitori potete chiedere di correggere o cancellare le tue informazioni quando volete</Bullet>
        </Section>

        <Section title="Domande?" icon="mail-outline" colors={colors}>
          <P colors={colors}>Un adulto della tua famiglia può scriverci a assistenza@familysync.it</P>
        </Section>

        <Pressable onPress={() => router.push("/legal/privacy")} style={[styles.fullPolicyButton, { borderColor: colors.border }]}>
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <Text style={[styles.fullPolicyText, { color: colors.primary }]}>Leggi la Privacy Policy completa</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Section({ title, icon, children, colors }: { title: string; icon: any; children: React.ReactNode; colors: any }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function P({ children, colors }: { children: React.ReactNode; colors: any }) {
  return <Text style={[styles.paragraph, { color: colors.textSecondary }]}>{children}</Text>;
}

function Bullet({ children, colors }: { children: React.ReactNode; colors: any }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
      <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{children}</Text>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  intro: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
    marginBottom: 24,
  },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  paragraph: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  fullPolicyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 8,
  },
  fullPolicyText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

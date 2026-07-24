import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { PRIVACY_POLICY_VERSION, PRIVACY_POLICY_DATE } from "@/shared/policy-version";
import { PRIVACY_POLICY_SECTIONS, type PolicyBlock, type PolicySection } from "@/shared/privacy-policy-content";

// Il contenuto della policy proviene dalla FONTE UNICA condivisa
// (shared/privacy-policy-content.ts), la stessa usata dalla pagina web
// /legal/privacy e dal DOCX di consegna. Non scrivere testi legali qui.

function BoldableText({ text, style }: { text: string; style: any }) {
  const parts = text.split(/\*\*/);
  if (parts.length === 1) {
    return <Text style={style}>{text}</Text>;
  }
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontFamily: "Inter_600SemiBold" }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

function PolicyBlockView({ block, colors }: { block: PolicyBlock; colors: any }) {
  if (block.type === "li") {
    return (
      <View style={styles.bulletRow}>
        <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
        <BoldableText text={block.text} style={[styles.bulletText, { color: colors.textSecondary }]} />
      </View>
    );
  }
  return <BoldableText text={block.text} style={[styles.paragraph, { color: colors.textSecondary }]} />;
}

function PolicySectionView({ section, colors }: { section: PolicySection; colors: any }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
      {section.blocks.map((block, i) => (
        <PolicyBlockView key={i} block={block} colors={colors} />
      ))}
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const openInBrowser = () => {
    const url = `${getApiUrl()}/legal/privacy`;
    Linking.openURL(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy Policy</Text>
        <Pressable onPress={openInBrowser} hitSlop={12}>
          <Ionicons name="open-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.versionBadge, { color: colors.text }]}>
          Versione {PRIVACY_POLICY_VERSION} — {PRIVACY_POLICY_DATE}
        </Text>

        {PRIVACY_POLICY_SECTIONS.map((section) => (
          <PolicySectionView key={section.title} section={section} colors={colors} />
        ))}

        <Text style={[styles.updateDate, { color: colors.textSecondary }]}>
          Versione {PRIVACY_POLICY_VERSION} — Ultimo aggiornamento: {PRIVACY_POLICY_DATE}
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  versionBadge: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 20,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
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
  updateDate: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});

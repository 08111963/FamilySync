import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

// Etichetta di trasparenza per i contenuti generati dall'AI (GDPR / AI Act:
// l'utente deve poter riconoscere i contenuti generati automaticamente).
export function AiBadge({ style }: { style?: object }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.secondary + "18" }, style]}>
      <Ionicons name="sparkles" size={11} color={colors.secondary} />
      <Text style={[styles.text, { color: colors.secondary }]}>Generato con AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  text: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});

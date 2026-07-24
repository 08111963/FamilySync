import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

export default function AiPrivacyNotice() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="ai-privacy-notice">
      <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} style={{ marginTop: 1 }} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        Non inserire dati sanitari non necessari, documenti di identità, credenziali, dati bancari, indirizzi, numeri di telefono o informazioni di terzi non necessarie: il testo libero viene inviato al fornitore AI così com'è.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
});

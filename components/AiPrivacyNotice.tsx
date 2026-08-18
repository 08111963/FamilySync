import { Alert, Platform, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

const NOTICE_TEXT =
  "Non inserire dati sanitari non necessari, documenti di identità, credenziali, dati bancari, indirizzi, numeri di telefono o informazioni di terzi non necessarie: il testo libero viene inviato al fornitore AI così com'è. Maggiori dettagli nella Privacy Policy.";

// Avviso privacy AI in forma compatta: solo il simbolo ⓘ.
// Il testo completo (già presente nella Privacy Policy) si apre toccando il simbolo.
export default function AiPrivacyNotice() {
  const { colors } = useTheme();

  const showNotice = () => {
    if (Platform.OS === "web") {
      alert(NOTICE_TEXT);
    } else {
      Alert.alert("Nota privacy AI", NOTICE_TEXT, [{ text: "OK" }]);
    }
  };

  return (
    <Pressable
      onPress={showNotice}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
      testID="ai-privacy-notice"
      accessibilityLabel="Nota privacy AI"
    >
      <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignSelf: "flex-start",
    padding: 4,
    marginVertical: 2,
  },
});

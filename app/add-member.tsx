import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import Colors from "@/constants/colors";

const ROLES = [
  { value: "parent", label: "Genitore", icon: "person" as const },
  { value: "child", label: "Figlio/a", icon: "happy" as const },
  { value: "other", label: "Altro", icon: "people" as const },
];

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { addMember } = useFamily();

  const [name, setName] = useState("");
  const [role, setRole] = useState<"parent" | "child" | "other">("parent");
  const [selectedColor, setSelectedColor] = useState(Colors.light.memberColors[0]);

  const handleSave = () => {
    if (name.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addMember({
        name: name.trim(),
        role,
        avatar: name.trim()[0].toUpperCase(),
        color: selectedColor,
      });
      router.back();
    }
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

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.field}>
          <Input
            label="Nome"
            placeholder="Inserisci il nome"
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Ruolo</Text>
          <View style={styles.roleOptions}>
            {ROLES.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRole(r.value as "parent" | "child" | "other");
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

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Colore</Text>
          <View style={styles.colorOptions}>
            {Colors.light.memberColors.map((color) => (
              <Pressable
                key={color}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedColor(color);
                }}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorSelected,
                ]}
              >
                {selectedColor === color && (
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.preview}>
          <Text style={[styles.label, { color: colors.text }]}>Anteprima</Text>
          <Card style={styles.previewCard}>
            <View style={styles.previewContent}>
              <View
                style={[
                  styles.previewAvatar,
                  { backgroundColor: selectedColor },
                ]}
              >
                <Text style={styles.previewAvatarText}>
                  {name.trim() ? name.trim()[0].toUpperCase() : "?"}
                </Text>
              </View>
              <View style={styles.previewInfo}>
                <Text style={[styles.previewName, { color: colors.text }]}>
                  {name.trim() || "Nome"}
                </Text>
                <Text style={[styles.previewRole, { color: colors.textSecondary }]}>
                  {ROLES.find((r) => r.value === role)?.label}
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <Button
          title="Aggiungi Membro"
          onPress={handleSave}
          disabled={!name.trim()}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  roleOptions: {
    flexDirection: "row",
    gap: 12,
  },
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
  roleLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  colorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  preview: {
    marginTop: 8,
  },
  previewCard: {
    marginTop: 0,
  },
  previewContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  previewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  previewAvatarText: {
    fontSize: 24,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  previewRole: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});

import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";

const UNIT_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "—" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "pcs", label: "pz" },
  { value: "tbsp", label: "cucchiai" },
  { value: "tsp", label: "cucchiaini" },
  { value: "cup", label: "tazze" },
  { value: "pinch", label: "pizzico" },
  { value: "to_taste", label: "q.b." },
];

interface IngredientDraft {
  name: string;
  quantity: string;
  unit: string | null;
}

export default function AddRecipeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    { name: "", quantity: "", unit: null },
  ]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateIngredient = (index: number, patch: Partial<IngredientDraft>) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, ...patch } : ing))
    );
  };

  const addIngredient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients((prev) => [...prev, { name: "", quantity: "", unit: null }]);
  };

  const removeIngredient = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  const addStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSteps((prev) => [...prev, ""]);
  };

  const removeStep = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const parsePositiveInt = (value: string): number | undefined => {
    const n = parseInt(value.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const handleSave = async () => {
    if (!currentFamily || saving) return;
    setError(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Inserisci il nome della ricetta.");
      return;
    }

    const cleanIngredients = ingredients
      .map((ing) => ({
        name: ing.name.trim(),
        quantity: ing.quantity.trim(),
        unit: ing.unit,
      }))
      .filter((ing) => ing.name.length > 0);

    if (cleanIngredients.length === 0) {
      setError("Aggiungi almeno un ingrediente.");
      return;
    }

    const cleanSteps = steps.map((s) => s.trim()).filter((s) => s.length > 0);

    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await apiRequest("POST", `/api/recipes/${currentFamily.id}/recipes`, {
        title: cleanTitle,
        description: description.trim() || undefined,
        servings: parsePositiveInt(servings),
        prepTimeMinutes: parsePositiveInt(prepTime),
        cookTimeMinutes: parsePositiveInt(cookTime),
        steps: cleanSteps,
        source: "manual",
        ingredients: cleanIngredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity || null,
          unit: ing.unit,
        })),
      });
      qc.invalidateQueries({
        queryKey: ["/api/recipes", currentFamily.id, "recipes"],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      setError(e?.message || "Errore nel salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      color: colors.text,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Nuova Ricetta
        </Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomInset + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Nome della ricetta *
          </Text>
          <TextInput
            style={inputStyle}
            placeholder="es. Lasagne della nonna"
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
            testID="input-recipe-title"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Descrizione
          </Text>
          <TextInput
            style={[...inputStyle, styles.textArea]}
            placeholder="Breve descrizione (facoltativa)"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            testID="input-recipe-description"
          />

          <View style={styles.row3}>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Porzioni
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="4"
                placeholderTextColor={colors.textSecondary}
                value={servings}
                onChangeText={setServings}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Prep. (min)
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="20"
                placeholderTextColor={colors.textSecondary}
                value={prepTime}
                onChangeText={setPrepTime}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Cottura (min)
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="40"
                placeholderTextColor={colors.textSecondary}
                value={cookTime}
                onChangeText={setCookTime}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Ingredienti *
            </Text>
            <Pressable onPress={addIngredient} hitSlop={8} testID="button-add-ingredient">
              <Ionicons name="add-circle" size={26} color={colors.primary} />
            </Pressable>
          </View>

          {ingredients.map((ing, idx) => (
            <View
              key={idx}
              style={[
                styles.ingredientCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.ingredientRow}>
                <TextInput
                  style={[
                    styles.ingredientName,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder="Ingrediente"
                  placeholderTextColor={colors.textSecondary}
                  value={ing.name}
                  onChangeText={(v) => updateIngredient(idx, { name: v })}
                  testID={`input-ingredient-name-${idx}`}
                />
                <TextInput
                  style={[
                    styles.ingredientQty,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder="Qtà"
                  placeholderTextColor={colors.textSecondary}
                  value={ing.quantity}
                  onChangeText={(v) => updateIngredient(idx, { quantity: v })}
                  keyboardType="decimal-pad"
                />
                {ingredients.length > 1 ? (
                  <Pressable onPress={() => removeIngredient(idx)} hitSlop={8}>
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={colors.error}
                    />
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.unitRow}
              >
                {UNIT_OPTIONS.map((opt) => {
                  const selected = ing.unit === opt.value;
                  return (
                    <Pressable
                      key={String(opt.value)}
                      onPress={() => {
                        Haptics.selectionAsync();
                        updateIngredient(idx, { unit: opt.value });
                      }}
                      style={[
                        styles.unitChip,
                        {
                          backgroundColor: selected
                            ? colors.primary
                            : colors.background,
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.unitChipText,
                          { color: selected ? "#FFFFFF" : colors.textSecondary },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ))}

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Preparazione
            </Text>
            <Pressable onPress={addStep} hitSlop={8} testID="button-add-step">
              <Ionicons name="add-circle" size={26} color={colors.primary} />
            </Pressable>
          </View>

          {steps.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View
                style={[styles.stepBadge, { backgroundColor: colors.primary + "18" }]}
              >
                <Text style={[styles.stepBadgeText, { color: colors.primary }]}>
                  {idx + 1}
                </Text>
              </View>
              <TextInput
                style={[...inputStyle, styles.stepInput]}
                placeholder={`Passaggio ${idx + 1}`}
                placeholderTextColor={colors.textSecondary}
                value={step}
                onChangeText={(v) => updateStep(idx, v)}
                multiline
                testID={`input-step-${idx}`}
              />
              {steps.length > 1 ? (
                <Pressable onPress={() => removeStep(idx)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              ) : null}
            </View>
          ))}

          {error ? (
            <View
              style={[styles.errorBanner, { backgroundColor: colors.error + "15" }]}
            >
              <Ionicons name="warning-outline" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed || saving ? 0.7 : 1,
              },
            ]}
            testID="button-save-recipe"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.saveButtonText}>
              {saving ? "Salvataggio..." : "Salva Ricetta"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingBottom: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  row3: {
    flexDirection: "row",
    gap: 10,
  },
  rowField: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  ingredientCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ingredientName: {
    flex: 1,
    borderBottomWidth: 1,
    paddingVertical: 6,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  ingredientQty: {
    width: 60,
    borderBottomWidth: 1,
    paddingVertical: 6,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  unitRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  unitChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  stepBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  stepInput: {
    flex: 1,
    minHeight: 46,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 20,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});

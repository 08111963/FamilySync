import { useState } from "react";
import { StyleSheet, Text, View, Pressable, FlatList, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { EmptyState } from "@/components/EmptyState";

const UNIT_OPTIONS = [
  { value: "", label: "-" },
  { value: "pz", label: "pz" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "L", label: "L" },
];

const CATEGORY_OPTIONS = [
  { value: "food", label: "Cibo", icon: "nutrition-outline" as const },
  { value: "household_cleaning", label: "Casa", icon: "home-outline" as const },
  { value: "personal_care", label: "Persona", icon: "person-outline" as const },
];

const CATEGORY_COLORS: Record<string, string> = {
  food: "#4CAF50",
  household_cleaning: "#2196F3",
  personal_care: "#E91E63",
};

const CATEGORY_LABELS: Record<string, string> = {
  food: "Cibo",
  household_cleaning: "Casa",
  personal_care: "Persona",
};

export default function ShoppingListScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, currentFamily, addShoppingItem, toggleShoppingItem, deleteShoppingItem } = useFamily();

  const list = data.shoppingLists.find((l) => l.id === id);
  const [newItemName, setNewItemName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCategory, setNewCategory] = useState("food");
  const [showOptions, setShowOptions] = useState(false);

  const familyId = currentFamily?.id || "";

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Lista non trovata</Text>
      </View>
    );
  }

  const handleAddItem = () => {
    if (newItemName.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      let quantityStr: string | undefined;
      if (newQuantity.trim()) {
        quantityStr = newUnit ? `${newQuantity.trim()} ${newUnit}` : newQuantity.trim();
      }
      addShoppingItem(id, {
        name: newItemName.trim(),
        quantity: quantityStr,
        category: newCategory,
      });
      setNewItemName("");
      setNewQuantity("");
      setNewUnit("");
      setShowOptions(false);
    }
  };

  const handleToggleItem = (itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleShoppingItem(id, itemId);
  };

  const handleDeleteItem = (itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteShoppingItem(id, itemId);
  };

  const handleReportItem = (itemId: string) => {
    router.push({
      pathname: "/report-content",
      params: { targetType: "shopping_item", targetId: itemId, familyId },
    });
  };

  const handleItemLongPress = (itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      if (confirm("Vuoi segnalare questo prodotto?")) {
        handleReportItem(itemId);
      }
    } else {
      Alert.alert("Azioni", "", [
        { text: "Segnala", onPress: () => handleReportItem(itemId) },
        { text: "Annulla", style: "cancel" },
      ]);
    }
  };

  const uncheckedItems = list.items.filter((i) => !i.isChecked);
  const checkedItems = list.items.filter((i) => i.isChecked);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {list.name}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <View style={[styles.inputSection, { paddingHorizontal: 20 }]}>
        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Aggiungi prodotto..."
            placeholderTextColor={colors.textSecondary}
            value={newItemName}
            onChangeText={setNewItemName}
            onSubmitEditing={handleAddItem}
            returnKeyType="done"
            keyboardAppearance={isDark ? "dark" : "light"}
          />
          <Pressable
            onPress={() => setShowOptions(!showOptions)}
            style={styles.optionsToggle}
          >
            <Ionicons name={showOptions ? "chevron-up" : "options-outline"} size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={handleAddItem}
            disabled={!newItemName.trim()}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: newItemName.trim() ? colors.primary : colors.border },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="add" size={24} color={newItemName.trim() ? "#FFFFFF" : colors.textSecondary} />
          </Pressable>
        </View>

        {showOptions && (
          <View style={[styles.optionsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.quantityRow}>
              <TextInput
                style={[styles.quantityInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="Qtà"
                placeholderTextColor={colors.textSecondary}
                value={newQuantity}
                onChangeText={setNewQuantity}
                keyboardType="numeric"
                keyboardAppearance={isDark ? "dark" : "light"}
              />
              <View style={styles.unitPicker}>
                {UNIT_OPTIONS.map((u) => (
                  <Pressable
                    key={u.value}
                    onPress={() => setNewUnit(u.value)}
                    style={[
                      styles.unitOption,
                      {
                        backgroundColor: newUnit === u.value ? colors.primary : "transparent",
                        borderColor: newUnit === u.value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.unitText, { color: newUnit === u.value ? "#FFFFFF" : colors.text }]}>
                      {u.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.categoryRow}>
              {CATEGORY_OPTIONS.map((c) => (
                <Pressable
                  key={c.value}
                  onPress={() => setNewCategory(c.value)}
                  style={[
                    styles.categoryOption,
                    {
                      backgroundColor: newCategory === c.value ? CATEGORY_COLORS[c.value] + "20" : "transparent",
                      borderColor: newCategory === c.value ? CATEGORY_COLORS[c.value] : colors.border,
                    },
                  ]}
                >
                  <Ionicons name={c.icon} size={16} color={newCategory === c.value ? CATEGORY_COLORS[c.value] : colors.textSecondary} />
                  <Text style={[styles.categoryText, { color: newCategory === c.value ? CATEGORY_COLORS[c.value] : colors.textSecondary }]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      <FlatList
        data={[...uncheckedItems, ...checkedItems]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        scrollEnabled={list.items.length > 0}
        ListEmptyComponent={
          <EmptyState
            icon="basket-outline"
            title="Lista vuota"
            subtitle="Aggiungi prodotti usando il campo sopra"
          />
        }
        ListHeaderComponent={
          uncheckedItems.length > 0 ? (
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              Da Comprare ({uncheckedItems.length})
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => {
          const isFirstChecked = item.isChecked && uncheckedItems.length > 0 && index === uncheckedItems.length;
          const catColor = CATEGORY_COLORS[item.category || "food"] || CATEGORY_COLORS.food;
          const catLabel = CATEGORY_LABELS[item.category || "food"] || "Cibo";

          return (
            <>
              {isFirstChecked && (
                <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 16 }]}>
                  Fatto ({checkedItems.length})
                </Text>
              )}
              <Pressable
                onPress={() => handleToggleItem(item.id)}
                onLongPress={() => handleItemLongPress(item.id)}
                style={[
                  styles.itemRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: item.isChecked ? colors.success : "transparent",
                      borderColor: item.isChecked ? colors.success : colors.border,
                    },
                  ]}
                >
                  {item.isChecked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </View>
                <View style={styles.itemContent}>
                  <View style={styles.itemNameRow}>
                    <Text
                      style={[
                        styles.itemName,
                        {
                          color: item.isChecked ? colors.textSecondary : colors.text,
                          textDecorationLine: item.isChecked ? "line-through" : "none",
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {item.quantity ? (
                      <Text style={[styles.itemQuantity, { color: colors.primary }]}>
                        {item.quantity}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.categoryBadge, { backgroundColor: catColor + "15" }]}>
                    <Text style={[styles.categoryBadgeText, { color: catColor }]}>
                      {catLabel}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => handleDeleteItem(item.id)}
                  hitSlop={8}
                  style={styles.deleteButton}
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </Pressable>
            </>
          );
        }}
      />
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  optionsToggle: {
    padding: 8,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  optionsRow: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityInput: {
    width: 56,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  unitPicker: {
    flexDirection: "row",
    gap: 4,
    flex: 1,
  },
  unitOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  unitText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  categoryOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemName: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
  },
  itemQuantity: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  deleteButton: {
    padding: 4,
  },
});

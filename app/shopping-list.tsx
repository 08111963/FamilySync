import { useState } from "react";
import { StyleSheet, Text, View, Pressable, FlatList, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { EmptyState } from "@/components/EmptyState";

export default function ShoppingListScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, addShoppingItem, toggleShoppingItem, deleteShoppingItem } = useFamily();

  const list = data.shoppingLists.find((l) => l.id === id);
  const [newItemName, setNewItemName] = useState("");

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>List not found</Text>
      </View>
    );
  }

  const handleAddItem = () => {
    if (newItemName.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      addShoppingItem(id, {
        name: newItemName.trim(),
        addedBy: data.members[0]?.id || "",
      });
      setNewItemName("");
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

  const uncheckedItems = list.items.filter((i) => !i.isChecked);
  const checkedItems = list.items.filter((i) => i.isChecked);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {list.name}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Add item..."
          placeholderTextColor={colors.textSecondary}
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={handleAddItem}
          returnKeyType="done"
          keyboardAppearance={isDark ? "dark" : "light"}
        />
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

      <FlatList
        data={[...uncheckedItems, ...checkedItems]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        scrollEnabled={list.items.length > 0}
        ListEmptyComponent={
          <EmptyState
            icon="basket-outline"
            title="List is empty"
            subtitle="Add items using the input above"
          />
        }
        ListHeaderComponent={
          uncheckedItems.length > 0 ? (
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              To Buy ({uncheckedItems.length})
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => {
          const isFirstChecked = item.isChecked && uncheckedItems.length > 0 && index === uncheckedItems.length;
          
          return (
            <>
              {isFirstChecked && (
                <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 16 }]}>
                  Done ({checkedItems.length})
                </Text>
              )}
              <Pressable
                onPress={() => handleToggleItem(item.id)}
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
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 16,
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
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
  itemName: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  deleteButton: {
    padding: 4,
  },
});

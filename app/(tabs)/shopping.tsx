import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";

export default function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { data, addShoppingList, deleteShoppingList } = useFamily();
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");

  const handleCreateList = () => {
    if (newListName.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      addShoppingList(newListName.trim());
      setNewListName("");
      setShowNewList(false);
    }
  };

  const handleDeleteList = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteShoppingList(id);
  };

  const getCompletedCount = (listId: string) => {
    const list = data.shoppingLists.find((l) => l.id === listId);
    if (!list) return { completed: 0, total: 0 };
    return {
      completed: list.items.filter((i) => i.isChecked).length,
      total: list.items.length,
    };
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Spesa</Text>
        <Pressable
          onPress={() => setShowNewList(true)}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {showNewList && (
        <Card style={styles.newListCard}>
          <Text style={[styles.newListTitle, { color: colors.text }]}>Nuova Lista</Text>
          <TextInput
            style={[
              styles.newListInput,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Nome della lista..."
            placeholderTextColor={colors.textSecondary}
            value={newListName}
            onChangeText={setNewListName}
            autoFocus
            keyboardAppearance={isDark ? "dark" : "light"}
          />
          <View style={styles.newListButtons}>
            <Pressable
              onPress={() => {
                setShowNewList(false);
                setNewListName("");
              }}
              style={styles.cancelButton}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Annulla</Text>
            </Pressable>
            <Button title="Crea" onPress={handleCreateList} size="small" disabled={!newListName.trim()} />
          </View>
        </Card>
      )}

      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {data.shoppingLists.length === 0 ? (
          <EmptyState
            icon="cart-outline"
            title="Nessuna lista della spesa"
            subtitle="Crea una lista per iniziare ad aggiungere prodotti"
          />
        ) : (
          <View style={styles.lists}>
            {data.shoppingLists.map((list) => {
              const { completed, total } = getCompletedCount(list.id);
              const progress = total > 0 ? completed / total : 0;

              return (
                <Card
                  key={list.id}
                  onPress={() => router.push({ pathname: "/shopping-list", params: { id: list.id } })}
                >
                  <View style={styles.listHeader}>
                    <View style={styles.listInfo}>
                      <Text style={[styles.listName, { color: colors.text }]}>{list.name}</Text>
                      <Text style={[styles.listCount, { color: colors.textSecondary }]}>
                        {total} prodott{total !== 1 ? "i" : "o"}
                        {total > 0 && ` · ${completed} complet${completed !== 1 ? "i" : "o"}`}
                      </Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteList(list.id);
                      }}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                  {total > 0 && (
                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { backgroundColor: colors.success, width: `${progress * 100}%` },
                        ]}
                      />
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  newListCard: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  newListTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  newListInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  newListButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  lists: {
    gap: 12,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  listCount: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  deleteButton: {
    padding: 8,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 12,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
});

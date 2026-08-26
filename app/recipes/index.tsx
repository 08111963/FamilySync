import { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Keyboard,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import AiPrivacyNotice from "@/components/AiPrivacyNotice";
import { useTheme } from "@/hooks/useTheme";
import { VoiceInput, speakText, primeSpeech } from "@/components/VoiceInput";
import { useAutoSpeak } from "@/hooks/useAutoSpeak";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest, apiFetch, getApiUrl } from "@/lib/query-client";
import { aiErrorMessage, isAiDisabled } from "@/lib/ai-error-message";
import { EmptyState } from "@/components/EmptyState";
import { RecipeAiImage } from "@/components/RecipeImage";

interface RecipeTag {
  diet?: string[];
  allergens?: string[];
  cuisine?: string;
  difficulty?: string;
}

interface Recipe {
  id: string;
  familyId: string;
  title: string;
  description?: string | null;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  steps: string[];
  tags?: RecipeTag | null;
  imageUrl?: string | null;
  source?: string;
  createdAt: string;
}


const TAG_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#74B9FF",
  "#A29BFE",
  "#FAB1A0",
  "#55EFC4",
  "#FFEAA7",
  "#FD79A8",
];

function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length] as string;
}

// Normalizza il testo per la ricerca locale: minuscole e senza accenti,
// così "ragù" trova anche "ragu" e viceversa.
function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function recipeMatchesQuery(recipe: Recipe, normalizedQuery: string): boolean {
  const haystack: string[] = [recipe.title];
  if (recipe.description) haystack.push(recipe.description);
  const tags = recipe.tags;
  if (tags) {
    if (tags.cuisine) haystack.push(tags.cuisine);
    if (tags.difficulty) haystack.push(tags.difficulty);
    if (Array.isArray(tags.diet)) haystack.push(...tags.diet);
    if (Array.isArray(tags.allergens)) haystack.push(...tags.allergens);
  }
  return normalizeSearchText(haystack.join(" ")).includes(normalizedQuery);
}

export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const { autoSpeak, toggleAutoSpeak } = useAutoSpeak();
  const qc = useQueryClient();

  const [generatingAi, setGeneratingAi] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedQuery, setSavedQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const recipesQuery = useQuery<Recipe[]>({
    queryKey: ["/api/recipes", currentFamily?.id, "recipes"],
    enabled: !!currentFamily?.id,
  });

  const recipes = recipesQuery.data || [];

  // Ricerca dedicata alle ricette SALVATE (separata dalla ricerca AI):
  // filtra solo la lista qui sotto, senza chiamare l'AI.
  const trimmedSavedQuery = savedQuery.trim();
  const filteredRecipes = useMemo(() => {
    if (trimmedSavedQuery.length < 2) return recipes;
    const nq = normalizeSearchText(trimmedSavedQuery);
    return recipes.filter((r) => recipeMatchesQuery(r, nq));
  }, [recipes, trimmedSavedQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await recipesQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [recipesQuery]);

  const handleGenerateAi = async () => {
    if (!currentFamily) return;
    const q = searchQuery.trim();
    const useQuery = q.length >= 2;
    setGeneratingAi(true);
    setAiError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (useQuery) Keyboard.dismiss();
      if (!useQuery) {
        // Generazione incrementale: avvia sul server e apri subito la preview,
        // che mostra le ricette man mano che i batch arrivano.
        const data = await apiFetch<{ generationId?: string }>(
          `/api/ai/${currentFamily.id}/recipe-suggestions`,
          { method: "POST", body: { count: 8, incremental: true } }
        );
        if (!data.generationId) {
          setAiError("Nessuna ricetta generata. Riprova.");
          return;
        }
        router.push({
          pathname: "/recipes/preview" as any,
          params: { recipesJson: "[]", generationId: data.generationId, query: "" },
        });
        return;
      }
      const data = await apiFetch<{ recipes?: any[] }>(
        `/api/ai/${currentFamily.id}/recipe-search`,
        { method: "POST", body: { query: q } }
      );
      const list = data.recipes || [];
      if (list.length === 0) {
        setAiError("Nessuna ricetta trovata. Prova con altri termini.");
        return;
      }
      router.push({
        pathname: "/recipes/preview" as any,
        params: { recipesJson: JSON.stringify(list), query: q },
      });
    } catch (error: any) {
      if (isAiDisabled(error)) {
        setAiError("Funzionalità AI non disponibile per questo profilo.");
      } else {
        setAiError(aiErrorMessage(error, "Errore nella generazione. Riprova."));
      }
    } finally {
      setGeneratingAi(false);
    }
  };

  const runAiSearch = async (rawQuery: string, opts?: { speakResults?: boolean }) => {
    const q = rawQuery.trim();
    // Guardia anti-doppioni: una ricerca già in corso non deve partire due
    // volte (doppia chiamata API e doppia lettura ad alta voce).
    if (!currentFamily || q.length < 2 || searching) return;
    Keyboard.dismiss();
    setSearching(true);
    setAiError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const data = await apiFetch<{ recipes?: any[] }>(
        `/api/ai/${currentFamily.id}/recipe-search`,
        { method: "POST", body: { query: q } }
      );
      const list = data.recipes || [];
      if (list.length === 0) {
        setAiError("Nessuna ricetta trovata. Prova con altri termini.");
        if (opts?.speakResults) {
          speakText(`Non ho trovato ricette per ${q}. Prova con altre parole.`);
        }
        return;
      }
      if (opts?.speakResults) {
        const parts = list.map((r: any, i: number) => {
          const title = r?.title || `Ricetta ${i + 1}`;
          const desc = (r?.description || "").trim();
          return desc ? `${title}: ${desc}` : title;
        });
        speakText(
          `Ho trovato ${list.length} ${list.length === 1 ? "ricetta" : "ricette"} per ${q}. ${parts.join(". ")}`
        );
      }
      router.push({
        pathname: "/recipes/preview" as any,
        params: { recipesJson: JSON.stringify(list), query: q },
      });
    } catch (error: any) {
      if (isAiDisabled(error)) {
        setAiError("Funzionalità AI non disponibile per questo profilo.");
      } else {
        setAiError(aiErrorMessage(error, "Errore nella ricerca. Riprova."));
      }
    } finally {
      setSearching(false);
    }
  };

  // Il toggle lettura ad alta voce vale anche per la ricerca avviata dal pulsante.
  const handleSearch = () => {
    // Sblocca la voce del browser dentro il tocco (Chrome Android).
    if (autoSpeak) primeSpeech();
    return runAiSearch(searchQuery, { speakResults: autoSpeak });
  };

  // Dettatura vocale: inserisce il testo, avvia subito la ricerca AI
  // e legge ad alta voce le ricette trovate.
  const handleVoiceSearch = (text: string) => {
    setSearchQuery(text);
    runAiSearch(text, { speakResults: autoSpeak });
  };

  const handleDeleteRecipe = async (recipeId: string, title: string) => {
    if (!currentFamily) return;
    const doDelete = async () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await apiRequest("DELETE", `/api/recipes/${currentFamily.id}/recipes/${recipeId}`);
        qc.invalidateQueries({ queryKey: ["/api/recipes", currentFamily.id, "recipes"] });
      } catch (error) {
        console.error("Delete recipe error:", error);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Vuoi eliminare "${title}"?`)) {
        await doDelete();
      }
    } else {
      Alert.alert("Elimina ricetta", `Vuoi eliminare "${title}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleRecipePress = (recipeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/recipes/${recipeId}` as any);
  };

  const formatTime = (minutes?: number | null): string | null => {
    if (!minutes) return null;
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m}min` : `${h}h`;
    }
    return `${minutes} min`;
  };

  const collectTags = (tags?: RecipeTag | null): string[] => {
    if (!tags) return [];
    const result: string[] = [];
    if (tags.cuisine) result.push(tags.cuisine);
    if (tags.difficulty) result.push(tags.difficulty);
    if (tags.diet) result.push(...tags.diet);
    return result;
  };

  const renderRecipeCard = useCallback(
    ({ item }: { item: Recipe }) => {
      const totalTime =
        (item.prepTimeMinutes || 0) + (item.cookTimeMinutes || 0);
      const timeStr = formatTime(totalTime || item.cookTimeMinutes);
      const tagsList = collectTags(item.tags);

      return (
        <Pressable
          onPress={() => handleRecipePress(item.id)}
          onLongPress={() => handleDeleteRecipe(item.id, item.title)}
          style={({ pressed }) => [
            styles.recipeCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <RecipeAiImage
            title={item.title}
            imageUrl={item.imageUrl}
            familyId={currentFamily?.id}
            // Ricetta salvata senza foto: recupera dalla cache foto del server
            // (nessuna generazione AI, nessuna quota). Se non c'è, niente foto.
            resolveOnly
            height={130}
            borderRadius={12}
            wrapStyle={styles.recipeImageWrap}
          />
          <View style={styles.recipeCardHeader}>
            <Text
              style={[styles.recipeTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                handleDeleteRecipe(item.id, item.title);
              }}
              hitSlop={12}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 8,
                backgroundColor: pressed ? colors.error + "15" : "transparent",
              })}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </Pressable>
          </View>

          {item.description ? (
            <Text
              style={[styles.recipeDescription, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}

          <View style={styles.recipeInfoRow}>
            {timeStr ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSecondary }]}
                >
                  {timeStr}
                </Text>
              </View>
            ) : null}
            {item.servings ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSecondary }]}
                >
                  {item.servings}
                </Text>
              </View>
            ) : null}
            {item.source === "ai" ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="sparkles"
                  size={14}
                  color={colors.secondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.secondary }]}
                >
                  AI
                </Text>
              </View>
            ) : null}
          </View>

          {tagsList.length > 0 ? (
            <View style={styles.tagsRow}>
              {tagsList.slice(0, 4).map((tag, idx) => (
                <View
                  key={tag + idx}
                  style={[
                    styles.tagPill,
                    { backgroundColor: getTagColor(idx) + "20" },
                  ]}
                >
                  <Text
                    style={[styles.tagText, { color: getTagColor(idx) }]}
                    numberOfLines={1}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors, currentFamily]
  );

  // Tutti i controlli sopra la lista scorrono insieme alle ricette:
  // resta fissa solo la barra di navigazione in alto.
  const listHeader = (
    // Compensa il paddingHorizontal del contenuto della lista: le sezioni
    // interne hanno già i propri margini orizzontali da 20.
    <View style={{ marginHorizontal: -20 }}>
      {aiError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + "15" }]}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{aiError}</Text>
          <Pressable onPress={() => setAiError(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.error} />
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        ✨ Genera nuove ricette con l'AI
      </Text>

      <Pressable
        onPress={handleGenerateAi}
        disabled={generatingAi || searching}
        style={({ pressed }) => [
          styles.generateButton,
          {
            backgroundColor: colors.secondary,
            opacity: pressed || generatingAi ? 0.7 : 1,
            marginHorizontal: 20,
            marginBottom: 10,
          },
        ]}
      >
        {generatingAi ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="sparkles" size={20} color="#FFFFFF" />
        )}
        <Text style={styles.generateButtonText} numberOfLines={1}>
          {generatingAi
            ? "Generazione in corso..."
            : searchQuery.trim().length >= 2
              ? `Genera ricette con "${searchQuery.trim()}"`
              : "Genera Ricette AI"}
        </Text>
      </Pressable>

      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Chiedi una ricetta all'AI... es. pasta al forno"
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          editable={!searching && !generatingAi}
        />
        {searching ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : searchQuery.trim().length >= 2 ? (
          <Pressable onPress={handleSearch} hitSlop={8}>
            <Ionicons name="arrow-forward-circle" size={28} color={colors.primary} />
          </Pressable>
        ) : null}
        {currentFamily ? (
          <VoiceInput
            familyId={currentFamily.id}
            disabled={searching || generatingAi}
            onTranscribed={handleVoiceSearch}
          />
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <AiPrivacyNotice />
      </View>

      {currentFamily ? (
        <Pressable
          onPress={toggleAutoSpeak}
          style={styles.autoSpeakRow}
          accessibilityRole="switch"
          accessibilityState={{ checked: autoSpeak }}
          testID="recipes-autospeak-toggle"
        >
          <Ionicons
            name={autoSpeak ? "volume-high" : "volume-mute"}
            size={18}
            color={autoSpeak ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.autoSpeakLabel, { color: colors.textSecondary }]}>
            L'AI legge le ricette ad alta voce
          </Text>
          <View pointerEvents="none">
            <Switch
              value={autoSpeak}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Pressable>
      ) : null}

      <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        📖 Le tue ricette salvate{recipes.length > 0 ? ` (${recipes.length})` : ""}
      </Text>

      {recipes.length > 0 ? (
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Cerca tra le ricette salvate..."
            placeholderTextColor={colors.textSecondary}
            value={savedQuery}
            onChangeText={setSavedQuery}
            returnKeyType="done"
            testID="saved-recipes-search"
          />
          {savedQuery.length > 0 ? (
            <Pressable onPress={() => setSavedQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {trimmedSavedQuery.length >= 2 && recipes.length > 0 ? (
        <Text style={[styles.filterInfo, { color: colors.textSecondary }]}>
          {filteredRecipes.length === 0
            ? `Nessuna ricetta salvata per "${trimmedSavedQuery}"`
            : `${filteredRecipes.length} ricett${filteredRecipes.length === 1 ? "a salvata" : "e salvate"} per "${trimmedSavedQuery}"`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Le Mie Ricette
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/recipes/add" as any);
            }}
            style={styles.headerButton}
            testID="button-add-recipe"
          >
            <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={handleGenerateAi}
            disabled={generatingAi}
            style={styles.headerButton}
          >
            {generatingAi ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Ionicons name="sparkles" size={24} color={colors.secondary} />
            )}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.id}
        renderItem={renderRecipeCard}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomInset + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          recipesQuery.isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : trimmedSavedQuery.length >= 2 && recipes.length > 0 ? (
            <EmptyState
              icon="search-outline"
              title="Nessuna ricetta trovata"
              subtitle={`Nessuna delle tue ricette salvate corrisponde a "${trimmedSavedQuery}". Prova con un'altra parola, oppure genera ricette nuove con l'AI qui sopra.`}
            />
          ) : (
            <EmptyState
              icon="restaurant-outline"
              title="Nessuna ricetta"
              subtitle="Genera nuove ricette con l'AI usando il pulsante qui sopra"
            />
          )
        }
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
    paddingBottom: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  sectionDivider: {
    borderTopWidth: 1,
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 12,
  },
  filterInfo: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  errorActionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  errorActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  autoSpeakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  autoSpeakLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 2,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  recipeImageWrap: {
    marginBottom: 12,
  },
  recipeCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  recipeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  recipeTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    marginRight: 8,
  },
  recipeDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 10,
  },
  recipeInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  centerContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
});

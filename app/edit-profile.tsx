import { useState, useMemo, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { apiUpload, apiRequest } from "@/lib/query-client";

const AVATAR_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#14B8A6",
  "#0EA5E9",
  "#3B82F6",
  "#84CC16",
  "#F97316",
  "#64748B",
];

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, updateMember, refetchAll } = useFamily();
  const { user, refreshUser } = useAuth();

  const member = useMemo(
    () => data.members.find((m) => m.userId === user?.id),
    [data.members, user?.id]
  );

  const [color, setColor] = useState<string>(member?.color ?? AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(member?.avatarUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingColor, setIsSavingColor] = useState(false);

  // Allinea la baseline locale quando il record del membro diventa disponibile
  // (o cambia identità). Dipende solo da member?.id per evitare loop e non
  // sovrascrivere le selezioni ottimistiche dell'utente.
  useEffect(() => {
    if (member) {
      setColor(member.color);
      setAvatarUrl(member.avatarUrl ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const topInset = Platform.OS === "web" ? 24 : insets.top;

  const uploadAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      const uriParts = asset.uri.split(".");
      const ext = uriParts[uriParts.length - 1]?.split("?")[0] || "jpg";
      const fileName = `avatar_${Date.now()}.${ext}`;

      if (Platform.OS === "web") {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        formData.append("file", blob, fileName);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: fileName,
          type: asset.mimeType || `image/${ext}`,
        } as any);
      }

      const res = await apiUpload<{ avatarUrl: string }>("/api/profile/avatar", formData);
      setAvatarUrl(res.avatarUrl);
      await refreshUser();
      refetchAll();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Errore upload avatar:", error);
      Alert.alert("Errore", "Impossibile caricare la foto. Riprova.");
    } finally {
      setIsUploading(false);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permesso necessario", "Serve il permesso per accedere alla galleria");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await uploadAsset(result.assets[0]);
  };

  const handleTakePhoto = async () => {
    if (Platform.OS === "web") {
      await handlePickImage();
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permesso necessario", "Serve il permesso per usare la fotocamera");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await uploadAsset(result.assets[0]);
  };

  const handleRemovePhoto = () => {
    Alert.alert("Rimuovere la foto?", "Tornerai alle iniziali colorate.", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Rimuovi",
        style: "destructive",
        onPress: async () => {
          setIsUploading(true);
          try {
            await apiRequest("DELETE", "/api/profile/avatar");
            setAvatarUrl(null);
            await refreshUser();
            refetchAll();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.error("Errore rimozione avatar:", error);
            Alert.alert("Errore", "Impossibile rimuovere la foto. Riprova.");
          } finally {
            setIsUploading(false);
          }
        },
      },
    ]);
  };

  const handleSelectColor = async (newColor: string) => {
    if (!member || newColor === color) return;
    const prev = color;
    setColor(newColor);
    setIsSavingColor(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateMember(member.id, { color: newColor });
    } catch (error) {
      console.error("Errore salvataggio colore:", error);
      setColor(prev);
      Alert.alert("Errore", "Impossibile salvare il colore. Riprova.");
    } finally {
      setIsSavingColor(false);
    }
  };

  const displayName = member?.name ?? user?.name ?? "Tu";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Il mio profilo</Text>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          testID="close-profile-button"
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatarPreview}>
          <Avatar name={displayName} color={color} size={120} avatarUrl={avatarUrl} />
          {isUploading && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          )}
        </View>
        <Text style={[styles.previewName, { color: colors.text }]}>{displayName}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Foto profilo</Text>
        <Card>
          <Pressable
            onPress={handleTakePhoto}
            disabled={isUploading}
            style={styles.optionRow}
            testID="take-photo-button"
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="camera" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.optionLabel, { color: colors.text }]}>Scatta una foto</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={handlePickImage}
            disabled={isUploading}
            style={styles.optionRow}
            testID="pick-image-button"
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="image" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.optionLabel, { color: colors.text }]}>Scegli dalla galleria</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>

          {avatarUrl && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable
                onPress={handleRemovePhoto}
                disabled={isUploading}
                style={styles.optionRow}
                testID="remove-photo-button"
              >
                <View style={[styles.optionIcon, { backgroundColor: colors.error + "20" }]}>
                  <Ionicons name="trash" size={20} color={colors.error} />
                </View>
                <Text style={[styles.optionLabel, { color: colors.error }]}>Rimuovi foto</Text>
              </Pressable>
            </>
          )}
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Colore</Text>
        <Card>
          <View style={styles.colorGrid}>
            {AVATAR_COLORS.map((c) => {
              const selected = c === color;
              return (
                <Pressable
                  key={c}
                  onPress={() => handleSelectColor(c)}
                  disabled={isSavingColor}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    selected && { borderColor: colors.text, borderWidth: 3 },
                  ]}
                  testID={`color-${c}`}
                >
                  {selected && <Ionicons name="checkmark" size={22} color="#FFFFFF" />}
                </Pressable>
              );
            })}
          </View>
        </Card>
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
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    bottom: 10,
  },
  scroll: {
    flex: 1,
  },
  avatarPreview: {
    alignSelf: "center",
    marginTop: 8,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 60,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 20,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingVertical: 4,
  },
  colorSwatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
});

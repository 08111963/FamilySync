import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  Pressable,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useMediaToken } from "@/hooks/useMediaToken";
import { useFamily } from "@/context/FamilyContext";
import { getApiUrl, apiFetch, apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io as socketIO, Socket } from "socket.io-client";

const AUTH_STORAGE_KEY = "@family_sync_auth";

interface ChatMsg {
  id: string;
  familyId: string;
  userId: string;
  messageType: "text" | "image" | "file";
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  userName: string;
  userAvatar: string | null;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDate.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Oggi";
  if (days === 1) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildMediaUrl(fileUrl: string, baseUrl: string, token: string | null): string {
  const url = new URL(fileUrl, baseUrl);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function MessageBubble({ msg, isOwn, colors, isDark, showDateHeader, mediaToken, getFileToken }: {
  msg: ChatMsg;
  isOwn: boolean;
  colors: any;
  isDark: boolean;
  showDateHeader: string | null;
  mediaToken: string | null;
  getFileToken: (filePath: string) => Promise<string | null>;
}) {
  const baseUrl = getApiUrl();

  const handleOpen = async () => {
    if (!msg.fileUrl) return;
    const fileToken = (await getFileToken(msg.fileUrl)) ?? mediaToken;
    if (!fileToken) return;
    Linking.openURL(buildMediaUrl(msg.fileUrl, baseUrl, fileToken));
  };

  const handleFilePress = handleOpen;
  const handleImagePress = handleOpen;

  return (
    <View>
      {showDateHeader && (
        <View style={styles.dateHeaderContainer}>
          <View style={[styles.dateHeaderBadge, { backgroundColor: isDark ? "#333" : "#E0E0E0" }]}>
            <Text style={[styles.dateHeaderText, { color: colors.textSecondary }]}>{showDateHeader}</Text>
          </View>
        </View>
      )}
      <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
        {!isOwn && (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{msg.userName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={[
          styles.bubble,
          isOwn ? [styles.bubbleOwn, { backgroundColor: colors.primary }] : [styles.bubbleOther, { backgroundColor: isDark ? "#2A2A2A" : "#F0F0F0" }],
        ]}>
          {!isOwn && (
            <Text style={[styles.senderName, { color: colors.secondary }]}>{msg.userName}</Text>
          )}

          {msg.messageType === "image" && msg.fileUrl && (
            mediaToken ? (
              <Pressable onPress={handleImagePress}>
                <Image
                  source={{ uri: buildMediaUrl(msg.fileUrl, baseUrl, mediaToken) }}
                  style={styles.chatImage}
                  resizeMode="cover"
                />
              </Pressable>
            ) : (
              <View style={[styles.chatImage, styles.chatImagePlaceholder, { backgroundColor: isDark ? "#333" : "#E8E8E8" }]}>
                <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
              </View>
            )
          )}

          {msg.messageType === "file" && msg.fileUrl && (
            <TouchableOpacity onPress={handleFilePress} style={[styles.fileAttachment, { backgroundColor: isOwn ? "rgba(255,255,255,0.2)" : (isDark ? "#333" : "#E8E8E8") }]}>
              <Ionicons name="document-outline" size={24} color={isOwn ? "#fff" : colors.text} />
              <View style={styles.fileInfo}>
                <Text style={[styles.fileName, { color: isOwn ? "#fff" : colors.text }]} numberOfLines={1}>{msg.fileName || "File"}</Text>
                {msg.fileSize && <Text style={[styles.fileSize, { color: isOwn ? "rgba(255,255,255,0.7)" : colors.textSecondary }]}>{formatFileSize(msg.fileSize)}</Text>}
              </View>
              <Ionicons name="download-outline" size={20} color={isOwn ? "#fff" : colors.textSecondary} />
            </TouchableOpacity>
          )}

          {msg.content && (
            <Text style={[styles.messageText, { color: isOwn ? "#fff" : colors.text }]}>{msg.content}</Text>
          )}

          <Text style={[styles.timeText, { color: isOwn ? "rgba(255,255,255,0.6)" : colors.textSecondary }]}>{formatTime(msg.createdAt)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === "web" ? 84 : (49 + insets.bottom);
  const { colors, isDark } = useTheme();
  const { user, accessToken } = useAuth();
  const { currentFamily, data } = useFamily();
  const familyId = currentFamily?.id;
  const { mediaToken, getFileToken } = useMediaToken(familyId);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const baseUrl = getApiUrl();

  const getHeaders = useCallback(async () => {
    const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { Authorization: `Bearer ${parsed.accessToken}` };
    }
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }, [accessToken]);

  const fetchMessages = useCallback(async (cursor?: string) => {
    if (!familyId) return;
    try {
      let route = `/api/chat/${familyId}/messages?limit=50`;
      if (cursor) route += `&cursor=${encodeURIComponent(cursor)}`;

      const result = await apiFetch<{ messages: ChatMsg[]; hasMore: boolean; nextCursor: string | null }>(route);
      if (cursor) {
        setMessages(prev => [...prev, ...result.messages]);
      } else {
        setMessages(result.messages);
      }
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (error) {
      console.error("Errore fetch messaggi:", error);
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  }, [familyId]);

  useEffect(() => {
    if (!familyId || !accessToken) return;

    setIsLoading(true);
    fetchMessages();

    const socket = socketIO(baseUrl.replace(/\/$/, ""), {
      auth: { token: accessToken },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("join_family", familyId);
    });

    socket.on("chat:new_message", (msg: ChatMsg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
    });

    socket.on("chat:message_deleted", (data: { messageId: string }) => {
      setMessages(prev => prev.filter(m => m.id !== data.messageId));
    });

    socket.on("chat:typing", (data: { userId: string; userName: string }) => {
      if (data.userId !== user?.id) {
        setTypingUsers(prev => {
          const next = new Map(prev);
          next.set(data.userId, data.userName);
          return next;
        });
      }
    });

    socket.on("chat:stop_typing", (data: { userId: string }) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    });

    socketRef.current = socket;

    return () => {
      socket.emit("leave_family", familyId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [familyId, accessToken]);

  const inputTextRef = useRef(inputText);
  inputTextRef.current = inputText;

  const handleSend = useCallback(async () => {
    const currentText = inputTextRef.current;
    if (!currentText.trim() || !familyId || isSending) return;
    const text = currentText.trim();
    setInputText("");
    if (inputRef.current) {
      inputRef.current.clear();
    }
    setIsSending(true);

    if (isTypingRef.current && socketRef.current) {
      socketRef.current.emit("chat:stop_typing", { familyId });
      isTypingRef.current = false;
    }

    try {
      const res = await apiRequest("POST", `/api/chat/${familyId}/messages`, { content: text });
      const sentMsg = await res.json() as ChatMsg;
      setMessages(prev => {
        if (prev.some(m => m.id === sentMsg.id)) return prev;
        return [sentMsg, ...prev];
      });
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      Alert.alert("Errore", "Impossibile inviare il messaggio");
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  }, [familyId, isSending]);

  const handleTyping = useCallback((text: string) => {
    setInputText(text);
    if (!familyId || !socketRef.current) return;

    if (!isTypingRef.current && text.length > 0) {
      isTypingRef.current = true;
      socketRef.current.emit("chat:typing", { familyId, userName: user?.name || "" });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current && socketRef.current) {
        socketRef.current.emit("chat:stop_typing", { familyId });
        isTypingRef.current = false;
      }
    }, 2000);
  }, [familyId, user?.name]);

  const handlePickImage = useCallback(async () => {
    if (!familyId) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permesso necessario", "Serve il permesso per accedere alla galleria");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUploading(true);

    try {
      const asset = result.assets[0];
      const headers = await getHeaders();
      const formData = new FormData();

      const uriParts = asset.uri.split(".");
      const ext = uriParts[uriParts.length - 1] || "jpg";
      const fileName = `photo_${Date.now()}.${ext}`;

      formData.append("file", {
        uri: asset.uri,
        name: fileName,
        type: asset.mimeType || `image/${ext}`,
      } as any);

      const url = new URL(`/api/chat/${familyId}/upload`, baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { ...headers },
        credentials: "include",
        body: formData,
      } as any);

      if (!res.ok) throw new Error("Errore upload");
      const sentMsg = await res.json() as ChatMsg;
      setMessages(prev => {
        if (prev.some(m => m.id === sentMsg.id)) return prev;
        return [sentMsg, ...prev];
      });
    } catch (error) {
      console.error("Errore upload immagine:", error);
      Alert.alert("Errore", "Impossibile caricare l'immagine");
    } finally {
      setIsUploading(false);
    }
  }, [familyId, baseUrl, getHeaders]);

  const handleTakePhoto = useCallback(async () => {
    if (!familyId) return;

    if (Platform.OS === "web") {
      Alert.alert(
        "Fotocamera non disponibile sul web",
        "La fotocamera funziona solo nell'app sul telefono (apri FamilySync con Expo Go o l'app installata). Sul web puoi usare Galleria o Documento."
      );
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permesso necessario", "Serve il permesso per usare la fotocamera");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUploading(true);

    try {
      const asset = result.assets[0];
      const headers = await getHeaders();
      const formData = new FormData();

      const fileName = `camera_${Date.now()}.jpg`;
      formData.append("file", {
        uri: asset.uri,
        name: fileName,
        type: "image/jpeg",
      } as any);

      const url = new URL(`/api/chat/${familyId}/upload`, baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { ...headers },
        credentials: "include",
        body: formData,
      } as any);

      if (!res.ok) throw new Error("Errore upload");
      const sentMsg = await res.json() as ChatMsg;
      setMessages(prev => {
        if (prev.some(m => m.id === sentMsg.id)) return prev;
        return [sentMsg, ...prev];
      });
    } catch (error) {
      console.error("Errore upload foto:", error);
      Alert.alert("Errore", "Impossibile caricare la foto");
    } finally {
      setIsUploading(false);
    }
  }, [familyId, baseUrl, getHeaders]);

  const handlePickDocument = useCallback(async () => {
    if (!familyId) return;

    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsUploading(true);

    try {
      const asset = result.assets[0];
      const headers = await getHeaders();
      const formData = new FormData();

      if (Platform.OS === "web" && asset.file) {
        formData.append("file", asset.file, asset.name);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: asset.name || `file_${Date.now()}`,
          type: asset.mimeType || "application/octet-stream",
        } as any);
      }

      const url = new URL(`/api/chat/${familyId}/upload`, baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { ...headers },
        credentials: "include",
        body: formData,
      } as any);

      if (!res.ok) throw new Error("Errore upload");
      const sentMsg = await res.json() as ChatMsg;
      setMessages(prev => {
        if (prev.some(m => m.id === sentMsg.id)) return prev;
        return [sentMsg, ...prev];
      });
    } catch (error) {
      console.error("Errore upload documento:", error);
      Alert.alert("Errore", "Impossibile caricare il documento");
    } finally {
      setIsUploading(false);
    }
  }, [familyId, baseUrl, getHeaders]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!familyId) return;
    Alert.alert("Elimina messaggio", "Vuoi eliminare questo messaggio?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest("DELETE", `/api/chat/${familyId}/messages/${messageId}`);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert("Errore", "Impossibile eliminare il messaggio");
          }
        },
      },
    ]);
  }, [familyId]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    fetchMessages(nextCursor);
  }, [hasMore, loadingMore, nextCursor, fetchMessages]);

  const handleAttachmentMenu = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setAttachMenuVisible(true);
  }, []);

  const handleSelectGallery = useCallback(() => {
    setAttachMenuVisible(false);
    handlePickImage();
  }, [handlePickImage]);

  const handleSelectCamera = useCallback(() => {
    setAttachMenuVisible(false);
    handleTakePhoto();
  }, [handleTakePhoto]);

  const handleSelectDocument = useCallback(() => {
    setAttachMenuVisible(false);
    handlePickDocument();
  }, [handlePickDocument]);

  const typingText = useMemo(() => {
    const names = Array.from(typingUsers.values());
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} sta scrivendo...`;
    return `${names.join(", ")} stanno scrivendo...`;
  }, [typingUsers]);

  const messagesWithDates = useMemo(() => {
    const result: { msg: ChatMsg; dateHeader: string | null }[] = [];
    let lastDate = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgDate = new Date(msg.createdAt).toDateString();
      const dateHeader = msgDate !== lastDate ? formatDate(msg.createdAt) : null;
      lastDate = msgDate;
      result.push({ msg, dateHeader });
    }
    result.reverse();
    return result;
  }, [messages]);

  if (!familyId) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessuna famiglia</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Crea o unisciti a una famiglia per chattare</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={[styles.header, {
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        paddingTop: Platform.OS === "web" ? 67 + 12 : insets.top + 12,
      }]}>
        <Ionicons name="chatbubbles" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chat {data.familyName}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messagesWithDates}
        keyExtractor={(item) => item.msg.id}
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => {
              if (item.msg.userId === user?.id) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleDeleteMessage(item.msg.id);
              }
            }}
          >
            <MessageBubble
              msg={item.msg}
              isOwn={item.msg.userId === user?.id}
              colors={colors}
              isDark={isDark}
              showDateHeader={item.dateHeader}
              mediaToken={mediaToken}
              getFileToken={getFileToken}
            />
          </Pressable>
        )}
        inverted
        contentContainerStyle={styles.messageList}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={{ padding: 16 }} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyChatText, { color: colors.textSecondary }]}>Nessun messaggio ancora</Text>
            <Text style={[styles.emptyChatSubtext, { color: colors.textSecondary }]}>Inizia la conversazione!</Text>
          </View>
        }
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      />

      {typingText && (
        <View style={[styles.typingBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[styles.typingText, { color: colors.textSecondary }]}>{typingText}</Text>
        </View>
      )}

      <View style={[styles.inputBar, {
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
        paddingBottom: tabBarHeight + 8,
      }]}>
        <TouchableOpacity onPress={handleAttachmentMenu} style={styles.attachButton} disabled={isUploading}>
          {isUploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
          )}
        </TouchableOpacity>

        <View style={[styles.inputContainer, { backgroundColor: isDark ? "#2A2A2A" : "#F0F0F0", borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            placeholder="Scrivi un messaggio..."
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={handleTyping}
            multiline
            maxLength={2000}
            editable={!isSending}
          />
        </View>

        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendButton, { backgroundColor: inputText.trim() ? colors.primary : isDark ? "#333" : "#DDD" }]}
          disabled={!inputText.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color={inputText.trim() ? "#fff" : colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={attachMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachMenuVisible(false)}
      >
        <Pressable style={styles.attachOverlay} onPress={() => setAttachMenuVisible(false)}>
          <Pressable
            style={[styles.attachSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.attachHandle} />
            <Text style={[styles.attachTitle, { color: colors.text }]}>Allega</Text>

            <TouchableOpacity style={styles.attachOption} onPress={handleSelectGallery}>
              <View style={[styles.attachIconCircle, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="images-outline" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.attachOptionText, { color: colors.text }]}>Galleria</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachOption} onPress={handleSelectCamera}>
              <View style={[styles.attachIconCircle, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="camera-outline" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.attachOptionText, { color: colors.text }]}>Fotocamera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachOption} onPress={handleSelectDocument}>
              <View style={[styles.attachIconCircle, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="document-text-outline" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.attachOptionText, { color: colors.text }]}>Documento (PDF)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.attachCancel, { borderColor: colors.border }]}
              onPress={() => setAttachMenuVisible(false)}
            >
              <Text style={[styles.attachCancelText, { color: colors.textSecondary }]}>Annulla</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  messageList: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  attachOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  attachSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  attachHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#999",
    alignSelf: "center",
    marginBottom: 12,
  },
  attachTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  attachOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  attachIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  attachOptionText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  attachCancel: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  attachCancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  dateHeaderContainer: {
    alignItems: "center",
    marginVertical: 12,
  },
  dateHeaderBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  bubbleRow: {
    flexDirection: "row",
    marginVertical: 2,
    paddingHorizontal: 4,
  },
  bubbleRowOwn: {
    justifyContent: "flex-end",
  },
  bubbleRowOther: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginTop: 4,
  },
  avatarText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  bubble: {
    maxWidth: "75%",
    padding: 10,
    borderRadius: 18,
  },
  bubbleOwn: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  timeText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    alignSelf: "flex-end",
    marginTop: 4,
  },
  chatImage: {
    width: 220,
    height: 180,
    borderRadius: 12,
    marginBottom: 4,
  },
  chatImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  fileAttachment: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  fileInfo: {
    flex: 1,
    marginHorizontal: 8,
  },
  fileName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  fileSize: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  typingText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  inputContainer: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
    marginHorizontal: 4,
  },
  input: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyChat: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 12,
  },
  emptyChatSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center",
  },
});

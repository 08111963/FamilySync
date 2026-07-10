import { useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Alert, ActivityIndicator, Image, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { useSubscription } from "@/lib/revenuecat";
import { useMediaToken } from "@/hooks/useMediaToken";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Input } from "@/components/Input";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { presentLocalNotification } from "@/hooks/usePushNotifications";
import { CATEGORY_META, formatEuro, formatDueDate, billDueLabel, type BillComputedStatus } from "@/app/(tabs)/bills";

const AUTH_STORAGE_KEY = "@family_sync_auth";

interface BillSplit {
  id: string;
  memberId: string;
  amount: string;
  isPaid: boolean;
  memberName?: string | null;
  memberColor?: string | null;
}

interface BillAttachment {
  id: string;
  kind: "document" | "receipt";
  fileUrl: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number;
}

interface BillReminder {
  type: string;
  date: string;
  label: string;
  isDue: boolean;
}

interface BillDetail {
  id: string;
  familyId: string;
  title: string;
  provider?: string | null;
  category: string;
  amount: string;
  dueDate: string;
  holder?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
  remindersEnabled: boolean;
  status: "da_pagare" | "pagata";
  computedStatus: BillComputedStatus;
  paidAt?: string | null;
  splitType?: "equal" | "custom" | null;
  splits: BillSplit[];
  attachments: BillAttachment[];
  history: { id: string; amount: string; note?: string | null; paidAt: string; paidByName?: string | null }[];
  reminders: BillReminder[];
}

const STATUS_META: Record<BillComputedStatus, { label: string; color: string }> = {
  da_pagare: { label: "Da pagare", color: "#74B9FF" },
  scaduta: { label: "Scaduta", color: "#E74C3C" },
  pagata: { label: "Pagata", color: "#00B894" },
};

function buildMediaUrl(fileUrl: string, baseUrl: string, token: string | null): string {
  const url = new URL(fileUrl, baseUrl);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export default function BillDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { currentFamily, data } = useFamily();
  const { isSubscribed } = useSubscription();
  const { id } = useLocalSearchParams<{ id: string }>();
  const familyId = currentFamily?.id;
  const { mediaToken, getFileToken } = useMediaToken(familyId);
  const baseUrl = getApiUrl();

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  const detailQuery = useQuery<BillDetail>({
    queryKey: [`/api/bills/${familyId}/${id}`],
    enabled: !!familyId && !!id,
    staleTime: 5000,
  });

  const bill = detailQuery.data;

  const showError = (msg: string) => {
    if (Platform.OS === "web") alert(msg);
    else Alert.alert("Errore", msg);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/bills/${familyId}/${id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/bills/${familyId}`] });
  };

  const handleTogglePaid = async () => {
    if (!familyId || !bill) return;
    const markPaid = bill.status !== "pagata";
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await apiRequest("PATCH", `/api/bills/${familyId}/${bill.id}/pay`, { paid: markPaid });
      refresh();
    } catch {
      showError("Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    const doDelete = async () => {
      if (!familyId || !bill) return;
      setBusy(true);
      try {
        await apiRequest("DELETE", `/api/bills/${familyId}/${bill.id}`);
        queryClient.invalidateQueries({ queryKey: [`/api/bills/${familyId}`] });
        router.back();
      } catch {
        showError("Impossibile eliminare la bolletta");
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") {
      if (confirm("Eliminare questa bolletta?")) doDelete();
    } else {
      Alert.alert("Elimina bolletta", "Sei sicuro di voler eliminare questa bolletta?", [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleSplitEqual = async () => {
    if (!familyId || !bill) return;
    if (!isSubscribed) return router.push("/premium");
    const memberIds = data.members.map((m) => m.id);
    if (memberIds.length === 0) return showError("Aggiungi prima dei membri alla famiglia");
    setBusy(true);
    try {
      await apiRequest("PUT", `/api/bills/${familyId}/${bill.id}/splits`, { type: "equal", memberIds });
      refresh();
    } catch (e: any) {
      if (String(e?.message ?? "").includes("PREMIUM_REQUIRED")) router.push("/premium");
      else showError("Impossibile creare la ripartizione");
    } finally {
      setBusy(false);
    }
  };

  const parseAmount = (v: string) => {
    const n = parseFloat((v || "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  };

  const billTotal = bill ? parseAmount(bill.amount) : 0;
  const enteredTotal = useMemo(
    () => data.members.reduce((sum, m) => sum + parseAmount(customAmounts[m.id] ?? ""), 0),
    [data.members, customAmounts]
  );
  // Stessa identica formula del backend (server/routes/bills.ts): nessun arrotondamento
  // anticipato, così se il frontend abilita il salvataggio anche il backend lo accetta.
  const splitDifferenceRaw = billTotal - enteredTotal;
  const splitDifference = Math.round(splitDifferenceRaw * 100) / 100; // solo per visualizzazione
  const customSplitValid = Math.abs(splitDifferenceRaw) <= 0.01 && enteredTotal > 0;

  const handleSplitCustom = async () => {
    if (!familyId || !bill) return;
    if (!isSubscribed) return router.push("/premium");
    if (data.members.length === 0) return showError("Aggiungi prima dei membri alla famiglia");
    const splits = data.members
      .map((m) => ({ memberId: m.id, amount: parseAmount(customAmounts[m.id] ?? "") }))
      .filter((s) => s.amount > 0);
    if (splits.length === 0) return showError("Inserisci almeno una quota");
    if (!customSplitValid) {
      return showError("La somma delle quote deve coincidere con l'importo della bolletta");
    }
    setBusy(true);
    try {
      await apiRequest("PUT", `/api/bills/${familyId}/${bill.id}/splits`, { type: "custom", splits });
      setCustomAmounts({});
      refresh();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("PREMIUM_REQUIRED")) router.push("/premium");
      else if (msg.includes("VALIDATION_ERROR")) showError("La somma delle quote non coincide con l'importo della bolletta");
      else if (msg.includes("INVALID_MEMBER")) showError("Uno dei membri non è valido per questa famiglia");
      else showError("Impossibile creare la ripartizione");
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async (formData: FormData) => {
    if (!familyId || !bill) return;
    setUploading(true);
    try {
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      const token = raw ? JSON.parse(raw).accessToken : null;
      const url = new URL(`/api/bills/${familyId}/${bill.id}/attachments`, baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        body: formData,
      } as any);
      if (!res.ok) {
        if (res.status === 403) return router.push("/premium");
        throw new Error("upload");
      }
      refresh();
    } catch {
      showError("Impossibile caricare l'allegato");
    } finally {
      setUploading(false);
    }
  };

  const handleAddPhoto = async (kind: "document" | "receipt") => {
    if (!isSubscribed) return router.push("/premium");
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return showError("Serve il permesso per accedere alla galleria");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = asset.uri.split(".").pop() || "jpg";
    const formData = new FormData();
    formData.append("kind", kind);
    if (Platform.OS === "web" && (asset as any).file) {
      formData.append("file", (asset as any).file, `foto_${Date.now()}.${ext}`);
    } else {
      formData.append("file", { uri: asset.uri, name: `foto_${Date.now()}.${ext}`, type: asset.mimeType || `image/${ext}` } as any);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    uploadAttachment(formData);
  };

  const handleAddDocument = async (kind: "document" | "receipt") => {
    if (!isSubscribed) return router.push("/premium");
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf"], copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const formData = new FormData();
    formData.append("kind", kind);
    if (Platform.OS === "web" && asset.file) {
      formData.append("file", asset.file, asset.name);
    } else {
      formData.append("file", { uri: asset.uri, name: asset.name || `doc_${Date.now()}.pdf`, type: asset.mimeType || "application/pdf" } as any);
    }
    uploadAttachment(formData);
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!familyId || !bill) return;
    try {
      await apiRequest("DELETE", `/api/bills/${familyId}/${bill.id}/attachments/${attId}`);
      refresh();
    } catch {
      showError("Impossibile eliminare l'allegato");
    }
  };

  const handleOpenAttachment = async (att: BillAttachment) => {
    const fileToken = (await getFileToken(att.fileUrl)) ?? mediaToken;
    if (!fileToken) return;
    Linking.openURL(buildMediaUrl(att.fileUrl, baseUrl, fileToken));
  };

  const handleTestReminder = async () => {
    if (!bill) return;
    if (Platform.OS === "web") {
      alert("Le notifiche locali sono disponibili solo nell'app sul telefono.");
      return;
    }
    const next = bill.reminders.find((r) => !r.isDue) ?? bill.reminders[0];
    await presentLocalNotification(
      `Promemoria: ${bill.title}`,
      next ? `${next.label} (${formatDueDate(bill.dueDate)})` : `Scadenza ${formatDueDate(bill.dueDate)}`,
      { billId: bill.id }
    );
  };

  const assignedMember = useMemo(
    () => data.members.find((m) => m.id === bill?.assignedTo),
    [data.members, bill?.assignedTo]
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  if (detailQuery.isLoading || !bill) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background, paddingTop: topInset }]}>
        {detailQuery.isError ? (
          <Text style={{ color: colors.textSecondary }}>Bolletta non trovata</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const cat = CATEGORY_META[bill.category] ?? CATEGORY_META.altro;
  const status = STATUS_META[bill.computedStatus];
  const due = billDueLabel(bill);
  const isOverdue = bill.computedStatus === "scaduta";
  const isPaid = bill.computedStatus === "pagata";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Dettaglio</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push(`/add-bill?id=${bill.id}`)} style={styles.iconButton}>
            <Ionicons name="create-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable onPress={handleDelete} style={styles.iconButton}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {isOverdue && (
          <View style={[styles.statusBanner, { backgroundColor: STATUS_META.scaduta.color + "1A", borderColor: STATUS_META.scaduta.color }]}>
            <Ionicons name="alert-circle" size={20} color={STATUS_META.scaduta.color} />
            <Text style={[styles.statusBannerText, { color: STATUS_META.scaduta.color }]}>
              Bolletta scaduta: {due.text.toLowerCase()}. Da saldare al più presto.
            </Text>
          </View>
        )}
        {isPaid && (
          <View style={[styles.statusBanner, { backgroundColor: STATUS_META.pagata.color + "1A", borderColor: STATUS_META.pagata.color }]}>
            <Ionicons name="checkmark-circle" size={20} color={STATUS_META.pagata.color} />
            <Text style={[styles.statusBannerText, { color: STATUS_META.pagata.color }]}>
              {due.text}. Nessuna azione necessaria.
            </Text>
          </View>
        )}

        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: isOverdue ? STATUS_META.scaduta.color + "66" : colors.border, borderLeftColor: status.color, borderLeftWidth: 4 }]}>
          <View style={[styles.catIcon, { backgroundColor: cat.color + "22" }]}>
            <Ionicons name={cat.icon} size={28} color={cat.color} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>{bill.title}</Text>
          {bill.provider ? <Text style={[styles.heroSub, { color: colors.textSecondary }]}>{bill.provider}</Text> : null}
          <Text style={[styles.heroAmount, { color: colors.text }]}>{formatEuro(bill.amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.color + "22" }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          <Text style={[styles.heroDue, { color: due.urgent ? STATUS_META.scaduta.color : colors.textSecondary }, due.urgent && styles.heroDueUrgent]}>
            {isPaid ? `Scadeva il ${formatDueDate(bill.dueDate)}` : `Scadenza: ${formatDueDate(bill.dueDate)} · ${due.text}`}
          </Text>
        </View>

        <Button
          title={isPaid ? "Riporta a \u201Cda pagare\u201D" : isOverdue ? "Salda ora: segna come pagata" : "Segna come pagata"}
          onPress={handleTogglePaid}
          loading={busy}
          variant={isPaid ? "outline" : "primary"}
          style={{ marginBottom: 20 }}
        />

        {(bill.holder || assignedMember || bill.notes) && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {bill.holder ? (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Intestatario</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{bill.holder}</Text>
              </View>
            ) : null}
            {assignedMember ? (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Responsabile</Text>
                <View style={styles.memberInline}>
                  <Avatar name={assignedMember.name} color={assignedMember.color} size={24} avatarUrl={assignedMember.avatarUrl} />
                  <Text style={[styles.infoValue, { color: colors.text }]}>{assignedMember.name}</Text>
                </View>
              </View>
            ) : null}
            {bill.notes ? (
              <View style={styles.infoColumn}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Note</Text>
                <Text style={[styles.infoValue, { color: colors.text, marginTop: 4 }]}>{bill.notes}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Promemoria */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Promemoria</Text>
          {Platform.OS !== "web" && bill.reminders.length > 0 && (
            <Pressable onPress={handleTestReminder}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Prova notifica</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {!bill.remindersEnabled ? (
            <Text style={[styles.muted, { color: colors.textSecondary }]}>Promemoria disattivati per questa bolletta.</Text>
          ) : bill.reminders.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textSecondary }]}>
              {isPaid ? "Bolletta pagata: i promemoria non servono più." : "Nessun promemoria per questa bolletta."}
            </Text>
          ) : (
            bill.reminders.map((r) => (
              <View key={r.type} style={styles.reminderRow}>
                <Ionicons
                  name={r.isDue ? "notifications" : "notifications-outline"}
                  size={18}
                  color={r.isDue ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.reminderLabel, { color: colors.text }]}>{r.label}</Text>
                <Text style={[styles.reminderDate, { color: colors.textSecondary }]}>{formatDueDate(r.date)}</Text>
              </View>
            ))
          )}
          {!isSubscribed && (
            <Text style={[styles.muted, { color: colors.textSecondary, marginTop: 8 }]}>
              Con Premium ricevi anche promemoria a 7 e 3 giorni dalla scadenza.
            </Text>
          )}
        </View>

        {/* Ripartizione */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Ripartizione</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {!isSubscribed ? (
            <PremiumLock colors={colors} text="Dividi la bolletta tra i membri con Premium." onPress={() => router.push("/premium")} />
          ) : (
            <>
              {bill.splits.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  {bill.splits.map((s) => (
                    <View key={s.id} style={styles.splitRow}>
                      <View style={styles.memberInline}>
                        <Avatar name={s.memberName ?? "?"} color={s.memberColor ?? colors.primary} size={24} avatarUrl={data.members.find((m) => m.id === s.memberId)?.avatarUrl} />
                        <Text style={[styles.infoValue, { color: colors.text }]}>{s.memberName ?? "Membro"}</Text>
                      </View>
                      <Text style={[styles.splitAmount, { color: colors.text }]}>{formatEuro(s.amount)}</Text>
                    </View>
                  ))}
                  <Text style={[styles.muted, { color: colors.textSecondary, marginTop: 8 }]}>
                    Ripartizione attuale: {bill.splitType === "custom" ? "personalizzata" : "equa"}. Modificala qui sotto.
                  </Text>
                </View>
              )}

              {/* Selettore modalità */}
              <View style={[styles.modeToggle, { borderColor: colors.border }]}>
                <Pressable
                  testID="split-mode-equal"
                  onPress={() => setSplitMode("equal")}
                  style={[styles.modeBtn, splitMode === "equal" && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.modeBtnText, { color: splitMode === "equal" ? "#FFF" : colors.text }]}>
                    Dividi equamente
                  </Text>
                </Pressable>
                <Pressable
                  testID="split-mode-custom"
                  onPress={() => setSplitMode("custom")}
                  style={[styles.modeBtn, splitMode === "custom" && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.modeBtnText, { color: splitMode === "custom" ? "#FFF" : colors.text }]}>
                    Personalizzata
                  </Text>
                </Pressable>
              </View>

              {splitMode === "equal" ? (
                <>
                  <Text style={[styles.muted, { color: colors.textSecondary, marginBottom: 12 }]}>
                    L'importo verrà diviso in parti uguali tra tutti i membri della famiglia.
                  </Text>
                  <Button title="Dividi equamente" onPress={handleSplitEqual} size="small" loading={busy} />
                </>
              ) : (
                <>
                  <Text style={[styles.muted, { color: colors.textSecondary, marginBottom: 12 }]}>
                    Inserisci la quota di ogni membro. La somma deve corrispondere all'importo della bolletta.
                  </Text>
                  {data.members.map((m) => (
                    <View key={m.id} style={styles.customRow}>
                      <View style={styles.memberInline}>
                        <Avatar name={m.name} color={m.color} size={24} avatarUrl={m.avatarUrl} />
                        <Text style={[styles.infoValue, { color: colors.text }]}>{m.name}</Text>
                      </View>
                      <Input
                        testID={`split-amount-${m.id}`}
                        placeholder="0,00"
                        keyboardType="decimal-pad"
                        value={customAmounts[m.id] ?? ""}
                        onChangeText={(t) => setCustomAmounts((prev) => ({ ...prev, [m.id]: t }))}
                        style={styles.customInput}
                      />
                    </View>
                  ))}

                  <View style={[styles.totalsBox, { borderColor: colors.border }]}>
                    <View style={styles.totalsRow}>
                      <Text style={[styles.muted, { color: colors.textSecondary }]}>Totale bolletta</Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>{formatEuro(billTotal.toFixed(2))}</Text>
                    </View>
                    <View style={styles.totalsRow}>
                      <Text style={[styles.muted, { color: colors.textSecondary }]}>Totale quote inserite</Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>{formatEuro(enteredTotal.toFixed(2))}</Text>
                    </View>
                    <View style={styles.totalsRow}>
                      <Text style={[styles.muted, { color: colors.textSecondary }]}>Differenza residua</Text>
                      <Text
                        testID="split-difference"
                        style={[styles.infoValue, { color: customSplitValid ? colors.success ?? "#00B894" : colors.error }]}
                      >
                        {formatEuro(splitDifference.toFixed(2))}
                      </Text>
                    </View>
                  </View>

                  {enteredTotal > 0 && !customSplitValid && (
                    <Text testID="split-error" style={[styles.error, { color: colors.error }]}>
                      La somma delle quote ({formatEuro(enteredTotal.toFixed(2))}) non coincide con l'importo della bolletta ({formatEuro(billTotal.toFixed(2))}).
                    </Text>
                  )}

                  <View style={styles.splitActions}>
                    <Button
                      testID="split-save-custom"
                      title="Salva ripartizione"
                      onPress={handleSplitCustom}
                      size="small"
                      loading={busy}
                      disabled={!customSplitValid}
                    />
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* Allegati */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Allegati e ricevute</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {!isSubscribed ? (
            <PremiumLock colors={colors} text="Archivia bollette e ricevute (PDF o foto) con Premium." onPress={() => router.push("/premium")} />
          ) : (
            <>
              {bill.attachments.length === 0 ? (
                <Text style={[styles.muted, { color: colors.textSecondary, marginBottom: 12 }]}>Nessun allegato.</Text>
              ) : (
                bill.attachments.map((att) => {
                  const isImage = att.fileMimeType.startsWith("image/");
                  return (
                    <View key={att.id} style={[styles.attRow, { borderColor: colors.border }]}>
                      <Pressable style={styles.attMain} onPress={() => handleOpenAttachment(att)}>
                        {isImage && mediaToken ? (
                          <Image source={{ uri: buildMediaUrl(att.fileUrl, baseUrl, mediaToken) }} style={styles.attThumb} />
                        ) : (
                          <View style={[styles.attThumb, styles.center, { backgroundColor: isDark ? "#333" : "#EEE" }]}>
                            <Ionicons name={isImage ? "image" : "document-text"} size={22} color={colors.textSecondary} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.attName, { color: colors.text }]} numberOfLines={1}>{att.fileName}</Text>
                          <Text style={[styles.attKind, { color: colors.textSecondary }]}>
                            {att.kind === "receipt" ? "Ricevuta" : "Documento"}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteAttachment(att.id)} style={styles.iconButton}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  );
                })
              )}
              {uploading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />}
              <View style={styles.attButtons}>
                <Pressable onPress={() => handleAddPhoto("document")} style={[styles.attActionBtn, { borderColor: colors.border }]}>
                  <Ionicons name="image-outline" size={18} color={colors.text} />
                  <Text style={[styles.attActionText, { color: colors.text }]}>Foto bolletta</Text>
                </Pressable>
                <Pressable onPress={() => handleAddDocument("document")} style={[styles.attActionBtn, { borderColor: colors.border }]}>
                  <Ionicons name="document-outline" size={18} color={colors.text} />
                  <Text style={[styles.attActionText, { color: colors.text }]}>PDF</Text>
                </Pressable>
                <Pressable onPress={() => handleAddPhoto("receipt")} style={[styles.attActionBtn, { borderColor: colors.border }]}>
                  <Ionicons name="receipt-outline" size={18} color={colors.text} />
                  <Text style={[styles.attActionText, { color: colors.text }]}>Ricevuta</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* Storico pagamenti */}
        {isSubscribed && bill.history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Storico pagamenti</Text>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {bill.history.map((h) => (
                <View key={h.id} style={styles.splitRow}>
                  <View>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{formatEuro(h.amount)}</Text>
                    <Text style={[styles.attKind, { color: colors.textSecondary }]}>
                      {h.paidByName ?? "—"} · {formatDueDate(h.paidAt.slice(0, 10))}
                    </Text>
                  </View>
                  {h.note ? <Text style={[styles.muted, { color: colors.textSecondary, flex: 1, textAlign: "right" }]}>{h.note}</Text> : null}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PremiumLock({ colors, text, onPress }: { colors: any; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.premiumLock}>
      <Ionicons name="lock-closed" size={20} color={colors.textSecondary} />
      <Text style={[styles.muted, { color: colors.textSecondary, flex: 1 }]}>{text}</Text>
      <Text style={[styles.linkText, { color: colors.primary }]}>Premium</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  headerActions: { flexDirection: "row" },
  iconButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  content: { flex: 1, paddingHorizontal: 16 },
  heroCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    gap: 6,
  },
  catIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  heroAmount: { fontSize: 32, fontFamily: "Inter_700Bold", marginVertical: 4 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 10 },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  heroDue: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  heroDueUrgent: { fontFamily: "Inter_600SemiBold" },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  statusBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  muted: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoColumn: { paddingVertical: 4 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 15, fontFamily: "Inter_500Medium" },
  memberInline: { flexDirection: "row", alignItems: "center", gap: 8 },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  reminderLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  reminderDate: { fontSize: 13, fontFamily: "Inter_400Regular" },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  splitAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  splitActions: { marginTop: 8, flexDirection: "row" },
  modeToggle: { flexDirection: "row", borderWidth: 1, borderRadius: 10, padding: 3, marginBottom: 14, gap: 4 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  modeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  customRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  customInput: { width: 110, textAlign: "right" },
  totalsBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 6, gap: 6 },
  totalsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 10 },
  attRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  attMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  attThumb: { width: 44, height: 44, borderRadius: 8 },
  attName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  attKind: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  attButtons: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  attActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  attActionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  premiumLock: { flexDirection: "row", alignItems: "center", gap: 10 },
});

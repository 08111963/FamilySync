import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Alert, Share, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { apiFetch, queryClient } from "@/lib/query-client";
import { syncEventsToDeviceCalendar } from "@/lib/device-calendar";

export default function CalendarSyncScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily, data: familyData, isLoading: familyLoading } = useFamily();
  const familyId = currentFamily?.id;
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const feedQueryKey = ["/api/calendar", familyId, "feed-url"];
  const { data, isLoading, error } = useQuery<{ url: string }>({
    queryKey: feedQueryKey,
    queryFn: () => apiFetch<{ url: string }>(`/api/calendar/${familyId}/feed-url`),
    enabled: !!familyId,
  });

  const feedUrl = data?.url;

  const showMessage = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(message);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSyncToPhone = async () => {
    if (syncing || familyLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSyncing(true);
    try {
      // Data locale (NON UTC): evita off-by-one vicino a mezzanotte
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const upcoming = (familyData?.events ?? []).filter((e) => e.date >= todayStr);
      const result = await syncEventsToDeviceCalendar(upcoming);
      showMessage(result.ok ? "Fatto" : "Attenzione", result.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSubscribeIos = async () => {
    if (!feedUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
    try {
      await Linking.openURL(webcalUrl);
    } catch {
      showMessage(
        "Attenzione",
        "Non sono riuscito ad aprire l'app Calendario. Puoi copiare il link e aggiungerlo manualmente."
      );
    }
  };

  const handleDownloadIcs = async () => {
    if (Platform.OS !== "web" || !feedUrl || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(feedUrl);
      if (!res.ok) throw new Error("fetch failed");
      const text = await res.text();
      const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "familysync.ics";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showMessage(
        "Attenzione",
        "Non sono riuscito a scaricare il file. Riprova piu' tardi."
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleCopy = async () => {
    if (!feedUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (!feedUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      return;
    }
    try {
      await Share.share({ message: feedUrl });
    } catch {}
  };

  const handleRegenerate = async () => {
    if (!familyId || regenerating) return;

    const doRegenerate = async () => {
      setRegenerating(true);
      try {
        const fresh = await apiFetch<{ url: string }>(
          `/api/calendar/${familyId}/feed-url?regenerate=1`
        );
        queryClient.setQueryData(feedQueryKey, fresh);
        showMessage("Fatto", "Nuovo link creato. Il vecchio link non funziona piu'.");
      } catch {
        showMessage("Errore", "Non sono riuscito a rigenerare il link. Riprova.");
      } finally {
        setRegenerating(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Il link attuale smettera' di funzionare per chi lo usa. Continuare?")) {
        void doRegenerate();
      }
    } else {
      Alert.alert(
        "Rigenerare il link?",
        "Il link attuale smettera' di funzionare per chi lo usa gia'.",
        [
          { text: "Annulla", style: "cancel" },
          { text: "Rigenera", style: "destructive", onPress: () => void doRegenerate() },
        ]
      );
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + webTopInset + 12, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-button">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Sincronizza calendario</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 34 + 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {Platform.OS !== "web" && (
          <Card>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="phone-portrait-outline" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Sincronizza sul telefono (1 tocco)
              </Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              Copia tutti gli eventi futuri della famiglia in un calendario "FamilySync" dedicato
              sul tuo telefono. Ripeti quando vuoi per aggiornarli: niente duplicati.
            </Text>
            <Pressable
              onPress={handleSyncToPhone}
              disabled={syncing || familyLoading}
              style={[styles.actionBtn, { backgroundColor: colors.primary, alignSelf: "flex-start", opacity: syncing || familyLoading ? 0.6 : 1 }]}
              testID="sync-to-phone"
            >
              <Ionicons name="sync-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>
                {familyLoading ? "Carico gli eventi..." : syncing ? "Sincronizzo..." : "Sincronizza ora"}
              </Text>
            </Pressable>
          </Card>
        )}

        {Platform.OS === "web" && !!feedUrl && (
          <Card>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="download-outline" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Scarica e apri (modo piu' facile da PC)
              </Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              Scarica il file con tutti gli eventi della famiglia e aprilo con un doppio clic: il
              tuo calendario (Google, Apple o Outlook) ti chiedera' di aggiungerli. Nessun link da
              copiare. Per gli aggiornamenti automatici usa invece il link qui sotto.
            </Text>
            <Pressable
              onPress={handleDownloadIcs}
              disabled={syncing}
              style={[styles.actionBtn, { backgroundColor: colors.primary, alignSelf: "flex-start", opacity: syncing ? 0.6 : 1 }]}
              testID="download-ics"
            >
              <Ionicons name="download-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>
                {syncing ? "Preparo il file..." : "Scarica calendario"}
              </Text>
            </Pressable>
          </Card>
        )}

        {Platform.OS === "ios" && !!feedUrl && (
          <Card>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: "#8E8E9320" }]}>
                <Ionicons name="logo-apple" size={20} color={colors.text} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Iscriviti da iPhone (automatico)
              </Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              Un tocco e il calendario della famiglia si aggiunge all'app Calendario del tuo
              iPhone, con aggiornamento automatico dei nuovi eventi.
            </Text>
            <Pressable
              onPress={handleSubscribeIos}
              style={[styles.actionBtn, { backgroundColor: colors.text, alignSelf: "flex-start" }]}
              testID="subscribe-ios"
            >
              <Ionicons name="calendar-outline" size={18} color={colors.background} />
              <Text style={[styles.actionBtnText, { color: colors.background }]}>
                Aggiungi al Calendario iPhone
              </Text>
            </Pressable>
          </Card>
        )}

        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="link-outline" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Link per Google e Apple Calendar
            </Text>
          </View>
          <Text style={[styles.cardText, { color: colors.textSecondary }]}>
            Aggiungi questo link una sola volta al tuo calendario: vedrai sempre tutti gli eventi
            della famiglia, aggiornati automaticamente.
          </Text>

          {isLoading ? (
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>Caricamento...</Text>
          ) : error || !feedUrl ? (
            <Text style={[styles.cardText, { color: colors.error }]}>
              Impossibile caricare il link. Riprova piu' tardi.
            </Text>
          ) : (
            <>
              <View style={[styles.urlBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.urlText, { color: colors.text }]} numberOfLines={2} testID="feed-url">
                  {feedUrl}
                </Text>
              </View>
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={handleCopy}
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  testID="copy-feed-url"
                >
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>{copied ? "Copiato!" : "Copia link"}</Text>
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
                  testID="share-feed-url"
                >
                  <Ionicons name="share-outline" size={18} color={colors.primary} />
                  <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Condividi</Text>
                </Pressable>
              </View>
            </>
          )}
        </Card>

        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: "#34C75920" }]}>
              <Ionicons name="logo-google" size={20} color="#34C759" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Come si usa con Google Calendar</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.textSecondary }]}>
            1. Copia il link qui sopra{"\n"}
            2. Apri Google Calendar dal computer (calendar.google.com){"\n"}
            3. A sinistra: "Altri calendari" → + → "Da URL"{"\n"}
            4. Incolla il link e conferma{"\n\n"}
            Gli eventi appariranno anche nell'app Google Calendar del telefono. Google aggiorna il
            feed ogni alcune ore.
          </Text>
        </Card>

        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: "#8E8E9320" }]}>
              <Ionicons name="logo-apple" size={20} color={colors.text} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Come si usa con Apple Calendar</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.textSecondary }]}>
            Su iPhone: Impostazioni → App → Calendario → Account → Aggiungi account → Altro →
            "Aggiungi calendario". Incolla il link e conferma.{"\n\n"}
            Su Mac: Calendario → File → "Nuova iscrizione calendario", poi incolla il link.
          </Text>
        </Card>

        {Platform.OS !== "web" && (
          <Card>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: colors.secondary + "20" }]}>
                <Ionicons name="download-outline" size={20} color={colors.secondary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Salvare un evento sul telefono</Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              Nella scheda Calendario, tocca l'icona di download accanto a un evento per salvarlo
              direttamente nel calendario del tuo iPhone o Android.
            </Text>
          </Card>
        )}

        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: colors.error + "20" }]}>
              <Ionicons name="refresh-outline" size={20} color={colors.error} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Rigenera il link</Text>
          </View>
          <Text style={[styles.cardText, { color: colors.textSecondary }]}>
            Chiunque abbia il link puo' vedere gli eventi della famiglia. Se l'hai condiviso per
            errore, rigeneralo: quello vecchio smettera' di funzionare.
          </Text>
          <Pressable
            onPress={handleRegenerate}
            disabled={regenerating || !feedUrl}
            style={[styles.actionBtnOutline, { borderColor: colors.error, alignSelf: "flex-start" }]}
            testID="regenerate-feed-url"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.error} />
            <Text style={[styles.actionBtnOutlineText, { color: colors.error }]}>
              {regenerating ? "Rigenero..." : "Rigenera link"}
            </Text>
          </Pressable>
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
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  cardText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 10,
  },
  stepText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  urlBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  urlText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  actionBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnOutlineText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

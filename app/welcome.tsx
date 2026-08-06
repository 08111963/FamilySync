import { useEffect } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Animated, { FadeInDown, Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

const { width } = Dimensions.get("window");
type Feature = { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; gradient: [string, string] };

const BENEFITS = [
  ["time-outline", "Meno tempo a organizzare, più tempo insieme"],
  ["alert-circle-outline", "Basta dimenticanze: impegni e scadenze sempre sotto controllo"],
  ["people-outline", "Tutti sanno chi fa cosa, senza discussioni"],
  ["happy-outline", "I ragazzi collaborano volentieri grazie a punti e premi"],
  ["wallet-outline", "Spese di casa chiare e divise senza malintesi"],
] as const;

const FEATURES: Feature[] = [
  { icon: "calendar", title: "Calendario condiviso", description: "Gli impegni di tutti, finalmente nello stesso posto.", gradient: ["#66A6FF", "#4384E8"] },
  { icon: "cart", title: "Lista della spesa", description: "Una lista viva, sempre aggiornata mentre siete al supermercato.", gradient: ["#38D9A9", "#159B81"] },
  { icon: "checkbox", title: "Faccende con punti", description: "Trasforma i compiti quotidiani in una piccola sfida di squadra.", gradient: ["#B197FC", "#7950F2"] },
  { icon: "chatbubbles", title: "Chat familiare", description: "Il filo diretto della famiglia, per le cose importanti e quelle di ogni giorno.", gradient: ["#3DD5D5", "#159A9C"] },
  { icon: "sparkles", title: "Suggerimenti AI", description: "Idee pratiche per organizzare meglio la settimana.", gradient: ["#FFD166", "#F09F3E"] },
  { icon: "sync", title: "Sincronizzazione in tempo reale", description: "Ogni modifica arriva subito su tutti i dispositivi.", gradient: ["#FF9F8D", "#E76F51"] },
  { icon: "trophy", title: "Classifica familiare", description: "Un modo leggero per riconoscere l'impegno di tutti.", gradient: ["#F783AC", "#D9488B"] },
];

function FloatingOrb({ delay, x, size, color }: { delay: number; x: number; size: number; color: string }) {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = withDelay(delay, withRepeat(withTiming(1, { duration: 6500, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(value.value, [0, 1], [0, -22]) }], opacity: interpolate(value.value, [0, 0.5, 1], [0.12, 0.24, 0.12]) }));
  return <Animated.View style={[{ position: "absolute", left: x, top: 170, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

function Phone({ kind }: { kind: "calendar" | "shopping" | "chores" | "chat" }) {
  return (
    <View style={phoneStyles.phone}>
      <View style={phoneStyles.notch} />
      <View style={phoneStyles.screen}>
        {kind === "calendar" && <CalendarPreview />}
        {kind === "shopping" && <ShoppingPreview />}
        {kind === "chores" && <ChoresPreview />}
        {kind === "chat" && <ChatPreview />}
      </View>
    </View>
  );
}
function PreviewHeader({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={preview.header}><View style={preview.headerIcon}><Ionicons name={icon} size={13} color="#0D9488" /></View><Text style={preview.headerTitle}>{title}</Text><Ionicons name="ellipsis-horizontal" size={14} color="#9BA8A8" /></View>;
}
function CalendarPreview() {
  return <><PreviewHeader title="Questa settimana" icon="calendar" /><Text style={preview.date}>MAR 18 GIU</Text><View style={preview.days}>{["L", "M", "M", "G", "V", "S", "D"].map((day, i) => <View key={day + i} style={[preview.day, i === 2 && preview.activeDay]}><Text style={[preview.dayName, i === 2 && preview.activeDayText]}>{day}</Text><Text style={[preview.dayNumber, i === 2 && preview.activeDayText]}>{17 + i}</Text></View>)}</View><View style={[preview.event, { backgroundColor: "#E6F0FF", borderLeftColor: "#4384E8" }]}><Text style={preview.time}>16:30</Text><Text style={preview.eventText}>Pallavolo · Luca</Text></View><View style={[preview.event, { backgroundColor: "#FFF3DD", borderLeftColor: "#E09B34" }]}><Text style={preview.time}>18:00</Text><Text style={preview.eventText}>Visita dal veterinario</Text></View><View style={[preview.event, { backgroundColor: "#E2F7F2", borderLeftColor: "#159B81" }]}><Text style={preview.time}>20:00</Text><Text style={preview.eventText}>Cena in famiglia</Text></View></>;
}
function ShoppingPreview() {
  return <><PreviewHeader title="Spesa del weekend" icon="cart" /><Text style={preview.smallMuted}>7 elementi · aggiornata ora</Text>{[["Latte", true], ["Pane integrale", true], ["Pomodori", false], ["Yogurt", false], ["Detersivo piatti", false]].map(([label, done]) => <View style={preview.listRow} key={label as string}><View style={[preview.check, done && preview.checkDone]}>{done && <Ionicons name="checkmark" size={11} color="#fff" />}</View><Text style={[preview.item, done && preview.itemDone]}>{label as string}</Text><Text style={preview.person}>{done ? "M" : ""}</Text></View>)}<View style={preview.addLine}><Ionicons name="add" size={14} color="#0D9488" /><Text style={preview.addText}>Aggiungi un prodotto</Text></View></>;
}
function ChoresPreview() {
  return <><PreviewHeader title="Faccende di oggi" icon="checkbox" /><View style={preview.pointsCard}><View><Text style={preview.smallMuted}>Punti della settimana</Text><Text style={preview.bigPoints}>64 <Text style={preview.pointsUnit}>pt</Text></Text></View><Ionicons name="trophy" size={27} color="#E09B34" /></View>{[["Svuota lavastoviglie", "+10 punti", true], ["Riordina la cameretta", "+15 punti", false], ["Porta fuori la spazzatura", "+5 punti", false]].map(([a, b, done]) => <View style={preview.chore} key={a as string}><View style={[preview.check, done && preview.checkDone]}>{done && <Ionicons name="checkmark" size={11} color="#fff" />}</View><View style={{ flex: 1 }}><Text style={preview.item}>{a as string}</Text><Text style={preview.chorePoints}>{b as string}</Text></View><View style={preview.avatar}><Text style={preview.avatarText}>{done ? "M" : "L"}</Text></View></View>)}</>;
}
function ChatPreview() {
  return <><PreviewHeader title="Famiglia Bianchi" icon="chatbubbles" /><View style={preview.chatSpace}><View style={preview.received}><Text style={preview.chatName}>Mamma</Text><Text style={preview.chatText}>Passo io a prendere Luca.</Text><Text style={preview.chatTime}>17:04</Text></View><View style={preview.sent}><Text style={preview.chatTextWhite}>Perfetto, grazie! A dopo</Text><Text style={preview.chatTimeWhite}>17:05</Text></View><View style={preview.received}><Text style={preview.chatName}>Papà</Text><Text style={preview.chatText}>Ricordiamoci il pane.</Text></View></View><View style={preview.input}><Text style={preview.placeholder}>Scrivi un messaggio...</Text><Ionicons name="send" size={13} color="#0D9488" /></View></>;
}

function FeatureSection({ item, index, isWide }: { item: Feature; index: number; isWide: boolean }) {
  const kind = index === 0 ? "calendar" : index === 1 ? "shopping" : index === 2 ? "chores" : "chat";
  if (index > 3) return <Animated.View entering={FadeInDown.delay(300 + index * 70).duration(500)} style={styles.compactFeature}><LinearGradient colors={item.gradient} style={styles.compactIcon}><Ionicons name={item.icon} size={19} color="#fff" /></LinearGradient><View style={{ flex: 1 }}><Text style={styles.compactTitle}>{item.title}</Text><Text style={styles.compactDescription}>{item.description}</Text></View><Ionicons name="arrow-forward" size={17} color="#7C9996" /></Animated.View>;
  return <Animated.View entering={FadeInDown.delay(300 + index * 100).duration(600)} style={[styles.featureSection, isWide && index % 2 === 1 && styles.featureReverse, !isWide && styles.featureStacked]}><View style={styles.featureCopy}><Text style={styles.featureKicker}>IN PRATICA · 0{index + 1}</Text><Text style={styles.featureTitle}>{item.title}</Text><Text style={styles.featureDescription}>{item.description}</Text><View style={styles.featureRule}><View style={[styles.ruleDot, { backgroundColor: item.gradient[0] }]} /><Text style={styles.featureHint}>Semplice per tutti, anche per chi ha poco tempo</Text></View></View><Phone kind={kind} /></Animated.View>;
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 700;
  const handleGetStarted = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/login"); };
  return <LinearGradient colors={isDark ? ["#0C292B", "#103D3D", "#14514D"] : ["#0D9488", "#14B8A6", "#5EEAD4"]} style={styles.container}>
    <FloatingOrb delay={0} x={width * .08} size={130} color="#fff" /><FloatingOrb delay={800} x={width * .66} size={82} color="#fff" />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === "web" ? 58 : insets.top) + 30, paddingBottom: (Platform.OS === "web" ? 32 : insets.bottom) + 30 }]}>
      <Animated.View entering={FadeInDown.delay(80).duration(650)} style={styles.hero}><Image source={require("@/assets/images/icon.png")} style={styles.logo} contentFit="cover" /><Text style={styles.appTitle}>FamilySync</Text><Text style={styles.subtitle}>La tua famiglia, finalmente sincronizzata</Text><Text style={styles.tagline}>Calendario, spesa, faccende, bollette e chat: tutto in un unico posto.</Text></Animated.View>
      <View style={styles.benefits}><Animated.Text entering={FadeInDown.delay(180).duration(500)} style={styles.eyebrow}>PERCHÉ FAMILYSYNC</Animated.Text>{BENEFITS.map(([icon, text], i) => <Animated.View entering={FadeInDown.delay(220 + i * 55).duration(450)} key={text} style={styles.benefit}><View style={styles.benefitIcon}><Ionicons name={icon} size={16} color="#D9FFFA" /></View><Text style={styles.benefitText}>{text}</Text></Animated.View>)}</View>
      <View style={styles.features}><Animated.View entering={FadeInDown.delay(300).duration(500)}><Text style={styles.eyebrow}>COSA PUOI FARE</Text><Text style={styles.sectionTitle}>La casa gira meglio quando tutti vedono il quadro.</Text><Text style={styles.sectionIntro}>Una vista chiara delle piccole cose che tengono insieme una famiglia.</Text></Animated.View>{FEATURES.map((item, i) => <FeatureSection item={item} index={i} isWide={isWide} key={item.title} />)}</View>
      <View style={styles.ctaSection}><Text style={styles.ctaTitle}>Più ordine. Più tempo per voi.</Text><Text style={styles.ctaDescription}>Inizia a costruire il vostro modo di stare insieme.</Text><Pressable onPress={handleGetStarted} testID="get-started-button" style={({ pressed }) => [styles.ctaButton, { backgroundColor: isDark ? "#0D9488" : "#F7FFFD", transform: [{ scale: pressed ? .97 : 1 }] }]}><Text style={[styles.ctaText, { color: isDark ? "#fff" : "#087D73" }]}>Inizia ora</Text><Ionicons name="arrow-forward" size={19} color={isDark ? "#fff" : "#087D73"} /></Pressable><View style={styles.trustRow}>{[["shield-checkmark", "Sicuro"], ["cloud-done", "Sincronizzato"], ["heart", "Gratuito"]].map(([icon, label], i) => <View key={label} style={styles.trustItem}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={15} color="rgba(255,255,255,.78)" /><Text style={styles.trustText}>{label}</Text>{i < 2 && <View style={styles.divider} />}</View>)}</View><View style={styles.legalRow}><Pressable onPress={() => router.push("/legal/privacy")}><Text style={styles.legal}>Privacy</Text></Pressable><Text style={styles.legalDot}>·</Text><Pressable onPress={() => router.push("/legal/terms")}><Text style={styles.legal}>Termini</Text></Pressable><Text style={styles.legalDot}>·</Text><Pressable onPress={() => router.push("/help/user-guide")}><Text style={styles.legal}>Guida</Text></Pressable></View></View>
    </ScrollView>
  </LinearGradient>;
}

const phoneStyles = StyleSheet.create({ phone: { width: 214, maxWidth: "100%", alignSelf: "center", height: 414, backgroundColor: "#193E3D", borderRadius: 30, padding: 7, shadowColor: "#073E3B", shadowOpacity: .3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 }, notch: { position: "absolute", zIndex: 2, top: 10, left: 77, width: 60, height: 16, borderRadius: 12, backgroundColor: "#193E3D" }, screen: { flex: 1, borderRadius: 24, backgroundColor: "#FBFFFE", padding: 16, paddingTop: 27 } });
const preview = StyleSheet.create({ header: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 18 }, headerIcon: { width: 25, height: 25, borderRadius: 8, backgroundColor: "#DFF7F2", justifyContent: "center", alignItems: "center" }, headerTitle: { flex: 1, fontSize: 11, fontFamily: "Inter_700Bold", color: "#183D3C" }, headerTitleSmall: { fontSize: 10 }, date: { fontSize: 9, color: "#0D9488", fontFamily: "Inter_700Bold", letterSpacing: .5, marginBottom: 8 }, days: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 }, day: { alignItems: "center", gap: 4, paddingVertical: 4, width: 23, borderRadius: 9 }, activeDay: { backgroundColor: "#0D9488" }, dayName: { fontSize: 8, color: "#849795", fontFamily: "Inter_600SemiBold" }, dayNumber: { fontSize: 10, color: "#355252", fontFamily: "Inter_700Bold" }, activeDayText: { color: "#fff" }, event: { borderLeftWidth: 3, borderRadius: 8, padding: 9, marginBottom: 8 }, time: { fontSize: 8, color: "#718886", fontFamily: "Inter_500Medium", marginBottom: 3 }, eventText: { fontSize: 10, color: "#254746", fontFamily: "Inter_600SemiBold" }, smallMuted: { fontSize: 9, color: "#95A6A3", marginBottom: 14 }, listRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#EDF3F0" }, check: { width: 17, height: 17, borderRadius: 6, borderWidth: 1.5, borderColor: "#B6CAC5", alignItems: "center", justifyContent: "center" }, checkDone: { backgroundColor: "#0D9488", borderColor: "#0D9488" }, item: { flex: 1, fontSize: 10, color: "#365452", fontFamily: "Inter_600SemiBold" }, itemDone: { textDecorationLine: "line-through", color: "#9BAAA7" }, person: { fontSize: 9, color: "#0D9488", fontFamily: "Inter_700Bold" }, addLine: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 17 }, addText: { fontSize: 10, color: "#0D9488", fontFamily: "Inter_600SemiBold" }, pointsCard: { backgroundColor: "#F1EDFF", borderRadius: 13, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }, bigPoints: { fontSize: 25, color: "#6741D9", fontFamily: "Inter_700Bold", marginTop: 2 }, pointsUnit: { fontSize: 10 }, chore: { flexDirection: "row", gap: 9, alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EDF3F0" }, chorePoints: { color: "#7950F2", fontSize: 8, fontFamily: "Inter_600SemiBold", marginTop: 3 }, avatar: { width: 23, height: 23, borderRadius: 12, backgroundColor: "#DFF7F2", justifyContent: "center", alignItems: "center" }, avatarText: { fontSize: 9, color: "#0D9488", fontFamily: "Inter_700Bold" }, chatSpace: { flex: 1, gap: 12 }, received: { alignSelf: "flex-start", maxWidth: "86%", backgroundColor: "#EEF4F2", borderRadius: 12, borderTopLeftRadius: 4, padding: 9 }, sent: { alignSelf: "flex-end", maxWidth: "86%", backgroundColor: "#0D9488", borderRadius: 12, borderTopRightRadius: 4, padding: 9 }, chatName: { fontSize: 8, color: "#0D9488", fontFamily: "Inter_700Bold", marginBottom: 3 }, chatText: { fontSize: 10, color: "#365452", fontFamily: "Inter_500Medium" }, chatTextWhite: { fontSize: 10, color: "#fff", fontFamily: "Inter_500Medium" }, chatTime: { fontSize: 7, color: "#93A5A2", marginTop: 5, textAlign: "right" }, chatTimeWhite: { fontSize: 7, color: "#C3F2EC", marginTop: 5, textAlign: "right" }, input: { height: 30, borderRadius: 15, backgroundColor: "#F2F6F4", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }, placeholder: { flex: 1, fontSize: 8, color: "#9BA8A8" } });

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { paddingHorizontal: 24 }, hero: { alignItems: "center", marginBottom: 42 }, logo: { width: 78, height: 78, borderRadius: 22, marginBottom: 14 }, appTitle: { color: "#fff", fontSize: 39, letterSpacing: -1.5, fontFamily: "Inter_700Bold" }, subtitle: { color: "#F0FFFD", fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 7, textAlign: "center" }, tagline: { color: "rgba(255,255,255,.7)", fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 7, textAlign: "center" },
  benefits: { marginBottom: 52 }, eyebrow: { color: "rgba(255,255,255,.62)", letterSpacing: 1.5, fontSize: 11, fontFamily: "Inter_700Bold", marginBottom: 16 }, benefit: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }, benefitIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,.17)", alignItems: "center", justifyContent: "center" }, benefitText: { flex: 1, color: "rgba(255,255,255,.92)", fontSize: 13.5, lineHeight: 19, fontFamily: "Inter_500Medium" },
  features: { marginHorizontal: -24, paddingHorizontal: 24, paddingTop: 30, paddingBottom: 18, backgroundColor: "#F6FBF9", borderTopLeftRadius: 34, borderTopRightRadius: 34 }, sectionTitle: { color: "#183D3C", fontSize: 28, lineHeight: 33, letterSpacing: -.7, fontFamily: "Inter_700Bold", marginBottom: 10, maxWidth: 500 }, sectionIntro: { color: "#67817E", fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular", marginBottom: 34, maxWidth: 440 }, featureSection: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, paddingVertical: 36, borderBottomWidth: 1, borderBottomColor: "#DDEDE8" }, featureStacked: { flexDirection: "column", alignItems: "stretch", gap: 24 }, featureReverse: { flexDirection: "row-reverse" }, featureCopy: { flex: 1, minWidth: 0 }, featureKicker: { color: "#0D9488", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginBottom: 10 }, featureTitle: { color: "#183D3C", fontSize: 22, lineHeight: 26, fontFamily: "Inter_700Bold", marginBottom: 9 }, featureDescription: { color: "#67817E", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" }, featureRule: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 16 }, ruleDot: { width: 5, height: 5, borderRadius: 3 }, featureHint: { color: "#91A5A1", fontSize: 9, fontFamily: "Inter_500Medium", flex: 1 }, compactFeature: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 17, padding: 14, marginTop: 11, borderWidth: 1, borderColor: "#E1EFEB" }, compactIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" }, compactTitle: { color: "#254746", fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 3 }, compactDescription: { color: "#78908C", fontSize: 11, lineHeight: 15, fontFamily: "Inter_400Regular" },
  ctaSection: { alignItems: "center", paddingTop: 40 }, ctaTitle: { color: "#fff", fontSize: 25, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -.5 }, ctaDescription: { color: "rgba(255,255,255,.75)", fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" }, ctaButton: { width: "100%", maxWidth: 480, marginTop: 24, paddingVertical: 17, borderRadius: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, shadowColor: "#075C57", shadowOpacity: .2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 }, ctaText: { fontSize: 17, fontFamily: "Inter_700Bold" }, trustRow: { flexDirection: "row", alignItems: "center", marginTop: 22, gap: 11 }, trustItem: { flexDirection: "row", alignItems: "center", gap: 4 }, trustText: { color: "rgba(255,255,255,.75)", fontSize: 12, fontFamily: "Inter_500Medium" }, divider: { width: 1, height: 13, backgroundColor: "rgba(255,255,255,.3)", marginLeft: 8 }, legalRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 24 }, legal: { color: "rgba(255,255,255,.55)", fontSize: 12, fontFamily: "Inter_400Regular", textDecorationLine: "underline" }, legalDot: { color: "rgba(255,255,255,.45)", fontSize: 15 },
});
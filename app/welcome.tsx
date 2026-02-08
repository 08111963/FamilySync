import { useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ScrollView,
  Dimensions,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Feature {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  gradient: [string, string];
}

const FEATURES: Feature[] = [
  {
    icon: "calendar",
    title: "Calendario Condiviso",
    description: "Organizza eventi e appuntamenti visibili a tutta la famiglia in tempo reale",
    gradient: ["#74B9FF", "#0984E3"],
  },
  {
    icon: "cart",
    title: "Liste della Spesa",
    description: "Crea e condividi liste collaborative. Niente piu doppioni al supermercato",
    gradient: ["#55EFC4", "#00B894"],
  },
  {
    icon: "checkbox",
    title: "Faccende con Punti",
    description: "Assegna compiti, guadagna punti e scala la classifica familiare",
    gradient: ["#A29BFE", "#6C5CE7"],
  },
  {
    icon: "sparkles",
    title: "Suggerimenti AI",
    description: "Ricevi consigli intelligenti per ottimizzare la gestione della casa",
    gradient: ["#FFEAA7", "#FDCB6E"],
  },
  {
    icon: "sync",
    title: "Sincronizzazione Real-time",
    description: "Ogni modifica si aggiorna istantaneamente su tutti i dispositivi della famiglia",
    gradient: ["#FAB1A0", "#E17055"],
  },
  {
    icon: "trophy",
    title: "Classifica Familiare",
    description: "Motiva tutti con punti e classifiche per le faccende completate",
    gradient: ["#FD79A8", "#E84393"],
  },
];

function FloatingOrb({ delay, x, size, color }: { delay: number; x: number; size: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 6000 + delay, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -25]) }],
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.12, 0.25, 0.12]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left: x,
          top: 200,
        },
        animatedStyle,
      ]}
    />
  );
}

function FeatureRow({ item, index }: { item: Feature; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(300 + index * 100).duration(500)}>
      <View style={featureStyles.row}>
        <LinearGradient
          colors={item.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={featureStyles.iconBox}
        >
          <Ionicons name={item.icon} size={24} color="#FFFFFF" />
        </LinearGradient>
        <View style={featureStyles.textBlock}>
          <Text style={featureStyles.title}>{item.title}</Text>
          <Text style={featureStyles.description}>{item.description}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/login");
  };

  const gradientColors: [string, string, string] = isDark
    ? ["#0D0D1A", "#1A1A2E", "#16213E"]
    : ["#FF6B6B", "#FF8E8E", "#FFB5B5"];

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <FloatingOrb delay={0} x={SCREEN_WIDTH * 0.05} size={120} color="rgba(255,255,255,0.06)" />
      <FloatingOrb delay={800} x={SCREEN_WIDTH * 0.6} size={80} color="rgba(255,255,255,0.05)" />
      <FloatingOrb delay={1500} x={SCREEN_WIDTH * 0.3} size={60} color="rgba(255,255,255,0.08)" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 40, paddingBottom: bottomInset + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).duration(700)} style={styles.heroSection}>
          <LinearGradient
            colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.1)"]}
            style={styles.logoCircle}
          >
            <Ionicons name="people" size={40} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.appTitle}>FamilySync</Text>
          <Text style={styles.appSubtitle}>La tua famiglia, perfettamente coordinata</Text>
        </Animated.View>

        <View style={styles.featuresSection}>
          <Animated.Text
            entering={FadeInDown.delay(250).duration(500)}
            style={styles.sectionLabel}
          >
            Cosa puoi fare
          </Animated.Text>
          {FEATURES.map((feature, index) => (
            <FeatureRow key={index} item={feature} index={index} />
          ))}
        </View>

        <View style={styles.ctaSection}>
          <Pressable
            onPress={handleGetStarted}
            style={({ pressed }) => [
              styles.ctaButton,
              {
                backgroundColor: isDark ? "#FF6B6B" : "#FFFFFF",
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            testID="get-started-button"
          >
            <Text style={[styles.ctaText, { color: isDark ? "#FFFFFF" : "#FF6B6B" }]}>
              Inizia Ora
            </Text>
            <Ionicons name="arrow-forward" size={20} color={isDark ? "#FFFFFF" : "#FF6B6B"} />
          </Pressable>

          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <Ionicons name="shield-checkmark" size={15} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>Sicuro</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Ionicons name="cloud-done" size={15} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>Sincronizzato</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Ionicons name="heart" size={15} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>Gratuito</Text>
            </View>
          </View>

          <View style={styles.legalRow}>
            <Pressable onPress={() => router.push("/legal/privacy")}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
            <View style={styles.trustDivider} />
            <Pressable onPress={() => router.push("/legal/terms")}>
              <Text style={styles.legalLink}>Termini d'Uso</Text>
            </Pressable>
            <View style={styles.trustDivider} />
            <Pressable onPress={() => router.push("/help/user-guide")}>
              <Text style={styles.legalLink}>Guida Utente</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const featureStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginBottom: 3,
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -1.5,
  },
  appSubtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    marginTop: 8,
    textAlign: "center",
  },
  featuresSection: {
    gap: 12,
    marginBottom: 36,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  ctaSection: {
    alignItems: "center",
    gap: 20,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 18,
    borderRadius: 16,
    boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
  },
  ctaText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trustDivider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  trustText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
  },
  legalLink: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "underline" as const,
  },
});

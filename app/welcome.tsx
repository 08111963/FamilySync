import { useRef, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Dimensions,
  FlatList,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
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
  color: string;
  gradient: [string, string];
}

const FEATURES: Feature[] = [
  {
    icon: "calendar",
    title: "Calendario Condiviso",
    description: "Organizza eventi e appuntamenti visibili a tutta la famiglia in tempo reale",
    color: "#74B9FF",
    gradient: ["#74B9FF", "#0984E3"],
  },
  {
    icon: "cart",
    title: "Liste della Spesa",
    description: "Crea e condividi liste collaborative. Niente piu doppioni al supermercato",
    color: "#55EFC4",
    gradient: ["#55EFC4", "#00B894"],
  },
  {
    icon: "checkbox",
    title: "Faccende con Punti",
    description: "Assegna compiti, guadagna punti e scala la classifica familiare",
    color: "#A29BFE",
    gradient: ["#A29BFE", "#6C5CE7"],
  },
  {
    icon: "sparkles",
    title: "Suggerimenti AI",
    description: "Ricevi consigli intelligenti per ottimizzare la gestione della casa",
    color: "#FFEAA7",
    gradient: ["#FFEAA7", "#FDCB6E"],
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
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -30]) }],
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.15, 0.3, 0.15]),
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
          bottom: 120,
        },
        animatedStyle,
      ]}
    />
  );
}

function FeatureCard({ item, index }: { item: Feature; index: number }) {
  return (
    <View style={featureStyles.cardWrapper}>
      <LinearGradient
        colors={item.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={featureStyles.iconGradient}
      >
        <Ionicons name={item.icon} size={28} color="#FFFFFF" />
      </LinearGradient>
      <Text style={featureStyles.title}>{item.title}</Text>
      <Text style={featureStyles.description}>{item.description}</Text>
    </View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

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
      <FloatingOrb delay={0} x={SCREEN_WIDTH * 0.1} size={120} color="rgba(255,255,255,0.08)" />
      <FloatingOrb delay={800} x={SCREEN_WIDTH * 0.6} size={80} color="rgba(255,255,255,0.06)" />
      <FloatingOrb delay={1500} x={SCREEN_WIDTH * 0.35} size={60} color="rgba(255,255,255,0.1)" />

      <View style={[styles.content, { paddingTop: topInset + 32, paddingBottom: bottomInset + 16 }]}>
        <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.heroSection}>
          <View style={styles.logoRow}>
            <LinearGradient
              colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.1)"]}
              style={styles.logoCircle}
            >
              <Ionicons name="people" size={40} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={styles.appTitle}>FamilySync</Text>
          <Text style={styles.appSubtitle}>La tua famiglia, perfettamente coordinata</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(500).duration(800)} style={styles.carouselSection}>
          <FlatList
            ref={flatListRef}
            data={FEATURES}
            renderItem={({ item, index }) => <FeatureCard item={item} index={index} />}
            keyExtractor={(_, i) => i.toString()}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={SCREEN_WIDTH - 48}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 24 }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 48));
              setActiveIndex(idx);
            }}
          />
          <View style={styles.dotsRow}>
            {FEATURES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === activeIndex ? "#FFFFFF" : "rgba(255,255,255,0.35)",
                    width: i === activeIndex ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(900).duration(600)} style={styles.ctaSection}>
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
              <Ionicons name="shield-checkmark" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>Sicuro</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Ionicons name="cloud-done" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>Sincronizzato</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Ionicons name="heart" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>Gratuito</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const featureStyles = StyleSheet.create({
  cardWrapper: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "space-between",
  },
  heroSection: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logoRow: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  appTitle: {
    fontSize: 42,
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
  carouselSection: {
    paddingVertical: 16,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  ctaSection: {
    paddingHorizontal: 24,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
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
});

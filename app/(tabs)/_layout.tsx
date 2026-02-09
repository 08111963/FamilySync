import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useFamily } from "@/context/FamilyContext";

function NativeTabLayout() {
  const { getPendingChores } = useFamily();
  const pendingCount = getPendingChores().length;

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <Icon sf={{ default: "calendar", selected: "calendar" }} />
        <Label>Calendario</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shopping">
        <Icon sf={{ default: "cart", selected: "cart.fill" }} />
        <Label>Spesa</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chores">
        <Icon sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }} />
        <Label>Faccende</Label>
        {pendingCount > 0 && <Badge>{pendingCount}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat">
        <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
        <Label>Chat</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="family">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Famiglia</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const safeAreaInsets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const { getPendingChores } = useFamily();
  const pendingCount = getPendingChores().length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        headerShown: false,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : isDark ? "#000" : "#fff",
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: isDark ? "#333" : "#ccc",
          elevation: 0,
          paddingBottom: isWeb ? 0 : safeAreaInsets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "#000" : "#fff" }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            isIOS ? (
              <SymbolView name={focused ? "house.fill" : "house"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendario",
          tabBarIcon: ({ color, focused }) => (
            isIOS ? (
              <SymbolView name="calendar" tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: "Spesa",
          tabBarIcon: ({ color, focused }) => (
            isIOS ? (
              <SymbolView name={focused ? "cart.fill" : "cart"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "cart" : "cart-outline"} size={24} color={color} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: "Faccende",
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarIcon: ({ color, focused }) => (
            isIOS ? (
              <SymbolView name={focused ? "checkmark.circle.fill" : "checkmark.circle"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "checkmark-circle" : "checkmark-circle-outline"} size={24} color={color} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, focused }) => (
            isIOS ? (
              <SymbolView name={focused ? "bubble.left.and.bubble.right.fill" : "bubble.left.and.bubble.right"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={24} color={color} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: "Famiglia",
          tabBarIcon: ({ color, focused }) => (
            isIOS ? (
              <SymbolView name={focused ? "person.2.fill" : "person.2"} tintColor={color} size={24} />
            ) : (
              <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color} />
            )
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

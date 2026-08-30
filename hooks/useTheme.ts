import { useEffect, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import Colors from "@/constants/colors";

export function useTheme() {
  const detectedColorScheme = useColorScheme();
  const [hasMounted, setHasMounted] = useState(Platform.OS !== "web");
  useEffect(() => setHasMounted(true), []);
  // Durante il prerender web il tema del browser non è disponibile. Usare
  // light anche nel primo render client evita markup diverso in idratazione.
  const colorScheme = hasMounted ? detectedColorScheme : "light";
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  
  return {
    isDark,
    colors,
    colorScheme: colorScheme ?? "light",
  };
}

import { useColorScheme } from "react-native";
import Colors from "@/constants/colors";

export function useTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  
  return {
    isDark,
    colors,
    colorScheme: colorScheme ?? "light",
  };
}

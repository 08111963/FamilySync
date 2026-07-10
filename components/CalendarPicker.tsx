import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { useTheme } from "@/hooks/useTheme";

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

interface CalendarPickerProps {
  label?: string;
  value: string | null;
  onChange: (iso: string) => void;
  onClear?: () => void;
  testID?: string;
}

export function CalendarPicker({ label, value, onChange, onClear, testID }: CalendarPickerProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const selected = value ? parseIso(value) : null;
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.m ?? today.getMonth());

  const openPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selected) {
      setViewYear(selected.y);
      setViewMonth(selected.m);
    }
    setOpen(true);
  };

  const changeMonth = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const selectDay = (day: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(toIso(viewYear, viewMonth, day));
    setOpen(false);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const displayLabel = value
    ? (() => {
        const p = parseIso(value)!;
        return `${String(p.d).padStart(2, "0")} ${MONTHS[p.m]} ${p.y}`;
      })()
    : "Seleziona una data";

  const isToday = (day: number) =>
    viewYear === today.getFullYear() &&
    viewMonth === today.getMonth() &&
    day === today.getDate();

  const isSelected = (day: number) =>
    !!selected && selected.y === viewYear && selected.m === viewMonth && selected.d === day;

  return (
    <View>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <Pressable
        testID={testID}
        onPress={openPicker}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={[styles.fieldText, { color: value ? colors.text : colors.textSecondary }]}>
          {displayLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.monthHeader}>
              <Pressable onPress={() => changeMonth(-1)} style={styles.navBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Text style={[styles.monthTitle, { color: colors.text }]}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Pressable onPress={() => changeMonth(1)} style={styles.navBtn} hitSlop={8}>
                <Ionicons name="chevron-forward" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <View key={w} style={styles.weekCell}>
                  <Text style={[styles.weekText, { color: colors.textSecondary }]}>{w}</Text>
                </View>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCell} />;
                }
                const selectedDay = isSelected(day);
                const todayDay = isToday(day);
                return (
                  <Pressable
                    key={`day-${day}`}
                    onPress={() => selectDay(day)}
                    style={styles.dayCell}
                  >
                    <View
                      style={[
                        styles.dayInner,
                        selectedDay && { backgroundColor: colors.primary },
                        !selectedDay && todayDay && { borderWidth: 1, borderColor: colors.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: selectedDay ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChange(toIso(today.getFullYear(), today.getMonth(), today.getDate()));
                  setOpen(false);
                }}
                style={styles.todayBtn}
              >
                <Text style={[styles.todayText, { color: colors.primary }]}>Oggi</Text>
              </Pressable>
              {onClear && value ? (
                <Pressable
                  testID={testID ? `${testID}-clear` : undefined}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClear();
                    setOpen(false);
                  }}
                  style={styles.todayBtn}
                >
                  <Text style={[styles.todayText, { color: colors.textSecondary }]}>Rimuovi data</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 16,
    ...(Platform.OS === "web" ? { boxShadow: "0px 8px 24px rgba(0,0,0,0.2)" } : {}),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  monthTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekCell: {
    flex: 1,
    alignItems: "center",
  },
  weekText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  dayInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  dayText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  todayBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  todayText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

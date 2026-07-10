import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface ReminderPickerProps {
  /** Chiamato con il valore ISO scelto (AAAA-MM-GGTHH:MM). */
  onAdd: (value: string) => void;
  testID?: string;
}

/**
 * Selettore di un promemoria personalizzato: giorno (calendario) + orario.
 * Restituisce una stringa "AAAA-MM-GGTHH:MM". Blocca la conferma se l'istante
 * scelto è nel passato, così l'utente non aggiunge promemoria che non scatterebbero.
 */
export function ReminderPicker({ onAdd, testID }: ReminderPickerProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selDay, setSelDay] = useState(now.getDate());
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [hour, setHour] = useState(now.getHours());
  const [minuteIdx, setMinuteIdx] = useState(
    Math.min(MINUTES.length - 1, Math.ceil(now.getMinutes() / 5) % 12)
  );

  const minute = MINUTES[minuteIdx];

  const openPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    setSelYear(n.getFullYear());
    setSelMonth(n.getMonth());
    setSelDay(n.getDate());
    setHour(n.getHours());
    setMinuteIdx(Math.min(MINUTES.length - 1, Math.ceil(n.getMinutes() / 5) % 12));
    setOpen(true);
  };

  const changeMonth = (delta: number) => {
    Haptics.selectionAsync();
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const selectDay = (day: number) => {
    Haptics.selectionAsync();
    setSelYear(viewYear);
    setSelMonth(viewMonth);
    setSelDay(day);
  };

  const stepHour = (delta: number) => {
    Haptics.selectionAsync();
    setHour((h) => (h + delta + 24) % 24);
  };

  const stepMinute = (delta: number) => {
    Haptics.selectionAsync();
    setMinuteIdx((i) => (i + delta + MINUTES.length) % MINUTES.length);
  };

  const selectedDate = new Date(selYear, selMonth, selDay, hour, minute, 0, 0);
  const isPast = selectedDate.getTime() <= Date.now();

  const confirm = () => {
    if (isPast) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const value = `${selYear}-${pad(selMonth + 1)}-${pad(selDay)}T${pad(hour)}:${pad(minute)}`;
    onAdd(value);
    setOpen(false);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelected = (day: number) =>
    selYear === viewYear && selMonth === viewMonth && selDay === day;
  const isToday = (day: number) =>
    viewYear === now.getFullYear() && viewMonth === now.getMonth() && day === now.getDate();

  return (
    <View>
      <Pressable
        testID={testID}
        onPress={openPicker}
        style={[styles.trigger, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "10" }]}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={[styles.triggerText, { color: colors.primary }]}>Aggiungi promemoria</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.monthHeader}>
              <Pressable onPress={() => changeMonth(-1)} style={styles.navBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Text style={[styles.monthTitle, { color: colors.text }]}>{MONTHS[viewMonth]} {viewYear}</Text>
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
                if (day === null) return <View key={`e-${idx}`} style={styles.dayCell} />;
                const sel = isSelected(day);
                const tod = isToday(day);
                return (
                  <Pressable key={`d-${day}`} onPress={() => selectDay(day)} style={styles.dayCell} testID={`reminder-day-${day}`}>
                    <View
                      style={[
                        styles.dayInner,
                        sel && { backgroundColor: colors.primary },
                        !sel && tod && { borderWidth: 1, borderColor: colors.primary },
                      ]}
                    >
                      <Text style={[styles.dayText, { color: sel ? "#FFFFFF" : colors.text }]}>{day}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.timeRow, { borderTopColor: colors.border }]}>
              <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Ora</Text>
              <View style={styles.spacer} />
              <View style={styles.stepper}>
                <Pressable onPress={() => stepHour(1)} style={styles.stepBtn} hitSlop={6} testID="reminder-hour-up">
                  <Ionicons name="chevron-up" size={20} color={colors.text} />
                </Pressable>
                <Text style={[styles.timeValue, { color: colors.text }]}>{pad(hour)}</Text>
                <Pressable onPress={() => stepHour(-1)} style={styles.stepBtn} hitSlop={6} testID="reminder-hour-down">
                  <Ionicons name="chevron-down" size={20} color={colors.text} />
                </Pressable>
              </View>
              <Text style={[styles.colon, { color: colors.text }]}>:</Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => stepMinute(1)} style={styles.stepBtn} hitSlop={6} testID="reminder-minute-up">
                  <Ionicons name="chevron-up" size={20} color={colors.text} />
                </Pressable>
                <Text style={[styles.timeValue, { color: colors.text }]}>{pad(minute)}</Text>
                <Pressable onPress={() => stepMinute(-1)} style={styles.stepBtn} hitSlop={6} testID="reminder-minute-down">
                  <Ionicons name="chevron-down" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {isPast && (
              <Text style={[styles.warn, { color: colors.error }]}>
                Scegli un orario futuro per ricevere il promemoria.
              </Text>
            )}

            <Pressable
              onPress={confirm}
              disabled={isPast}
              style={[styles.addBtn, { backgroundColor: isPast ? colors.border : colors.primary }]}
              testID="reminder-confirm"
            >
              <Text style={[styles.addBtnText, { color: isPast ? colors.textSecondary : "#FFFFFF" }]}>
                Aggiungi promemoria
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  triggerText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
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
  navBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  monthTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekCell: { flex: 1, alignItems: "center" },
  weekText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: "center", alignItems: "center", padding: 2 },
  dayInner: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  dayText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  timeLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  spacer: { flex: 1 },
  stepper: { alignItems: "center" },
  stepBtn: { paddingVertical: 2, paddingHorizontal: 8 },
  timeValue: { fontSize: 22, fontFamily: "Inter_700Bold", minWidth: 34, textAlign: "center" },
  colon: { fontSize: 22, fontFamily: "Inter_700Bold", marginHorizontal: 2 },
  warn: { marginTop: 12, fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  addBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  addBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

import { useState } from "react";
import { StyleSheet, Text, View, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAYS = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];

function isRealIso(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function isoToEuro(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function toIso(y: number, mo: number, d: number): string {
  const mm = String(mo + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

interface DateFieldProps {
  label: string;
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (iso: string) => void;
  placeholder?: string;
  testID?: string;
}

export function DateField({ label, value, onChange, placeholder = "GG/MM/AAAA", testID }: DateFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const selectedIso = isRealIso(value) ? value : "";
  const today = new Date();

  // Mese visualizzato nel calendario: parte dalla data selezionata o da oggi.
  const baseDate = selectedIso ? new Date(`${selectedIso}T00:00:00`) : today;
  const [viewYear, setViewYear] = useState(baseDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(baseDate.getMonth());

  const openPicker = () => {
    const b = selectedIso ? new Date(`${selectedIso}T00:00:00`) : new Date();
    setViewYear(b.getFullYear());
    setViewMonth(b.getMonth());
    setOpen(true);
  };

  const changeMonth = (delta: number) => {
    Haptics.selectionAsync();
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const selectDay = (d: number) => {
    Haptics.selectionAsync();
    onChange(toIso(viewYear, viewMonth, d));
    setOpen(false);
  };

  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Lun=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
  const display = selectedIso ? isoToEuro(selectedIso) : "";

  return (
    <View>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        onPress={openPicker}
        testID={testID}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.inputText, { color: display ? colors.text : colors.textSecondary }]}>
          {display || placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.navRow}>
              <Pressable onPress={() => changeMonth(-1)} style={styles.navBtn} testID="cal-prev">
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Text style={[styles.monthTitle, { color: colors.text }]}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Pressable onPress={() => changeMonth(1)} style={styles.navBtn} testID="cal-next">
                <Ionicons name="chevron-forward" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={[styles.weekday, { color: colors.textSecondary }]}>{w}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((d, i) => {
                if (d === null) return <View key={`e${i}`} style={styles.cell} />;
                const iso = toIso(viewYear, viewMonth, d);
                const isSelected = iso === selectedIso;
                const isToday = iso === todayIso;
                return (
                  <Pressable
                    key={iso}
                    onPress={() => selectDay(d)}
                    testID={`cal-day-${d}`}
                    style={styles.cell}
                  >
                    <View
                      style={[
                        styles.dayInner,
                        isSelected && { backgroundColor: colors.primary },
                        !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: isSelected ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {d}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => { Haptics.selectionAsync(); onChange(todayIso); setOpen(false); }}
              style={styles.todayBtn}
              testID="cal-today"
            >
              <Text style={[styles.todayText, { color: colors.primary }]}>Oggi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  monthTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: "Inter_500Medium" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: "center", alignItems: "center" },
  dayInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  dayText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  todayBtn: { marginTop: 8, alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20 },
  todayText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

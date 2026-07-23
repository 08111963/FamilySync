import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Switch, TextInput, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { VoiceInput } from "@/components/VoiceInput";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { apiRequest, queryClient } from "@/lib/query-client";
import { freeLimitMessage } from "@/lib/plan-limit";
import { aiErrorMessage } from "@/lib/ai-error-message";
import { buildRecurrenceRule, WEEKDAY_LABELS } from "@/shared/chore-recurrence";

const POINTS_OPTIONS = [5, 10, 15, 20, 25, 50];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Giornaliera" },
  { value: "weekly", label: "Settimanale" },
  { value: "monthly", label: "Mensile" },
];

const DIFFICULTY_OPTIONS = [
  { value: 1, label: "1", color: "#4CAF50" },
  { value: 2, label: "2", color: "#8BC34A" },
  { value: 3, label: "3", color: "#FF9800" },
  { value: 4, label: "4", color: "#FF5722" },
  { value: 5, label: "5", color: "#F44336" },
];

export default function AddChoreScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, currentFamily } = useFamily();

  const [aiText, setAiText] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [points, setPoints] = useState(10);
  const [difficulty, setDifficulty] = useState<number>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dailyWeekdays, setDailyWeekdays] = useState<number[]>([]);
  const [weeklyDays, setWeeklyDays] = useState<number[]>(() => {
    const d = new Date().getDay();
    return [d === 0 ? 7 : d];
  });
  const [monthDays, setMonthDays] = useState<number[]>(() => [new Date().getDate()]);
  const [selectedMember, setSelectedMember] = useState(data.members[0]?.id || "");

  const familyId = currentFamily?.id;

  const showError = (msg: string) => {
    if (Platform.OS === "web") alert(msg);
    else Alert.alert("Errore", msg);
  };

  const isRealIso = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  };

  const handleCompile = async (textOverride?: string) => {
    const inputText = (textOverride ?? aiText).trim();
    if (!inputText || !familyId || isCompiling) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCompiling(true);
    try {
      const res = await apiRequest("POST", `/api/ai/${familyId}/parse-chore`, {
        text: inputText,
      });
      const parsed = await res.json();
      let filled = false;
      if (parsed.title) { setTitle(parsed.title); filled = true; }
      if (parsed.description) { setDescription(parsed.description); filled = true; }
      if (typeof parsed.points === "number" && parsed.points >= 1 && parsed.points <= 100) {
        setPoints(parsed.points);
        filled = true;
      }
      if (typeof parsed.difficulty === "number" && parsed.difficulty >= 1 && parsed.difficulty <= 5) {
        setDifficulty(parsed.difficulty);
        filled = true;
      }
      if (typeof parsed.estimatedMinutes === "number" && parsed.estimatedMinutes >= 1) {
        setEstimatedMinutes(String(parsed.estimatedMinutes));
        filled = true;
      }
      if (parsed.dueDate && isRealIso(parsed.dueDate)) { setDueDate(parsed.dueDate); filled = true; }
      if (parsed.repeat === "daily" || parsed.repeat === "weekly" || parsed.repeat === "monthly") {
        setIsRecurring(true);
        setFrequency(parsed.repeat);
        const wd = Array.isArray(parsed.weekdays)
          ? parsed.weekdays.filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 7)
          : [];
        const md = Array.isArray(parsed.monthDays)
          ? parsed.monthDays.filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 31)
          : [];
        if (parsed.repeat === "daily") setDailyWeekdays(wd);
        if (parsed.repeat === "weekly" && wd.length > 0) setWeeklyDays(wd);
        if (parsed.repeat === "monthly" && md.length > 0) setMonthDays(md);
        filled = true;
      }
      if (parsed.assigneeMemberId && data.members.some((m) => m.id === parsed.assigneeMemberId)) {
        setSelectedMember(parsed.assigneeMemberId);
        filled = true;
      }
      if (filled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showError("Non ho capito la faccenda: prova a descriverla in modo più specifico.");
      }
    } catch (e) {
      showError(aiErrorMessage(e, "Non sono riuscito a compilare i campi. Riprova."));
    } finally {
      setIsCompiling(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !familyId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      await apiRequest("POST", `/api/chores/${familyId}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        assignedTo: selectedMember || undefined,
        dueDate: dueDate || undefined,
        points,
        difficulty,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
        recurrenceRule: isRecurring
          ? buildRecurrenceRule(frequency, {
              weekdays: frequency === "weekly" ? weeklyDays : dailyWeekdays,
              monthDays,
            })
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/chores", familyId] });
      router.back();
    } catch (e) {
      const limitMsg = freeLimitMessage(e);
      const title = limitMsg ? "Limite raggiunto" : "Errore";
      const body = limitMsg ?? "Errore nella creazione della faccenda";
      if (Platform.OS === "web") {
        alert(body);
      } else {
        Alert.alert(title, body);
      }
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Aggiungi Faccenda</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.field}>
          <View style={styles.titleRow}>
            <View style={styles.titleInput}>
              <Input
                label="Descrivi la faccenda"
                placeholder={'Es. "Butta la spazzatura ogni martedì e giovedì, 10 punti, per Anna"'}
                value={aiText}
                onChangeText={setAiText}
                multiline
                style={{ height: 80, textAlignVertical: "top", paddingTop: 12 }}
              />
            </View>
            {familyId ? (
              <View style={styles.micWrap}>
                <VoiceInput
                  familyId={familyId}
                  onTranscribed={(text) => {
                    // Come WhatsApp: al rilascio del microfono la compilazione
                    // parte subito, senza dover premere "Compila".
                    const combined = aiText ? `${aiText} ${text}` : text;
                    setAiText(combined);
                    handleCompile(combined);
                  }}
                />
              </View>
            ) : null}
          </View>
          <View style={styles.compileRow}>
            <Text style={[styles.compileHint, { color: colors.textSecondary }]}>
              Detta o scrivi tutto in una frase: titolo, punti, ricorrenza e assegnatario verranno compilati qui sotto.
            </Text>
            <Pressable
              onPress={() => handleCompile()}
              disabled={!aiText.trim() || isCompiling}
              style={[
                styles.compileButton,
                {
                  backgroundColor: aiText.trim() && !isCompiling ? colors.primary : colors.surface,
                  borderColor: aiText.trim() && !isCompiling ? colors.primary : colors.border,
                },
              ]}
              testID="compile-chore"
            >
              {isCompiling ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons
                  name="sparkles"
                  size={16}
                  color={aiText.trim() ? "#FFFFFF" : colors.textSecondary}
                />
              )}
              <Text
                style={[
                  styles.compileText,
                  { color: aiText.trim() && !isCompiling ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                Compila
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Input
            label="Titolo"
            placeholder="Cosa c'è da fare?"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Descrizione (opzionale)"
            placeholder="Aggiungi dettagli..."
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 80, textAlignVertical: "top", paddingTop: 12 }}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Difficoltà</Text>
          <View style={styles.difficultyOptions}>
            {DIFFICULTY_OPTIONS.map((d) => (
              <Pressable
                key={d.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDifficulty(d.value);
                }}
                style={[
                  styles.difficultyOption,
                  {
                    backgroundColor: difficulty === d.value ? d.color + "20" : colors.surface,
                    borderColor: difficulty === d.value ? d.color : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.difficultyText,
                    { color: difficulty === d.value ? d.color : colors.text },
                  ]}
                >
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Input
            label="Tempo stimato (minuti, opzionale)"
            placeholder="es. 30"
            value={estimatedMinutes}
            onChangeText={setEstimatedMinutes}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Scadenza (opzionale)"
            placeholder="AAAA-MM-GG"
            value={dueDate}
            onChangeText={setDueDate}
          />
        </View>

        {data.members.length > 0 && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Assegna a</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
              <View style={styles.memberOptions}>
                {data.members.map((member) => (
                  <Pressable
                    key={member.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedMember(member.id);
                    }}
                    style={[
                      styles.memberOption,
                      {
                        backgroundColor: colors.surface,
                        borderColor: selectedMember === member.id ? colors.primary : colors.border,
                        borderWidth: selectedMember === member.id ? 2 : 1,
                      },
                    ]}
                  >
                    <Avatar name={member.name} color={member.color} size={32} />
                    <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Punti</Text>
          <View style={styles.pointsOptions}>
            {POINTS_OPTIONS.map((p) => (
              <Pressable
                key={p}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPoints(p);
                }}
                style={[
                  styles.pointOption,
                  {
                    backgroundColor: points === p ? colors.accent : colors.surface,
                    borderColor: points === p ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pointText,
                    { color: points === p ? "#000" : colors.text },
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.row, { borderColor: colors.border }]}>
          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Ricorrente</Text>
            <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
              Si ripete automaticamente
            </Text>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsRecurring(value);
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        {isRecurring && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Frequenza</Text>
            <View style={styles.frequencyOptions}>
              {FREQUENCY_OPTIONS.map((f) => (
                <Pressable
                  key={f.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFrequency(f.value as "daily" | "weekly" | "monthly");
                  }}
                  style={[
                    styles.frequencyOption,
                    {
                      backgroundColor: frequency === f.value ? colors.secondary : colors.surface,
                      borderColor: frequency === f.value ? colors.secondary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.frequencyText,
                      { color: frequency === f.value ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {frequency === "daily" && (
              <View style={styles.subField}>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
                  In quali giorni? (nessuno = tutti i giorni)
                </Text>
                <View style={styles.weekdayOptions}>
                  {WEEKDAY_LABELS.map((w) => {
                    const selected = dailyWeekdays.includes(w.value);
                    return (
                      <Pressable
                        key={w.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setDailyWeekdays((prev) =>
                            prev.includes(w.value)
                              ? prev.filter((d) => d !== w.value)
                              : [...prev, w.value]
                          );
                        }}
                        style={[
                          styles.weekdayOption,
                          {
                            backgroundColor: selected ? colors.secondary : colors.surface,
                            borderColor: selected ? colors.secondary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekdayText,
                            { color: selected ? "#FFFFFF" : colors.text },
                          ]}
                        >
                          {w.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {frequency === "weekly" && (
              <View style={styles.subField}>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
                  In quali giorni della settimana? (anche più di uno)
                </Text>
                <View style={styles.weekdayOptions}>
                  {WEEKDAY_LABELS.map((w) => {
                    const selected = weeklyDays.includes(w.value);
                    return (
                      <Pressable
                        key={w.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWeeklyDays((prev) =>
                            prev.includes(w.value)
                              ? prev.length > 1
                                ? prev.filter((d) => d !== w.value)
                                : prev
                              : [...prev, w.value]
                          );
                        }}
                        style={[
                          styles.weekdayOption,
                          {
                            backgroundColor: selected ? colors.secondary : colors.surface,
                            borderColor: selected ? colors.secondary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekdayText,
                            { color: selected ? "#FFFFFF" : colors.text },
                          ]}
                        >
                          {w.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {frequency === "monthly" && (
              <View style={styles.subField}>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
                  In quali giorni del mese? (anche più di uno)
                </Text>
                <View style={styles.monthDayOptions}>
                  {MONTH_DAYS.map((d) => {
                    const selected = monthDays.includes(d);
                    return (
                      <Pressable
                        key={d}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setMonthDays((prev) =>
                            prev.includes(d)
                              ? prev.length > 1
                                ? prev.filter((x) => x !== d)
                                : prev
                              : [...prev, d]
                          );
                        }}
                        style={[
                          styles.monthDayOption,
                          {
                            backgroundColor: selected ? colors.secondary : colors.surface,
                            borderColor: selected ? colors.secondary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekdayText,
                            { color: selected ? "#FFFFFF" : colors.text },
                          ]}
                        >
                          {d}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.subHint, { color: colors.textSecondary }]}>
                  Nei mesi più corti vale l'ultimo giorno disponibile
                </Text>
              </View>
            )}
          </View>
        )}

        <Button
          title="Aggiungi Faccenda"
          onPress={handleSave}
          disabled={!title.trim()}
          style={{ marginTop: 24 }}
        />
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
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  field: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  titleInput: {
    flex: 1,
  },
  micWrap: {
    marginBottom: 6,
  },
  compileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  compileHint: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  compileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  compileText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  difficultyOptions: {
    flexDirection: "row",
    gap: 12,
  },
  difficultyOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  difficultyText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  rowHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  memberScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  memberOptions: {
    flexDirection: "row",
    gap: 12,
    paddingRight: 20,
  },
  memberOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
  },
  memberName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  pointsOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  pointOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  pointText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  frequencyOptions: {
    flexDirection: "row",
    gap: 12,
  },
  frequencyOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  frequencyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  subField: {
    marginTop: 16,
  },
  subLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  subHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
  weekdayOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  weekdayOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  weekdayText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  monthDayOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  monthDayOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
});

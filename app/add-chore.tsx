import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Switch, TextInput, Alert } from "react-native";
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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [points, setPoints] = useState(10);
  const [difficulty, setDifficulty] = useState<number>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dailyWeekdays, setDailyWeekdays] = useState<number[]>([]);
  const [weeklyDay, setWeeklyDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  });
  const [monthDay, setMonthDay] = useState<number>(() => new Date().getDate());
  const [selectedMember, setSelectedMember] = useState(data.members[0]?.id || "");

  const familyId = currentFamily?.id;

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
              weekdays: dailyWeekdays,
              weekday: weeklyDay,
              monthDay,
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
                label="Titolo"
                placeholder="Cosa c'è da fare?"
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </View>
            {familyId ? (
              <View style={styles.micWrap}>
                <VoiceInput
                  familyId={familyId}
                  onTranscribed={(text) =>
                    setTitle((prev) => (prev ? `${prev} ${text}` : text))
                  }
                />
              </View>
            ) : null}
          </View>
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
                  In quale giorno della settimana?
                </Text>
                <View style={styles.weekdayOptions}>
                  {WEEKDAY_LABELS.map((w) => {
                    const selected = weeklyDay === w.value;
                    return (
                      <Pressable
                        key={w.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWeeklyDay(w.value);
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
                  In quale giorno del mese?
                </Text>
                <View style={styles.monthDayOptions}>
                  {MONTH_DAYS.map((d) => {
                    const selected = monthDay === d;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setMonthDay(d);
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

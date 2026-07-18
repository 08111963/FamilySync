import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Switch, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { VoiceInput } from "@/components/VoiceInput";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { CalendarPicker } from "@/components/CalendarPicker";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { aiErrorMessage } from "@/lib/ai-error-message";

const EVENT_COLORS = Object.values(Colors.light.calendar);

export default function AddEventScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, addEvent, currentFamily } = useFamily();
  const params = useLocalSearchParams<{ date?: string }>();

  const isRealIso = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  };

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const initialIso =
    typeof params.date === "string" && isRealIso(params.date) ? params.date : todayIso;

  const [aiText, setAiText] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(initialIso);
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isAllDay, setIsAllDay] = useState(true);
  const [selectedMember, setSelectedMember] = useState(data.members[0]?.id || "");
  const [selectedColor, setSelectedColor] = useState(EVENT_COLORS[0]);

  const showError = (msg: string) => {
    if (Platform.OS === "web") alert(msg);
    else Alert.alert("Errore", msg);
  };

  const handleCompile = async () => {
    if (!aiText.trim() || !currentFamily || isCompiling) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCompiling(true);
    try {
      const res = await apiRequest("POST", `/api/ai/${currentFamily.id}/parse-event`, {
        text: aiText.trim(),
      });
      const parsed = await res.json();
      let filled = false;
      if (parsed.title) { setTitle(parsed.title); filled = true; }
      if (parsed.location) { setLocation(parsed.location); filled = true; }
      if (parsed.description) { setDescription(parsed.description); filled = true; }
      if (parsed.date && isRealIso(parsed.date)) { setDate(parsed.date); filled = true; }
      if (parsed.time) {
        setTime(parsed.time);
        setIsAllDay(false);
        filled = true;
      }
      if (parsed.endTime) { setEndTime(parsed.endTime); filled = true; }
      if (filled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showError("Non ho capito l'evento: prova a descriverlo in modo più specifico.");
      }
    } catch (e) {
      showError(aiErrorMessage(e, "Non sono riuscito a compilare i campi. Riprova."));
    } finally {
      setIsCompiling(false);
    }
  };

  const handleSave = () => {
    if (title.trim() && isRealIso(date)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        date,
        time: isAllDay ? undefined : time || undefined,
        endTime: isAllDay ? undefined : endTime || undefined,
        memberId: selectedMember || undefined,
        color: selectedColor,
        allDay: isAllDay,
      });
      router.back();
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Aggiungi Evento</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.field}>
          <View style={styles.titleRow}>
            <View style={styles.titleInput}>
              <Input
                label="Descrivi l'evento"
                placeholder={'Es. "Cena con Marco venerdì alle 20 da Luigi, fino alle 22"'}
                value={aiText}
                onChangeText={setAiText}
                multiline
                style={{ height: 80, textAlignVertical: "top", paddingTop: 12 }}
              />
            </View>
            {currentFamily ? (
              <View style={styles.micWrap}>
                <VoiceInput
                  familyId={currentFamily.id}
                  onTranscribed={(text) =>
                    setAiText((prev) => (prev ? `${prev} ${text}` : text))
                  }
                />
              </View>
            ) : null}
          </View>
          <View style={styles.compileRow}>
            <Text style={[styles.compileHint, { color: colors.textSecondary }]}>
              Detta o scrivi tutto in una frase: titolo, luogo e orari verranno compilati qui sotto.
            </Text>
            <Pressable
              onPress={handleCompile}
              disabled={!aiText.trim() || isCompiling}
              style={[
                styles.compileButton,
                {
                  backgroundColor: aiText.trim() && !isCompiling ? colors.primary : colors.surface,
                  borderColor: aiText.trim() && !isCompiling ? colors.primary : colors.border,
                },
              ]}
              testID="compile-event"
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
            placeholder="Titolo dell'evento"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Luogo (opzionale)"
            placeholder="Dove si svolge?"
            value={location}
            onChangeText={setLocation}
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
          <CalendarPicker label="Data" value={date} onChange={setDate} testID="event-date" />
        </View>

        <View style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Tutto il giorno</Text>
          <Switch
            value={isAllDay}
            onValueChange={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsAllDay(value);
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        {!isAllDay && (
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Input
                label="Inizio"
                placeholder="HH:MM (es. 14:30)"
                value={time}
                onChangeText={setTime}
              />
            </View>
            <View style={styles.timeField}>
              <Input
                label="Fine (opzionale)"
                placeholder="HH:MM (es. 16:00)"
                value={endTime}
                onChangeText={setEndTime}
              />
            </View>
          </View>
        )}

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
          <Text style={[styles.label, { color: colors.text }]}>Colore</Text>
          <View style={styles.colorOptions}>
            {EVENT_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedColor(color);
                }}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorSelected,
                ]}
              >
                {selectedColor === color && (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <Button
          title="Aggiungi Evento"
          onPress={handleSave}
          disabled={!title.trim() || !isRealIso(date)}
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
  timeRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  timeField: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
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
  colorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});

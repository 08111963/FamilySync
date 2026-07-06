import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Switch } from "react-native";
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
import Colors from "@/constants/colors";

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

  const todayIso = new Date().toISOString().split("T")[0];
  const initialIso =
    typeof params.date === "string" && isRealIso(params.date) ? params.date : todayIso;

  const isoToEuro = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };
  const euroToIso = (euro: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(euro.trim());
    if (!m) return null;
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    return isRealIso(iso) ? iso : null;
  };
  const handleDateChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    if (digits.length > 4) {
      setDate(`${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`);
    } else if (digits.length > 2) {
      setDate(`${digits.slice(0, 2)}/${digits.slice(2)}`);
    } else {
      setDate(digits);
    }
  };

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(isoToEuro(initialIso));
  const [time, setTime] = useState("");
  const [isAllDay, setIsAllDay] = useState(true);
  const [selectedMember, setSelectedMember] = useState(data.members[0]?.id || "");
  const [selectedColor, setSelectedColor] = useState(EVENT_COLORS[0]);

  const handleSave = () => {
    const isoDate = euroToIso(date);
    if (title.trim() && isoDate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        date: isoDate,
        time: isAllDay ? undefined : time || undefined,
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
                label="Titolo"
                placeholder="Titolo dell'evento"
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </View>
            {currentFamily ? (
              <View style={styles.micWrap}>
                <VoiceInput
                  familyId={currentFamily.id}
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
          <Input
            label="Data"
            placeholder="GG/MM/AAAA"
            value={date}
            onChangeText={handleDateChange}
            keyboardType="number-pad"
          />
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
          <View style={styles.field}>
            <Input
              label="Orario"
              placeholder="HH:MM (es. 14:30)"
              value={time}
              onChangeText={setTime}
            />
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
          disabled={!title.trim() || !euroToIso(date)}
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

import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";

const POINTS_OPTIONS = [5, 10, 15, 20, 25, 50];
const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export default function AddChoreScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, addChore } = useFamily();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [points, setPoints] = useState(10);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [selectedMember, setSelectedMember] = useState(data.members[0]?.id || "");

  const handleSave = () => {
    if (title.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addChore({
        title: title.trim(),
        description: description.trim() || undefined,
        assignedTo: selectedMember,
        dueDate: dueDate || undefined,
        points,
        isRecurring,
        frequency: isRecurring ? frequency : undefined,
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
        <Text style={[styles.title, { color: colors.text }]}>Add Chore</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.field}>
          <Input
            label="Title"
            placeholder="What needs to be done?"
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Description (optional)"
            placeholder="Add details..."
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 80, textAlignVertical: "top", paddingTop: 12 }}
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Due Date (optional)"
            placeholder="YYYY-MM-DD"
            value={dueDate}
            onChangeText={setDueDate}
          />
        </View>

        {data.members.length > 0 && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Assign to</Text>
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
          <Text style={[styles.label, { color: colors.text }]}>Points</Text>
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
            <Text style={[styles.rowLabel, { color: colors.text }]}>Recurring</Text>
            <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
              Automatically repeats
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
            <Text style={[styles.label, { color: colors.text }]}>Frequency</Text>
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
          </View>
        )}

        <Button
          title="Add Chore"
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
});

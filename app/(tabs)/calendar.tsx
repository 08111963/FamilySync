import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, currentFamily, getEventsForDate, deleteEvent } = useFamily();
  
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split("T")[0]);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const events = getEventsForDate(selectedDate);
  const familyId = currentFamily?.id || "";

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  const goToPreviousMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const selectDate = (day: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateStr);
  };

  const hasEventsOnDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return data.events.some((e) => e.date === dateStr);
  };

  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return dateStr === selectedDate;
  };

  const getMember = (memberId: string | null | undefined) => {
    return data.members.find((m) => m.id === memberId);
  };

  const handleDeleteEvent = (eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteEvent(eventId);
  };

  const handleReportEvent = (eventId: string) => {
    router.push({
      pathname: "/report-content",
      params: { targetType: "calendar_event", targetId: eventId, familyId },
    });
  };

  const handleEventActions = (eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      if (confirm("Vuoi segnalare questo evento?")) {
        handleReportEvent(eventId);
      }
    } else {
      Alert.alert("Azioni", "", [
        { text: "Segnala", onPress: () => handleReportEvent(eventId) },
        { text: "Annulla", style: "cancel" },
      ]);
    }
  };

  const formatSelectedDate = () => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const calendarDays = generateCalendarDays();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Calendario</Text>
        <Pressable
          onPress={() => router.push({ pathname: "/add-event", params: { date: selectedDate } })}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      <Card style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <Pressable onPress={goToPreviousMonth} style={styles.monthButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          <Pressable onPress={goToNextMonth} style={styles.monthButton}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.weekdaysRow}>
          {WEEKDAYS.map((day) => (
            <Text key={day} style={[styles.weekday, { color: colors.textSecondary }]}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {calendarDays.map((day, index) => (
            <View key={index} style={styles.dayCell}>
              {day !== null && (
                <Pressable
                  onPress={() => selectDate(day)}
                  style={({ pressed }) => [
                    styles.dayButton,
                    isSelected(day) && { backgroundColor: colors.primary },
                    isToday(day) && !isSelected(day) && { borderColor: colors.primary, borderWidth: 2 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: isSelected(day) ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {day}
                  </Text>
                  {hasEventsOnDay(day) && (
                    <View style={[styles.eventDot, { backgroundColor: isSelected(day) ? "#FFFFFF" : colors.secondary }]} />
                  )}
                </Pressable>
              )}
            </View>
          ))}
        </View>
      </Card>

      <ScrollView
        style={styles.eventsList}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eventsTitle, { color: colors.text }]}>
          Eventi del {formatSelectedDate()}
        </Text>
        {events.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Nessun evento"
            subtitle="Tocca + per aggiungere un evento"
          />
        ) : (
          <View style={styles.eventsCards}>
            {events.map((event) => {
              const member = getMember(event.memberId);
              return (
                <Card key={event.id} style={styles.eventCard}>
                  <View style={[styles.eventColorBar, { backgroundColor: event.color }]} />
                  <View style={styles.eventContent}>
                    <View style={styles.eventHeader}>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                      <View style={styles.eventActions}>
                        <Pressable onPress={() => handleEventActions(event.id)} style={styles.actionBtn}>
                          <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteEvent(event.id)} style={styles.actionBtn}>
                          <Ionicons name="trash-outline" size={18} color={colors.error} />
                        </Pressable>
                      </View>
                    </View>
                    {event.description && (
                      <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                        {event.description}
                      </Text>
                    )}
                    <View style={styles.eventMeta}>
                      {event.time && (
                        <View style={styles.eventTimeRow}>
                          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                          <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                            {event.time}
                          </Text>
                        </View>
                      )}
                      {member && (
                        <View style={styles.eventMemberRow}>
                          <Avatar name={member.name} color={member.color} size={20} />
                          <Text style={[styles.eventMemberName, { color: colors.textSecondary }]}>
                            {member.name}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  calendarCard: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  monthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  monthButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  weekdaysRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    padding: 2,
  },
  dayButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  dayText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  eventsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  eventsTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  eventsCards: {
    gap: 12,
  },
  eventCard: {
    flexDirection: "row",
    padding: 0,
    overflow: "hidden",
  },
  eventColorBar: {
    width: 4,
  },
  eventContent: {
    flex: 1,
    padding: 16,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  eventActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    padding: 4,
  },
  eventDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  eventMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  eventTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  eventTime: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  eventMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventMemberName: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});

import { Platform } from "react-native";
import * as Calendar from "expo-calendar";

export interface DeviceCalendarEvent {
  title: string;
  description?: string | null;
  location?: string | null;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  allDay?: boolean | null;
}

export interface DeviceCalendarResult {
  ok: boolean;
  message: string;
}

let cachedCalendarId: string | null = null;

/** Trova (o sceglie) un calendario scrivibile sul dispositivo. */
async function getWritableCalendarId(): Promise<string | null> {
  if (cachedCalendarId) return cachedCalendarId;

  if (Platform.OS === "ios") {
    const def = await Calendar.getDefaultCalendarAsync();
    cachedCalendarId = def?.id ?? null;
    return cachedCalendarId;
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  const primary = writable.find((c) => (c as any).isPrimary) ?? writable[0];
  cachedCalendarId = primary?.id ?? null;
  return cachedCalendarId;
}

function buildDates(event: DeviceCalendarEvent): { start: Date; end: Date; allDay: boolean } {
  const allDay = !!event.allDay || !event.time;
  if (allDay) {
    const start = new Date(`${event.date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, allDay: true };
  }
  const start = new Date(`${event.date}T${event.time}:00`);
  let end: Date;
  if (event.endTime) {
    end = new Date(`${event.date}T${event.endTime}:00`);
    if (end <= start) end.setDate(end.getDate() + 1); // fine "prima" dell'inizio = giorno dopo
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000); // default 1 ora
  }
  return { start, end, allDay: false };
}

/**
 * Salva un evento FamilySync nel calendario del telefono.
 * Ritorna sempre un esito con messaggio in italiano da mostrare all'utente.
 */
export async function addEventToDeviceCalendar(
  event: DeviceCalendarEvent
): Promise<DeviceCalendarResult> {
  if (Platform.OS === "web") {
    return {
      ok: false,
      message:
        "Disponibile solo su iPhone e Android. Sul web puoi usare il link di iscrizione al calendario (scheda Famiglia).",
    };
  }

  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") {
      return {
        ok: false,
        message: "Permesso calendario negato. Puoi attivarlo dalle impostazioni del telefono.",
      };
    }

    const calendarId = await getWritableCalendarId();
    if (!calendarId) {
      return { ok: false, message: "Nessun calendario disponibile sul dispositivo." };
    }

    const { start, end, allDay } = buildDates(event);

    await Calendar.createEventAsync(calendarId, {
      title: event.title,
      notes: event.description ?? undefined,
      location: event.location ?? undefined,
      startDate: start,
      endDate: end,
      allDay,
    });

    return { ok: true, message: "Evento salvato nel calendario del telefono." };
  } catch (err) {
    cachedCalendarId = null;
    return {
      ok: false,
      message: "Non sono riuscito a salvare l'evento nel calendario del telefono.",
    };
  }
}

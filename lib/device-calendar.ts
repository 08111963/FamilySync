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

const FAMILY_CALENDAR_TITLE = "FamilySync";
const FAMILY_CALENDAR_COLOR = "#F43F5E";

/** Trova o crea il calendario dedicato "FamilySync" sul dispositivo. */
async function getOrCreateFamilyCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find(
    (c) => c.title === FAMILY_CALENDAR_TITLE && c.allowsModifications
  );
  if (existing) return existing.id;

  if (Platform.OS === "ios") {
    const def = await Calendar.getDefaultCalendarAsync();
    const source =
      def?.source ??
      (await Calendar.getSourcesAsync()).find(
        (s) => s.type === Calendar.SourceType.LOCAL || s.type === Calendar.SourceType.CALDAV
      );
    if (!source) return null;
    return Calendar.createCalendarAsync({
      title: FAMILY_CALENDAR_TITLE,
      name: FAMILY_CALENDAR_TITLE,
      color: FAMILY_CALENDAR_COLOR,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: source.id,
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  return Calendar.createCalendarAsync({
    title: FAMILY_CALENDAR_TITLE,
    name: FAMILY_CALENDAR_TITLE,
    color: FAMILY_CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    ownerAccount: FAMILY_CALENDAR_TITLE,
    source: {
      isLocalAccount: true,
      name: FAMILY_CALENDAR_TITLE,
      type: Calendar.SourceType.LOCAL,
    },
  });
}

/**
 * Sincronizza TUTTI gli eventi passati nel calendario dedicato "FamilySync" del telefono.
 * Idempotente: svuota il calendario dedicato e lo riscrive, quindi niente duplicati
 * anche ripetendo la sincronizzazione. Non tocca gli altri calendari del telefono.
 */
export async function syncEventsToDeviceCalendar(
  events: DeviceCalendarEvent[]
): Promise<DeviceCalendarResult & { count?: number }> {
  if (Platform.OS === "web") {
    return {
      ok: false,
      message:
        "Disponibile solo su iPhone e Android. Sul web puoi usare il link di iscrizione qui sotto.",
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

    const calendarId = await getOrCreateFamilyCalendarId();
    if (!calendarId) {
      return { ok: false, message: "Non sono riuscito a creare il calendario FamilySync sul telefono." };
    }

    // Svuota il calendario dedicato (finestra ampia) per evitare duplicati
    const from = new Date();
    from.setDate(from.getDate() - 366);
    const to = new Date();
    to.setDate(to.getDate() + 731);
    const oldEvents = await Calendar.getEventsAsync([calendarId], from, to);
    for (const ev of oldEvents) {
      try {
        await Calendar.deleteEventAsync(ev.id);
      } catch {}
    }

    let count = 0;
    for (const event of events) {
      const { start, end, allDay } = buildDates(event);
      await Calendar.createEventAsync(calendarId, {
        title: event.title,
        notes: event.description ?? undefined,
        location: event.location ?? undefined,
        startDate: start,
        endDate: end,
        allDay,
      });
      count += 1;
    }

    return {
      ok: true,
      count,
      message:
        count === 0
          ? "Nessun evento da sincronizzare: il calendario FamilySync del telefono è stato svuotato."
          : `${count} eventi copiati nel calendario "FamilySync" del telefono. Ripeti quando vuoi per aggiornarli.`,
    };
  } catch {
    return {
      ok: false,
      message: "Non sono riuscito a sincronizzare gli eventi nel calendario del telefono.",
    };
  }
}

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

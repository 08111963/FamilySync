import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  type NotifiableChore,
  type StoredChoreNotification,
  choreNotificationSignature,
  computeChoreNotificationTriggers,
  reconcileChoreNotifications,
} from "@/lib/chore-notifications";

type StoredMap = Record<string, StoredChoreNotification>;

function storageKey(familyId: string): string {
  return `@family_sync_chore_notifs:${familyId}`;
}

async function loadStored(familyId: string): Promise<StoredMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(familyId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredMap) : {};
  } catch {
    return {};
  }
}

async function saveStored(familyId: string, map: StoredMap): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(familyId), JSON.stringify(map));
  } catch {}
}

export type NotifPermission = "granted" | "denied" | "undetermined" | "unsupported";

interface UseChoreLocalNotificationsArgs {
  familyId: string | undefined;
  chores: NotifiableChore[];
  enabled?: boolean;
}

/**
 * Programma notifiche locali FUTURE per le faccende con scadenza e le tiene
 * sincronizzate. Riprogramma quando: cambiano le faccende (creazione/modifica/
 * completamento/sync), cambia la famiglia, l'app torna in primo piano. Cancella
 * quando una faccenda viene completata, eliminata o cambia scadenza (la firma
 * cambia e la notifica viene cancellata/riprogrammata).
 *
 * Concorrenza: se arriva un nuovo aggiornamento mentre una sincronizzazione è in
 * corso, viene marcato un "pending rerun" e la sync viene rieseguita al termine
 * usando sempre i dati più recenti (letti dai ref), così nessun cambiamento va perso.
 *
 * Se il permesso notifiche è negato, l'app continua a funzionare: nessun crash.
 */
export function useChoreLocalNotifications({
  familyId,
  chores,
  enabled = true,
}: UseChoreLocalNotificationsArgs) {
  const [permission, setPermission] = useState<NotifPermission>(
    Platform.OS === "web" ? "unsupported" : "undetermined"
  );
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const [appActiveTick, setAppActiveTick] = useState(0);

  const latestRef = useRef({ familyId, chores, enabled });
  latestRef.current = { familyId, chores, enabled };

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setAppActiveTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  const ensurePermission = useCallback(async (): Promise<NotifPermission> => {
    if (Platform.OS === "web") return "unsupported";
    try {
      const current = await Notifications.getPermissionsAsync();
      let status = current.status;
      if (status !== "granted" && current.canAskAgain) {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status === "granted") return "granted";
      if (status === "denied") return "denied";
      return "undetermined";
    } catch {
      return "undetermined";
    }
  }, []);

  const syncOnce = useCallback(async () => {
    const { familyId: fam, chores: currentChores, enabled: isEnabled } = latestRef.current;
    if (!isEnabled || !fam || Platform.OS === "web") return;

    const perm = await ensurePermission();
    setPermission(perm);
    if (perm !== "granted") return;

    const stored = await loadStored(fam);
    const desired = currentChores.map((c) => ({
      choreId: c.id,
      signature: choreNotificationSignature(c),
    }));

    const { toCancelIds, toScheduleIds } = reconcileChoreNotifications(desired, stored);
    if (toCancelIds.length === 0 && toScheduleIds.length === 0) return;

    const next: StoredMap = { ...stored };

    for (const choreId of toCancelIds) {
      const entry = stored[choreId];
      if (entry) {
        for (const id of entry.notifIds) {
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {}
        }
      }
      delete next[choreId];
    }

    const now = new Date();
    const choreById = new Map(currentChores.map((c) => [c.id, c]));
    for (const choreId of toScheduleIds) {
      const chore = choreById.get(choreId);
      if (!chore) continue;
      const prev = next[choreId];
      if (prev) {
        for (const id of prev.notifIds) {
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {}
        }
      }
      const triggers = computeChoreNotificationTriggers(chore, now);
      const notifIds: string[] = [];
      for (const t of triggers) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: t.title,
              body: t.body,
              data: { choreId: chore.id, familyId: fam, kind: "chore_reminder" },
              sound: "default",
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: t.date,
            },
          });
          notifIds.push(id);
        } catch {}
      }
      if (notifIds.length > 0) {
        next[choreId] = {
          signature: choreNotificationSignature(chore),
          notifIds,
        };
      } else {
        delete next[choreId];
      }
    }

    await saveStored(fam, next);
  }, [ensurePermission]);

  const kickRunner = useCallback(async () => {
    pendingRef.current = true;
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (pendingRef.current) {
        pendingRef.current = false;
        await syncOnce();
      }
    } finally {
      runningRef.current = false;
    }
  }, [syncOnce]);

  const choresSignature = chores
    .map((c) => `${c.id}:${choreNotificationSignature(c)}`)
    .join(",");

  useEffect(() => {
    if (!enabled || !familyId || Platform.OS === "web") return;
    kickRunner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, choresSignature, enabled, appActiveTick, kickRunner]);

  return {
    permission,
    permissionDenied: permission === "denied",
  };
}

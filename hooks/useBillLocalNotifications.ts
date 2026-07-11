import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  type BillPlan,
  type NotifiableBill,
  type StoredBillNotification,
  billNotificationSignature,
  computeBillNotificationTriggers,
  reconcileBillNotifications,
} from "@/lib/bill-notifications";
import { PUSH_TOKEN_STORAGE_KEY } from "@/hooks/usePushNotifications";

type StoredMap = Record<string, StoredBillNotification>;

function storageKey(familyId: string): string {
  return `@family_sync_bill_notifs:${familyId}`;
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

interface UseBillLocalNotificationsArgs {
  familyId: string | undefined;
  bills: NotifiableBill[];
  plan: BillPlan;
  enabled?: boolean;
}

/**
 * Programma notifiche locali FUTURE per le bollette e le tiene sincronizzate.
 *
 * Riprogramma quando: cambiano le bollette (creazione/modifica/sync), cambia la
 * famiglia, l'app torna in primo piano. Cancella quando una bolletta viene pagata,
 * eliminata, ha i promemoria disattivati o cambia la data di scadenza (la firma
 * cambia e la notifica viene cancellata/riprogrammata).
 *
 * Concorrenza: se arriva un nuovo aggiornamento mentre una sincronizzazione è in
 * corso, viene marcato un "pending rerun" e la sync viene rieseguita al termine
 * usando sempre i dati più recenti (letti dai ref), così nessun cambiamento va perso.
 *
 * Se il permesso notifiche è negato, l'app continua a funzionare: nessun crash,
 * lo stato `permission` permette di mostrare un messaggio all'utente.
 */
export function useBillLocalNotifications({
  familyId,
  bills,
  plan,
  enabled = true,
}: UseBillLocalNotificationsArgs) {
  const [permission, setPermission] = useState<NotifPermission>(
    Platform.OS === "web" ? "unsupported" : "undetermined"
  );
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const [appActiveTick, setAppActiveTick] = useState(0);

  // Dati più recenti, letti dal loop di sincronizzazione (evita closure stantie).
  const latestRef = useRef({ familyId, bills, plan, enabled });
  latestRef.current = { familyId, bills, plan, enabled };

  // Riprogramma quando l'app torna in primo piano.
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

  // Esegue UNA sincronizzazione usando i dati più recenti dai ref.
  const syncOnce = useCallback(async () => {
    const { familyId: fam, bills: currentBills, plan: currentPlan, enabled: isEnabled } =
      latestRef.current;
    if (!isEnabled || !fam || Platform.OS === "web") return;

    const perm = await ensurePermission();
    setPermission(perm);
    if (perm !== "granted") return;

    // Se il dispositivo riceve i promemoria via push dal server (build di
    // produzione con token registrato), niente notifiche locali per le
    // bollette: arriverebbero doppie. In Expo Go / sviluppo il token non
    // viene mai registrato, quindi restano le notifiche locali.
    try {
      const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
      if (pushToken) {
        const storedForCleanup = await loadStored(fam);
        const ids = Object.values(storedForCleanup).flatMap((e) => e.notifIds);
        for (const id of ids) {
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {}
        }
        if (ids.length > 0 || Object.keys(storedForCleanup).length > 0) {
          await saveStored(fam, {});
        }
        return;
      }
    } catch {}

    const stored = await loadStored(fam);
    const desired = currentBills.map((b) => ({
      billId: b.id,
      signature: billNotificationSignature(b, currentPlan),
    }));

    const { toCancelBillIds, toScheduleBillIds } = reconcileBillNotifications(desired, stored);
    if (toCancelBillIds.length === 0 && toScheduleBillIds.length === 0) return;

    const next: StoredMap = { ...stored };

    // Cancella le notifiche obsolete.
    for (const billId of toCancelBillIds) {
      const entry = stored[billId];
      if (entry) {
        for (const id of entry.notifIds) {
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {}
        }
      }
      delete next[billId];
    }

    // (Ri)programma le notifiche aggiornate.
    const now = new Date();
    const billById = new Map(currentBills.map((b) => [b.id, b]));
    for (const billId of toScheduleBillIds) {
      const bill = billById.get(billId);
      if (!bill) continue;
      // Se era già programmata con firma diversa, prima cancella.
      const prev = next[billId];
      if (prev) {
        for (const id of prev.notifIds) {
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {}
        }
      }
      const triggers = computeBillNotificationTriggers(bill, currentPlan, now);
      const notifIds: string[] = [];
      for (const t of triggers) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: t.title,
              body: t.body,
              data: { billId: bill.id, familyId: fam, kind: "bill_reminder" },
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
        next[billId] = {
          signature: billNotificationSignature(bill, currentPlan),
          notifIds,
        };
      } else {
        delete next[billId];
      }
    }

    await saveStored(fam, next);
  }, [ensurePermission]);

  // Avvia il runner: se una sync è già in corso marca un rerun, altrimenti
  // gira in loop finché non ci sono più aggiornamenti pendenti.
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

  // Firma complessiva dei dati: riesegue la sincronizzazione solo quando serve.
  const billsSignature = bills
    .map((b) => `${b.id}:${billNotificationSignature(b, plan)}`)
    .join(",");

  useEffect(() => {
    if (!enabled || !familyId || Platform.OS === "web") return;
    kickRunner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, billsSignature, plan, enabled, appActiveTick, kickRunner]);

  return {
    permission,
    permissionDenied: permission === "denied",
  };
}

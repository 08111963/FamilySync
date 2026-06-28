import React, { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { useFamily } from "@/context/FamilyContext";
import { useSubscription } from "@/lib/revenuecat";
import {
  useBillLocalNotifications,
  type NotifPermission,
} from "@/hooks/useBillLocalNotifications";
import type { NotifiableBill } from "@/lib/bill-notifications";

interface BillNotificationsContextValue {
  permission: NotifPermission;
  permissionDenied: boolean;
}

const BillNotificationsContext = createContext<BillNotificationsContextValue>({
  permission: "undetermined",
  permissionDenied: false,
});

/** Stato del permesso notifiche, condiviso con le schermate (es. tab Bollette). */
export function useBillNotificationsStatus(): BillNotificationsContextValue {
  return useContext(BillNotificationsContext);
}

/**
 * Provider GLOBALE che tiene sincronizzate le notifiche locali delle bollette
 * a prescindere dalla schermata aperta.
 *
 * Montato vicino alla radice (dentro FamilyProvider), legge la famiglia corrente,
 * carica le bollette e delega a useBillLocalNotifications la (ri)programmazione.
 * Così la sincronizzazione avviene all'apertura dell'app, al cambio famiglia, alla
 * sincronizzazione dell'elenco bollette e quando l'app torna in primo piano, anche
 * se l'utente non entra mai nella tab Bollette. La tab Bollette mostra solo la UI
 * e il messaggio sul permesso notifiche (via useBillNotificationsStatus).
 */
export function BillNotificationsSyncProvider({ children }: { children: React.ReactNode }) {
  const { currentFamily } = useFamily();
  const { isSubscribed } = useSubscription();
  const familyId = currentFamily?.id;

  const billsQuery = useQuery<NotifiableBill[]>({
    queryKey: [`/api/bills/${familyId}`],
    enabled: !!familyId,
    staleTime: 15000,
  });

  const bills = billsQuery.data ?? [];

  const status = useBillLocalNotifications({
    familyId,
    bills,
    plan: isSubscribed ? "premium" : "free",
  });

  return (
    <BillNotificationsContext.Provider value={status}>
      {children}
    </BillNotificationsContext.Provider>
  );
}

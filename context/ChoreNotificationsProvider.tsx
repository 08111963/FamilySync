import React, { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { useFamily } from "@/context/FamilyContext";
import {
  useChoreLocalNotifications,
  type NotifPermission,
} from "@/hooks/useChoreLocalNotifications";
import type { NotifiableChore } from "@/lib/chore-notifications";

interface ChoreNotificationsContextValue {
  permission: NotifPermission;
  permissionDenied: boolean;
}

const ChoreNotificationsContext = createContext<ChoreNotificationsContextValue>({
  permission: "undetermined",
  permissionDenied: false,
});

/** Stato del permesso notifiche faccende, condiviso con le schermate. */
export function useChoreNotificationsStatus(): ChoreNotificationsContextValue {
  return useContext(ChoreNotificationsContext);
}

/**
 * Provider GLOBALE che tiene sincronizzate le notifiche locali delle faccende
 * a prescindere dalla schermata aperta.
 *
 * Montato vicino alla radice (dentro FamilyProvider), legge la famiglia corrente,
 * carica le faccende e delega a useChoreLocalNotifications la (ri)programmazione.
 * Così la sincronizzazione avviene all'apertura dell'app, al cambio famiglia, alla
 * sincronizzazione dell'elenco faccende e quando l'app torna in primo piano.
 */
export function ChoreNotificationsSyncProvider({ children }: { children: React.ReactNode }) {
  const { currentFamily } = useFamily();
  const familyId = currentFamily?.id;

  const choresQuery = useQuery<NotifiableChore[]>({
    queryKey: ["/api/chores", familyId],
    enabled: !!familyId,
    staleTime: 15000,
  });

  const chores = choresQuery.data ?? [];

  const status = useChoreLocalNotifications({
    familyId,
    chores,
  });

  return (
    <ChoreNotificationsContext.Provider value={status}>
      {children}
    </ChoreNotificationsContext.Provider>
  );
}

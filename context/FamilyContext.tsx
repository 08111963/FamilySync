import { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";

const ACTIVE_FAMILY_KEY = "@family_sync_active_family";

interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  nickname: string;
  role: string;
  color: string;
  points: number;
  avatarUrl?: string;
}

interface CalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
  category?: string;
  location?: string;
  color: string;
  memberId?: string;
  createdBy: string;
}

interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
  note?: string;
  isChecked: boolean;
  createdBy?: string;
}

interface ShoppingList {
  id: string;
  familyId: string;
  name: string;
  icon?: string;
  createdBy: string;
  createdAt: string;
  items: ShoppingItem[];
}

interface Chore {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  difficulty?: number;
  points: number;
  estimatedMinutes?: number;
  assignedTo?: string;
  dueDate?: string;
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
  recurrenceRule?: string;
  createdBy?: string;
}

interface FamilyInfo {
  id: string;
  name: string;
  colorTheme?: string;
  myRole?: string;
  myMemberId?: string;
  subscriptionStatus?: string;
}

interface FamilyData {
  familyName: string;
  familyId: string | null;
  members: FamilyMember[];
  events: CalendarEvent[];
  shoppingLists: ShoppingList[];
  chores: Chore[];
}

interface FamilyContextType {
  data: FamilyData;
  isLoading: boolean;
  currentFamily: FamilyInfo | null;
  families: FamilyInfo[];
  setFamilyName: (name: string) => void;
  createFamily: (name: string) => Promise<void>;
  switchFamily: (familyId: string) => void;
  addMember: (member: { name: string; role: string; avatar: string; color: string }) => void;
  updateMember: (id: string, updates: Partial<FamilyMember>) => void;
  deleteMember: (id: string) => void;
  addEvent: (event: Omit<CalendarEvent, "id" | "familyId" | "createdBy">) => void;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  addShoppingList: (name: string) => void;
  deleteShoppingList: (id: string) => void;
  addShoppingItem: (listId: string, item: { name: string; addedBy?: string; quantity?: string; unit?: string; category?: string }) => void;
  toggleShoppingItem: (listId: string, itemId: string) => void;
  deleteShoppingItem: (listId: string, itemId: string) => void;
  addChore: (chore: { title: string; description?: string; assignedTo?: string; dueDate?: string; points: number; difficulty?: number; estimatedMinutes?: number; isRecurring?: boolean; frequency?: string }) => void;
  updateChore: (id: string, updates: Partial<Chore>) => void;
  deleteChore: (id: string) => void;
  completeChore: (id: string) => void;
  getMemberById: (id: string) => FamilyMember | undefined;
  getEventsForDate: (date: string) => CalendarEvent[];
  getUpcomingEvents: (limit?: number) => CalendarEvent[];
  getPendingChores: () => Chore[];
  getLeaderboard: () => FamilyMember[];
  refetchAll: () => void;
}

const FamilyContext = createContext<FamilyContextType | null>(null);

const defaultData: FamilyData = {
  familyName: "FamilySync",
  familyId: null,
  members: [],
  events: [],
  shoppingLists: [],
  chores: [],
};

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, accessToken } = useAuth();
  const qc = useQueryClient();
  const [currentFamilyId, setCurrentFamilyId] = useState<string | null>(null);
  const restoredRef = useRef(false);

  useWebSocket(currentFamilyId, accessToken);

  const familiesQuery = useQuery<FamilyInfo[]>({
    queryKey: ["/api/families"],
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  useEffect(() => {
    if (restoredRef.current) return;
    AsyncStorage.getItem(ACTIVE_FAMILY_KEY)
      .then((stored) => {
        if (stored) setCurrentFamilyId(stored);
        restoredRef.current = true;
      })
      .catch(() => { restoredRef.current = true; });
  }, []);

  useEffect(() => {
    if (!familiesQuery.data) return;
    if (familiesQuery.data.length === 0) {
      if (currentFamilyId !== null) {
        setCurrentFamilyId(null);
        AsyncStorage.removeItem(ACTIVE_FAMILY_KEY).catch(() => {});
      }
      return;
    }
    if (currentFamilyId && familiesQuery.data.some(f => f.id === currentFamilyId)) return;
    const nextId = familiesQuery.data[0].id;
    setCurrentFamilyId(nextId);
    AsyncStorage.setItem(ACTIVE_FAMILY_KEY, nextId).catch(() => {});
  }, [familiesQuery.data, currentFamilyId]);

  const familyDetailQuery = useQuery<any>({
    queryKey: ["/api/families", currentFamilyId],
    enabled: !!currentFamilyId && isAuthenticated,
    staleTime: 15000,
  });

  const eventsQuery = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar", currentFamilyId],
    enabled: !!currentFamilyId && isAuthenticated,
    staleTime: 15000,
  });

  const shoppingQuery = useQuery<ShoppingList[]>({
    queryKey: ["/api/shopping", currentFamilyId, "lists"],
    enabled: !!currentFamilyId && isAuthenticated,
    staleTime: 15000,
  });

  const choresQuery = useQuery<Chore[]>({
    queryKey: ["/api/chores", currentFamilyId],
    enabled: !!currentFamilyId && isAuthenticated,
    staleTime: 15000,
  });

  const families = familiesQuery.data || [];
  const currentFamily = families.find(f => f.id === currentFamilyId) || null;
  const members: FamilyMember[] = familyDetailQuery.data?.members || [];
  const events: CalendarEvent[] = eventsQuery.data || [];
  const shoppingLists: ShoppingList[] = shoppingQuery.data || [];
  const choresList: Chore[] = choresQuery.data || [];

  const isLoading = familiesQuery.isLoading || (!!currentFamilyId && (familyDetailQuery.isLoading || eventsQuery.isLoading));

  const data: FamilyData = useMemo(() => ({
    familyName: currentFamily?.name || "FamilySync",
    familyId: currentFamilyId,
    members,
    events,
    shoppingLists,
    chores: choresList.map(c => ({
      ...c,
      dueDate: c.dueDate ? new Date(c.dueDate).toISOString().split("T")[0] : undefined,
      isRecurring: !!c.recurrenceRule,
      frequency: c.recurrenceRule || undefined,
    })),
  }), [currentFamily, currentFamilyId, members, events, shoppingLists, choresList]);

  const refetchAll = useCallback(() => {
    if (currentFamilyId) {
      qc.invalidateQueries({ queryKey: ["/api/families"] });
      qc.invalidateQueries({ queryKey: ["/api/families", currentFamilyId] });
      qc.invalidateQueries({ queryKey: ["/api/calendar", currentFamilyId] });
      qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamilyId, "lists"] });
      qc.invalidateQueries({ queryKey: ["/api/chores", currentFamilyId] });
    }
  }, [currentFamilyId, qc]);

  const createFamily = useCallback(async (name: string) => {
    try {
      const res = await apiRequest("POST", "/api/families", { name });
      const family = await res.json();
      setCurrentFamilyId(family.id);
      AsyncStorage.setItem(ACTIVE_FAMILY_KEY, family.id).catch(() => {});
      qc.invalidateQueries({ queryKey: ["/api/families"] });
    } catch (error) {
      console.error("Error creating family:", error);
      throw error;
    }
  }, [qc]);

  const switchFamily = useCallback((familyId: string) => {
    setCurrentFamilyId(familyId);
    AsyncStorage.setItem(ACTIVE_FAMILY_KEY, familyId).catch(() => {});
    qc.invalidateQueries({ queryKey: ["/api/families", familyId] });
    qc.invalidateQueries({ queryKey: ["/api/calendar", familyId] });
    qc.invalidateQueries({ queryKey: ["/api/shopping", familyId, "lists"] });
    qc.invalidateQueries({ queryKey: ["/api/chores", familyId] });
  }, [qc]);

  const setFamilyName = useCallback((name: string) => {
    if (!currentFamilyId) return;
    apiRequest("PUT", `/api/families/${currentFamilyId}`, { name })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["/api/families"] });
        qc.invalidateQueries({ queryKey: ["/api/families", currentFamilyId] });
      })
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const addMember = useCallback((_member: { name: string; role: string; avatar: string; color: string }) => {
    // Members are added via invite flow in the backend
  }, []);

  const updateMember = useCallback((id: string, updates: Partial<FamilyMember>) => {
    if (!currentFamilyId) return;
    apiRequest("PUT", `/api/families/${currentFamilyId}/members/${id}`, updates)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/families", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const deleteMember = useCallback((id: string) => {
    if (!currentFamilyId) return;
    apiRequest("DELETE", `/api/families/${currentFamilyId}/members/${id}`)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/families", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const addEvent = useCallback((event: Omit<CalendarEvent, "id" | "familyId" | "createdBy">) => {
    if (!currentFamilyId) return;
    apiRequest("POST", `/api/calendar/${currentFamilyId}`, event)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/calendar", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const updateEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
    if (!currentFamilyId) return;
    apiRequest("PUT", `/api/calendar/${currentFamilyId}/${id}`, updates)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/calendar", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const deleteEvent = useCallback((id: string) => {
    if (!currentFamilyId) return;
    apiRequest("DELETE", `/api/calendar/${currentFamilyId}/${id}`)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/calendar", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const addShoppingList = useCallback((name: string) => {
    if (!currentFamilyId) return;
    apiRequest("POST", `/api/shopping/${currentFamilyId}/lists`, { name })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamilyId, "lists"] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const deleteShoppingList = useCallback((id: string) => {
    if (!currentFamilyId) return;
    apiRequest("DELETE", `/api/shopping/${currentFamilyId}/lists/${id}`)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamilyId, "lists"] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const addShoppingItem = useCallback((listId: string, item: { name: string; addedBy?: string; quantity?: string; unit?: string; category?: string }) => {
    if (!currentFamilyId) return;
    apiRequest("POST", `/api/shopping/${currentFamilyId}/lists/${listId}/items`, { name: item.name, quantity: item.quantity, unit: item.unit, category: item.category })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamilyId, "lists"] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const toggleShoppingItem = useCallback((listId: string, itemId: string) => {
    if (!currentFamilyId) return;
    apiRequest("PATCH", `/api/shopping/${currentFamilyId}/lists/${listId}/items/${itemId}/toggle`)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamilyId, "lists"] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const deleteShoppingItem = useCallback((listId: string, itemId: string) => {
    if (!currentFamilyId) return;
    apiRequest("DELETE", `/api/shopping/${currentFamilyId}/lists/${listId}/items/${itemId}`)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamilyId, "lists"] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const addChore = useCallback((chore: { title: string; description?: string; assignedTo?: string; dueDate?: string; points: number; difficulty?: number; estimatedMinutes?: number; isRecurring?: boolean; frequency?: string }) => {
    if (!currentFamilyId) return;
    apiRequest("POST", `/api/chores/${currentFamilyId}`, {
      title: chore.title,
      description: chore.description,
      assignedTo: chore.assignedTo,
      dueDate: chore.dueDate,
      points: chore.points,
      difficulty: chore.difficulty,
      estimatedMinutes: chore.estimatedMinutes,
      recurrenceRule: chore.isRecurring ? chore.frequency : undefined,
    })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/chores", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const updateChore = useCallback((id: string, updates: Partial<Chore>) => {
    if (!currentFamilyId) return;
    apiRequest("PUT", `/api/chores/${currentFamilyId}/${id}`, updates)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/chores", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const deleteChore = useCallback((id: string) => {
    if (!currentFamilyId) return;
    apiRequest("DELETE", `/api/chores/${currentFamilyId}/${id}`)
      .then(() => qc.invalidateQueries({ queryKey: ["/api/chores", currentFamilyId] }))
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const completeChore = useCallback((id: string) => {
    if (!currentFamilyId) return;
    apiRequest("PATCH", `/api/chores/${currentFamilyId}/${id}/complete`)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["/api/chores", currentFamilyId] });
        qc.invalidateQueries({ queryKey: ["/api/families", currentFamilyId] });
      })
      .catch(console.error);
  }, [currentFamilyId, qc]);

  const getMemberById = useCallback((id: string) => {
    return members.find((m) => m.id === id);
  }, [members]);

  const getEventsForDate = useCallback((date: string) => {
    return events.filter((e) => e.date === date);
  }, [events]);

  const getUpcomingEvents = useCallback((limit = 5) => {
    const today = new Date().toISOString().split("T")[0];
    return events
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  }, [events]);

  const getPendingChores = useCallback(() => {
    return choresList.filter((c) => !c.isCompleted);
  }, [choresList]);

  const getLeaderboard = useCallback(() => {
    return [...members].sort((a, b) => (b.points || 0) - (a.points || 0));
  }, [members]);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      currentFamily,
      families,
      setFamilyName,
      createFamily,
      switchFamily,
      addMember,
      updateMember,
      deleteMember,
      addEvent,
      updateEvent,
      deleteEvent,
      addShoppingList,
      deleteShoppingList,
      addShoppingItem,
      toggleShoppingItem,
      deleteShoppingItem,
      addChore,
      updateChore,
      deleteChore,
      completeChore,
      getMemberById,
      getEventsForDate,
      getUpcomingEvents,
      getPendingChores,
      getLeaderboard,
      refetchAll,
    }),
    [data, isLoading, currentFamily, families, setFamilyName, createFamily, switchFamily, addMember, updateMember, deleteMember, addEvent, updateEvent, deleteEvent, addShoppingList, deleteShoppingList, addShoppingItem, toggleShoppingItem, deleteShoppingItem, addChore, updateChore, deleteChore, completeChore, getMemberById, getEventsForDate, getUpcomingEvents, getPendingChores, getLeaderboard, refetchAll]
  );

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily() {
  const context = useContext(FamilyContext);
  if (!context) {
    throw new Error("useFamily must be used within a FamilyProvider");
  }
  return context;
}

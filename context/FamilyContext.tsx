import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { FamilyData, FamilyMember, CalendarEvent, ShoppingList, ShoppingItem, Chore } from "@/types/family";
import Colors from "@/constants/colors";

const STORAGE_KEY = "@family_sync_data";

const defaultData: FamilyData = {
  familyName: "La Mia Famiglia",
  members: [],
  events: [],
  shoppingLists: [],
  chores: [],
};

interface FamilyContextType {
  data: FamilyData;
  isLoading: boolean;
  setFamilyName: (name: string) => void;
  addMember: (member: Omit<FamilyMember, "id" | "points">) => void;
  updateMember: (id: string, updates: Partial<FamilyMember>) => void;
  deleteMember: (id: string) => void;
  addEvent: (event: Omit<CalendarEvent, "id">) => void;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  addShoppingList: (name: string) => void;
  deleteShoppingList: (id: string) => void;
  addShoppingItem: (listId: string, item: Omit<ShoppingItem, "id" | "isChecked">) => void;
  toggleShoppingItem: (listId: string, itemId: string) => void;
  deleteShoppingItem: (listId: string, itemId: string) => void;
  addChore: (chore: Omit<Chore, "id" | "isCompleted">) => void;
  updateChore: (id: string, updates: Partial<Chore>) => void;
  deleteChore: (id: string) => void;
  completeChore: (id: string) => void;
  getMemberById: (id: string) => FamilyMember | undefined;
  getEventsForDate: (date: string) => CalendarEvent[];
  getUpcomingEvents: (limit?: number) => CalendarEvent[];
  getPendingChores: () => Chore[];
  getLeaderboard: () => FamilyMember[];
}

const FamilyContext = createContext<FamilyContextType | null>(null);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FamilyData>(defaultData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setData(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async (newData: FamilyData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      setData(newData);
    } catch (error) {
      console.error("Error saving data:", error);
    }
  };

  const generateId = () => Crypto.randomUUID();

  const setFamilyName = useCallback((name: string) => {
    setData((prev) => {
      const newData = { ...prev, familyName: name };
      saveData(newData);
      return newData;
    });
  }, []);

  const addMember = useCallback((member: Omit<FamilyMember, "id" | "points">) => {
    setData((prev) => {
      const colorIndex = prev.members.length % Colors.light.memberColors.length;
      const newMember: FamilyMember = {
        ...member,
        id: generateId(),
        points: 0,
        color: member.color || Colors.light.memberColors[colorIndex],
      };
      const newData = { ...prev, members: [...prev.members, newMember] };
      saveData(newData);
      return newData;
    });
  }, []);

  const updateMember = useCallback((id: string, updates: Partial<FamilyMember>) => {
    setData((prev) => {
      const newData = {
        ...prev,
        members: prev.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const deleteMember = useCallback((id: string) => {
    setData((prev) => {
      const newData = {
        ...prev,
        members: prev.members.filter((m) => m.id !== id),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const addEvent = useCallback((event: Omit<CalendarEvent, "id">) => {
    setData((prev) => {
      const newEvent: CalendarEvent = { ...event, id: generateId() };
      const newData = { ...prev, events: [...prev.events, newEvent] };
      saveData(newData);
      return newData;
    });
  }, []);

  const updateEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
    setData((prev) => {
      const newData = {
        ...prev,
        events: prev.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setData((prev) => {
      const newData = { ...prev, events: prev.events.filter((e) => e.id !== id) };
      saveData(newData);
      return newData;
    });
  }, []);

  const addShoppingList = useCallback((name: string) => {
    setData((prev) => {
      const newList: ShoppingList = {
        id: generateId(),
        name,
        items: [],
        createdAt: new Date().toISOString(),
      };
      const newData = { ...prev, shoppingLists: [...prev.shoppingLists, newList] };
      saveData(newData);
      return newData;
    });
  }, []);

  const deleteShoppingList = useCallback((id: string) => {
    setData((prev) => {
      const newData = {
        ...prev,
        shoppingLists: prev.shoppingLists.filter((l) => l.id !== id),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const addShoppingItem = useCallback((listId: string, item: Omit<ShoppingItem, "id" | "isChecked">) => {
    setData((prev) => {
      const newData = {
        ...prev,
        shoppingLists: prev.shoppingLists.map((list) =>
          list.id === listId
            ? {
                ...list,
                items: [...list.items, { ...item, id: generateId(), isChecked: false }],
              }
            : list
        ),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const toggleShoppingItem = useCallback((listId: string, itemId: string) => {
    setData((prev) => {
      const newData = {
        ...prev,
        shoppingLists: prev.shoppingLists.map((list) =>
          list.id === listId
            ? {
                ...list,
                items: list.items.map((item) =>
                  item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
                ),
              }
            : list
        ),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const deleteShoppingItem = useCallback((listId: string, itemId: string) => {
    setData((prev) => {
      const newData = {
        ...prev,
        shoppingLists: prev.shoppingLists.map((list) =>
          list.id === listId
            ? { ...list, items: list.items.filter((i) => i.id !== itemId) }
            : list
        ),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const addChore = useCallback((chore: Omit<Chore, "id" | "isCompleted">) => {
    setData((prev) => {
      const newChore: Chore = { ...chore, id: generateId(), isCompleted: false };
      const newData = { ...prev, chores: [...prev.chores, newChore] };
      saveData(newData);
      return newData;
    });
  }, []);

  const updateChore = useCallback((id: string, updates: Partial<Chore>) => {
    setData((prev) => {
      const newData = {
        ...prev,
        chores: prev.chores.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      };
      saveData(newData);
      return newData;
    });
  }, []);

  const deleteChore = useCallback((id: string) => {
    setData((prev) => {
      const newData = { ...prev, chores: prev.chores.filter((c) => c.id !== id) };
      saveData(newData);
      return newData;
    });
  }, []);

  const completeChore = useCallback((id: string) => {
    setData((prev) => {
      const chore = prev.chores.find((c) => c.id === id);
      if (!chore) return prev;

      const updatedMembers = prev.members.map((m) =>
        m.id === chore.assignedTo ? { ...m, points: m.points + chore.points } : m
      );

      const updatedChores = prev.chores.map((c) =>
        c.id === id ? { ...c, isCompleted: true } : c
      );

      const newData = { ...prev, members: updatedMembers, chores: updatedChores };
      saveData(newData);
      return newData;
    });
  }, []);

  const getMemberById = useCallback((id: string) => {
    return data.members.find((m) => m.id === id);
  }, [data.members]);

  const getEventsForDate = useCallback((date: string) => {
    return data.events.filter((e) => e.date === date);
  }, [data.events]);

  const getUpcomingEvents = useCallback((limit = 5) => {
    const today = new Date().toISOString().split("T")[0];
    return data.events
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  }, [data.events]);

  const getPendingChores = useCallback(() => {
    return data.chores.filter((c) => !c.isCompleted);
  }, [data.chores]);

  const getLeaderboard = useCallback(() => {
    return [...data.members].sort((a, b) => b.points - a.points);
  }, [data.members]);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      setFamilyName,
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
    }),
    [data, isLoading, setFamilyName, addMember, updateMember, deleteMember, addEvent, updateEvent, deleteEvent, addShoppingList, deleteShoppingList, addShoppingItem, toggleShoppingItem, deleteShoppingItem, addChore, updateChore, deleteChore, completeChore, getMemberById, getEventsForDate, getUpcomingEvents, getPendingChores, getLeaderboard]
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

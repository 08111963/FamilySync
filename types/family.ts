export interface FamilyMember {
  id: string;
  name: string;
  role: "parent" | "child" | "other";
  avatar: string;
  color: string;
  points: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  memberId: string;
  color: string;
  isAllDay: boolean;
}

export interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingItem[];
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: number;
  category?: string;
  isChecked: boolean;
  addedBy: string;
}

export interface Chore {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  dueDate?: string;
  points: number;
  isCompleted: boolean;
  isRecurring: boolean;
  frequency?: "daily" | "weekly" | "monthly";
}

export interface FamilyData {
  familyName: string;
  members: FamilyMember[];
  events: CalendarEvent[];
  shoppingLists: ShoppingList[];
  chores: Chore[];
}

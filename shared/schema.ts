import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  uuid, 
  timestamp, 
  integer,
  boolean,
  jsonb,
  pgEnum
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["admin", "adult", "teen", "child"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["free", "premium", "canceled"]);
export const eventCategoryEnum = pgEnum("event_category", ["work", "school", "sport", "health", "social", "family", "other"]);
export const choreDifficultyEnum = pgEnum("chore_difficulty", ["easy", "medium", "hard"]);

// USERS
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;

// FAMILIES
export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  colorTheme: varchar("color_theme", { length: 7 }).default("#6366F1"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("free"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Family = typeof families.$inferSelect;

// FAMILY MEMBERS
export const familyMembers = pgTable("family_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  nickname: varchar("nickname", { length: 100 }),
  color: varchar("color", { length: 7 }).notNull(),
  points: integer("points").default(0),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type FamilyMember = typeof familyMembers.$inferSelect;

// FAMILY INVITES
export const familyInvites = pgTable("family_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  role: roleEnum("role").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FamilyInvite = typeof familyInvites.$inferSelect;

// CALENDAR EVENTS
export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  date: varchar("date", { length: 10 }).notNull(),
  time: varchar("time", { length: 5 }),
  endTime: varchar("end_time", { length: 5 }),
  allDay: boolean("all_day").default(false),
  category: eventCategoryEnum("category").default("other"),
  location: varchar("location", { length: 255 }),
  color: varchar("color", { length: 7 }).notNull(),
  memberId: uuid("member_id").references(() => familyMembers.id, { onDelete: "set null" }),
  recurrenceRule: text("recurrence_rule"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CalendarEvent = typeof calendarEvents.$inferSelect;

// SHOPPING LISTS
export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ShoppingList = typeof shoppingLists.$inferSelect;

// SHOPPING ITEMS
export const shoppingItems = pgTable("shopping_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => shoppingLists.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  quantity: varchar("quantity", { length: 50 }),
  category: varchar("category", { length: 50 }),
  note: text("note"),
  isChecked: boolean("is_checked").default(false),
  checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
  checkedAt: timestamp("checked_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  position: integer("position").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ShoppingItem = typeof shoppingItems.$inferSelect;

// SHOPPING HISTORY (for AI)
export const shoppingHistory = pgTable("shopping_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  quantity: varchar("quantity", { length: 50 }),
  category: varchar("category", { length: 50 }),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
});

export type ShoppingHistoryItem = typeof shoppingHistory.$inferSelect;

// CHORES
export const chores = pgTable("chores", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  difficulty: choreDifficultyEnum("difficulty").default("medium"),
  points: integer("points").default(10),
  estimatedMinutes: integer("estimated_minutes"),
  assignedTo: uuid("assigned_to").references(() => familyMembers.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  recurrenceRule: text("recurrence_rule"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Chore = typeof chores.$inferSelect;

// AI INSIGHTS
export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  actionData: jsonb("action_data"),
  dismissed: boolean("dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiInsight = typeof aiInsights.$inferSelect;

// EMAIL VERIFICATION TOKENS
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// PASSWORD RESET TOKENS
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  name: true,
  passwordHash: true,
});

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
  pgEnum,
  index,
  unique,
  numeric,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["admin", "adult", "teen", "child"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["free", "premium", "canceled"]);
export const eventCategoryEnum = pgEnum("event_category", ["work", "school", "sport", "health", "social", "family", "other"]);
export const reportTargetTypeEnum = pgEnum("report_target_type", ["calendar_event", "shopping_item", "chore", "user"]);
export const reportReasonEnum = pgEnum("report_reason", ["spam", "harassment", "hate", "sexual", "violence", "other"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "actioned", "dismissed"]);
export const mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"]);
export const recipeSourceEnum = pgEnum("recipe_source", ["ai", "manual"]);
export const ingredientUnitEnum = pgEnum("ingredient_unit", ["g", "kg", "ml", "l", "pcs", "tbsp", "tsp", "cup", "pinch", "to_taste"]);

// USERS
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  aiFeaturesEnabled: boolean("ai_features_enabled").default(true).notNull(),
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
  quantity: numeric("quantity"),
  unit: varchar("unit", { length: 10 }),
  category: varchar("category", { length: 50 }).default("food").notNull(),
  note: text("note"),
  isChecked: boolean("is_checked").default(false),
  checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
  checkedAt: timestamp("checked_at"),
  createdBy: uuid("created_by").references(() => users.id),
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
  difficulty: integer("difficulty"),
  points: integer("points").default(10),
  estimatedMinutes: integer("estimated_minutes"),
  assignedTo: uuid("assigned_to").references(() => familyMembers.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  recurrenceRule: text("recurrence_rule"),
  createdBy: uuid("created_by").references(() => users.id),
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

// REPORTS (UGC moderation)
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id),
  targetType: reportTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reasonCategory: reportReasonEnum("reason_category").notNull(),
  reasonText: text("reason_text"),
  status: reportStatusEnum("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("reports_family_status_idx").on(table.familyId, table.status, table.createdAt),
  index("reports_target_idx").on(table.targetType, table.targetId),
]);

export type Report = typeof reports.$inferSelect;

// BLOCKS (family-scoped user blocks)
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  blockerUserId: uuid("blocker_user_id").notNull().references(() => users.id),
  blockedUserId: uuid("blocked_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("blocks_unique").on(table.familyId, table.blockerUserId, table.blockedUserId),
]);

export type Block = typeof blocks.$inferSelect;

// RECIPES
export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  source: recipeSourceEnum("source").notNull().default("ai"),
  title: text("title").notNull(),
  description: text("description"),
  servings: integer("servings"),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  steps: jsonb("steps").notNull().$type<string[]>(),
  tags: jsonb("tags").$type<{ diet?: string[]; allergens?: string[]; cuisine?: string; difficulty?: string }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Recipe = typeof recipes.$inferSelect;

// RECIPE INGREDIENTS
export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: numeric("quantity"),
  unit: ingredientUnitEnum("unit"),
  notes: text("notes"),
  category: varchar("category", { length: 50 }),
  normalizedName: text("normalized_name").notNull(),
}, (table) => [
  index("recipe_ingredients_recipe_idx").on(table.recipeId),
  index("recipe_ingredients_norm_idx").on(table.normalizedName),
]);

export type RecipeIngredient = typeof recipeIngredients.$inferSelect;

// MEAL PLANS
export const mealPlans = pgTable("meal_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  weekStartDate: date("week_start_date").notNull(),
  title: text("title"),
  preferences: jsonb("preferences").$type<{ diet?: string; allergies?: string; maxTimeMinutes?: number; mealsPerDay?: number }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("meal_plans_family_week").on(table.familyId, table.weekStartDate),
]);

export type MealPlan = typeof mealPlans.$inferSelect;

// MEAL PLAN ITEMS
export const mealPlanItems = pgTable("meal_plan_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealPlanId: uuid("meal_plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  mealType: mealTypeEnum("meal_type").notNull(),
  recipeId: uuid("recipe_id").references(() => recipes.id),
  titleOverride: text("title_override"),
  servings: integer("servings"),
  notes: text("notes"),
  ingredients: jsonb("ingredients").$type<Array<{ name: string; quantity?: string; unit?: string }>>(),
}, (table) => [
  index("meal_plan_items_plan_date_idx").on(table.mealPlanId, table.date),
]);

export type MealPlanItem = typeof mealPlanItems.$inferSelect;

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  name: true,
  passwordHash: true,
});

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
export const purchasePlatformEnum = pgEnum("purchase_platform", ["google", "apple", "revenuecat"]);
export const entitlementStatusEnum = pgEnum("entitlement_status", ["active", "expired", "canceled", "pending"]);
export const billCategoryEnum = pgEnum("bill_category", ["luce", "gas", "acqua", "telefono", "scuola", "assicurazione", "tasse", "altro"]);
// Stato MEMORIZZATO della bolletta. "scaduta" NON è qui: si calcola a runtime
// (dueDate passata e bolletta non pagata) — vedi server/lib/bills.ts.
export const billStatusEnum = pgEnum("bill_status", ["da_pagare", "pagata"]);
export const billSplitTypeEnum = pgEnum("bill_split_type", ["equal", "custom"]);
export const billAttachmentKindEnum = pgEnum("bill_attachment_kind", ["document", "receipt"]);

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
  deletedAt: timestamp("deleted_at"),
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
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  invitedName: varchar("invited_name", { length: 255 }),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
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

// AI USAGE — tracciamento uso funzioni AI per quota giornaliera per famiglia
// Stato di un tentativo AI:
// - "started": record creato PRIMA della chiamata OpenAI (prenotazione slot quota)
// - "succeeded": OpenAI ha risposto correttamente
// - "failed": OpenAI ha fallito (errore provider/timeout/JSON malformato/Zod)
// Ai fini della quota giornaliera contano TUTTI gli stati: ogni tentativo che
// raggiunge OpenAI consuma token, quindi consuma quota anche se fallisce.
export const aiUsageStatusEnum = pgEnum("ai_usage_status", ["started", "succeeded", "failed"]);

export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  feature: varchar("feature", { length: 64 }).notNull(),
  status: aiUsageStatusEnum("status").notNull().default("started"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ai_usage_family_feature_created_idx").on(table.familyId, table.feature, table.createdAt),
]);

export type AiUsage = typeof aiUsage.$inferSelect;

// CHAT MESSAGES
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "file"]);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageType: messageTypeEnum("message_type").notNull().default("text"),
  content: text("content"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileMimeType: varchar("file_mime_type", { length: 100 }),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_messages_family_idx").on(table.familyId, table.createdAt),
  index("chat_messages_user_idx").on(table.userId),
]);

export type ChatMessage = typeof chatMessages.$inferSelect;

// PUSH TOKENS
export const pushTokens = pgTable("push_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: varchar("platform", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("push_tokens_user_idx").on(table.userId),
]);

export type PushToken = typeof pushTokens.$inferSelect;

// ENTITLEMENTS — Premium acquistato tramite store nativi (Google Play / Apple).
// Premium è UNICO per famiglia: una sola riga per familyId (unique).
// La verifica server-side aggiorna status/expiresAt; isPremium(familyId) legge qui.
// Stripe NON scrive in questa tabella: il premium mobile dipende solo dagli store.
export const entitlements = pgTable("entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  platform: purchasePlatformEnum("platform").notNull(),
  productId: varchar("product_id", { length: 255 }).notNull(),
  status: entitlementStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at"),
  // Google Play: token di acquisto restituito dal client.
  purchaseToken: text("purchase_token"),
  // Apple: id transazione originale (stabile per l'abbonamento) e ultima transazione.
  originalTransactionId: varchar("original_transaction_id", { length: 255 }),
  transactionId: varchar("transaction_id", { length: 255 }),
  // Ricevuta/token grezzi per ri-verifica e ripristino acquisti.
  latestReceipt: text("latest_receipt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("entitlements_family_unique").on(table.familyId),
  index("entitlements_status_idx").on(table.status, table.expiresAt),
]);

export type Entitlement = typeof entitlements.$inferSelect;

// BILLS — Bollette & Scadenze. Gestione/promemoria/archiviazione/ripartizione.
// NESSUN pagamento reale: nessun dato bancario (carta/CVV/IBAN) viene salvato.
export const bills = pgTable("bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 255 }),
  category: billCategoryEnum("category").notNull().default("altro"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  // Intestatario (testo libero, es. nome sulla bolletta).
  holder: varchar("holder", { length: 255 }),
  // Assegnazione a un membro della famiglia (responsabile).
  assignedTo: uuid("assigned_to").references(() => familyMembers.id, { onDelete: "set null" }),
  notes: text("notes"),
  status: billStatusEnum("status").notNull().default("da_pagare"),
  // Ripartizione: tipo scelto (null = nessuna ripartizione). Le quote in bill_splits.
  splitType: billSplitTypeEnum("split_type"),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  paidAt: timestamp("paid_at"),
  paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("bills_family_status_idx").on(table.familyId, table.status, table.dueDate),
]);

export type Bill = typeof bills.$inferSelect;

// BILL SPLITS — ripartizione importo tra membri (uguale o personalizzata).
export const billSplits = pgTable("bill_splits", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => familyMembers.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("bill_splits_bill_member_unique").on(table.billId, table.memberId),
  index("bill_splits_bill_idx").on(table.billId),
]);

export type BillSplit = typeof billSplits.$inferSelect;

// BILL ATTACHMENTS — allegati (documento bolletta) e ricevute (dopo pagamento).
// Stesso sistema sicuro upload/media token usato dalla chat.
export const billAttachments = pgTable("bill_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  kind: billAttachmentKindEnum("kind").notNull().default("document"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  fileMimeType: varchar("file_mime_type", { length: 100 }),
  fileSize: integer("file_size"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("bill_attachments_bill_idx").on(table.billId),
]);

export type BillAttachment = typeof billAttachments.$inferSelect;

// BILL PAYMENT HISTORY — storico pagamenti (chi/quando/quanto). Solo tracciamento.
export const billPaymentHistory = pgTable("bill_payment_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => familyMembers.id, { onDelete: "set null" }),
  paidByUserId: uuid("paid_by_user_id").references(() => users.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  note: text("note"),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("bill_payment_history_bill_idx").on(table.billId),
  index("bill_payment_history_family_idx").on(table.familyId, table.paidAt),
]);

export type BillPaymentHistory = typeof billPaymentHistory.$inferSelect;

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  name: true,
  passwordHash: true,
});

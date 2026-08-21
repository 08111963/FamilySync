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
  check,
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
  // Nullable: gli account creati con login social (Google/Apple) non hanno password
  passwordHash: varchar("password_hash", { length: 255 }),
  // 'google' | 'apple' | null (email+password)
  authProvider: varchar("auth_provider", { length: 20 }),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  aiFeaturesEnabled: boolean("ai_features_enabled").default(false).notNull(),
  // Fascia d'età dichiarata in registrazione: 'under14' | '14_17' | 'adult'.
  // NULL per gli account creati prima dell'introduzione (trattati come adulti,
  // vedi Privacy Policy). Nessuna data di nascita completa: minimizzazione.
  ageBand: varchar("age_band", { length: 10 }),
  // Consenso storico per funzioni legacy che possono trattare dati sanitari.
  // Il Piano Pasti usa ora solo profili dieta chiusi e non legge allergie.
  aiHealthConsent: boolean("ai_health_consent").default(false).notNull(),
  // Versione della Privacy Policy di cui l'utente ha dichiarato presa visione
  // (informativa, NON consenso contrattuale). NULL = mai registrata.
  privacyPolicySeenVersion: varchar("privacy_policy_seen_version", { length: 20 }),
  deletedAt: timestamp("deleted_at"),
  // Versione dei token di sessione: viene incrementata a ogni cambio/reset
  // password per invalidare TUTTI i refresh token emessi prima (revoca).
  tokenVersion: integer("token_version").default(0).notNull(),
  // Account "dispositivo bambino": creato attivando un codice di accesso
  // generato dal genitore (nessuna email reale, email sintetica non recapitabile).
  // Gli endpoint vietati ai bambini (bollette, budget, ecc.) rifiutano questi
  // account lato server (fail-closed), vedi middleware blockChildAccount.
  isChildAccount: boolean("is_child_account").default(false).notNull(),
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
  icsFeedToken: varchar("ics_feed_token", { length: 64 }).unique(),
  inviteCode: varchar("invite_code", { length: 64 }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Family = typeof families.$inferSelect;

// FAMILY MEMBERS
export const familyMembers = pgTable("family_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  // NULL per i "profili bambino" gestiti dai genitori: membri senza account/email.
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  nickname: varchar("nickname", { length: 100 }),
  // Nome visualizzato per i profili SENZA account (userId NULL); per i membri
  // con account il nome resta quello di users.name.
  name: varchar("name", { length: 100 }),
  color: varchar("color", { length: 7 }).notNull(),
  points: integer("points").default(0),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  unique("family_members_family_user_unique").on(table.familyId, table.userId),
]);

export type FamilyMember = typeof familyMembers.$inferSelect;

// FAMILY INVITES
export const familyInvites = pgTable("family_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  invitedName: varchar("invited_name", { length: 255 }),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  // Invito di "promozione": se valorizzato, l'accettazione COLLEGA l'account al
  // familyMembers esistente (profilo bambino, userId NULL) invece di crearne uno
  // nuovo. Punti e storico del profilo vengono preservati.
  memberId: uuid("member_id").references(() => familyMembers.id, { onDelete: "cascade" }),
  acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
  role: roleEnum("role").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FamilyInvite = typeof familyInvites.$inferSelect;

// CHILD ACCESS CODES — codici di accesso "dispositivo bambino".
// Il genitore (admin/adult) genera un codice per un profilo bambino gestito
// (familyMembers.userId NULL); il bambino lo inserisce sul suo dispositivo ed
// entra senza email/password. Solo l'HASH del codice è salvato (pattern invito
// sicuro), consumo monouso in transazione, scadenza breve, revocabile.
export const childAccessCodes = pgTable("child_access_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => familyMembers.id, { onDelete: "cascade" }),
  codeHash: varchar("code_hash", { length: 255 }).notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChildAccessCode = typeof childAccessCodes.$inferSelect;

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
  // Identificatore condiviso dalle occorrenze materializzate della stessa serie
  // ricorrente: permette di eliminare "tutta la serie" senza ambiguità.
  seriesId: uuid("series_id"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Integrità orari: NULL oppure "HH:MM" (migrazione 0026).
  check("calendar_events_time_format_check", sql`${table.time} IS NULL OR ${table.time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  check("calendar_events_end_time_format_check", sql`${table.endTime} IS NULL OR ${table.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
]);

export type CalendarEvent = typeof calendarEvents.$inferSelect;

// GOOGLE CALENDAR SYNC — collegamento personale (per utente) al Google
// Calendar via OAuth: il refresh token è CIFRATO lato server (AES-256-GCM,
// chiave derivata da SESSION_SECRET). status='expired' quando il token viene
// revocato/scade: fail-visibile, l'app chiede di ricollegare.
export const googleCalendarConnections = pgTable("google_calendar_connections", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  googleEmail: varchar("google_email", { length: 255 }),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' | 'expired'
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GoogleCalendarConnection = typeof googleCalendarConnections.$inferSelect;

// Mapping evento FamilySync → evento Google Calendar (per utente collegato).
export const googleCalendarEventLinks = pgTable("google_calendar_event_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
  googleEventId: varchar("google_event_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("gcal_event_links_user_event_unique").on(table.userId, table.eventId),
  index("gcal_event_links_event_idx").on(table.eventId),
]);

export type GoogleCalendarEventLink = typeof googleCalendarEventLinks.$inferSelect;

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
  // Orario facoltativo della scadenza ("HH:MM"): se presente, l'evento
  // calendario collegato ha quell'orario (e quindi anche il promemoria
  // Google Calendar 1 ora prima). Ha senso solo insieme a dueDate.
  dueTime: varchar("due_time", { length: 5 }),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  recurrenceRule: text("recurrence_rule"),
  // Evento calendario collegato (per faccende con scadenza): la faccenda
  // compare nel calendario dell'app e nel feed ICS come le bollette.
  calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  check("chores_due_time_format_check", sql`${table.dueTime} IS NULL OR ${table.dueTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  check("chores_due_time_requires_date_check", sql`${table.dueTime} IS NULL OR ${table.dueDate} IS NOT NULL`),
]);

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
  imageUrl: text("image_url"),
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
  preferences: jsonb("preferences").$type<{ dietProfile?: import("./meal-plan-diet-profiles").MealPlanDietProfile; notes?: string; maxTimeMinutes?: number; mealsPerDay?: number }>(),
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

// RECIPE GEN SESSIONS — sessioni della generazione incrementale delle ricette.
// Persistite su DB (non in-memory) così il polling del client sopravvive a
// riavvii del backend e funziona anche con più istanze in produzione.
// updatedAt fa da heartbeat: se una sessione non-done non viene aggiornata da
// troppo tempo, la generazione è stata interrotta (es. riavvio a metà).
export const recipeGenSessions = pgTable("recipe_gen_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  recipes: jsonb("recipes").$type<unknown[]>().default(sql`'[]'::jsonb`).notNull(),
  done: boolean("done").default(false).notNull(),
  errorStatus: integer("error_status"),
  errorBody: jsonb("error_body"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recipe_gen_sessions_created_idx").on(table.createdAt),
]);

export type RecipeGenSession = typeof recipeGenSessions.$inferSelect;

// REWARDS (premi riscattabili con i punti delle faccende)
export const rewards = pgTable("rewards", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  pointsCost: integer("points_cost").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Reward = typeof rewards.$inferSelect;

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  rewardId: uuid("reward_id").notNull().references(() => rewards.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => familyMembers.id, { onDelete: "cascade" }),
  // Snapshot del titolo: la cronologia resta leggibile anche se il premio cambia.
  rewardTitle: varchar("reward_title", { length: 200 }).notNull(),
  pointsSpent: integer("points_spent").notNull(),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
}, (table) => [
  index("reward_redemptions_family_redeemed_idx").on(table.familyId, table.redeemedAt),
]);

export type RewardRedemption = typeof rewardRedemptions.$inferSelect;

// PANTRY (dispensa/inventario di casa)
export const pantryItems = pgTable("pantry_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  // Nome normalizzato per dedup (ricalcolato lato server, non fidarsi del client).
  normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
  quantity: numeric("quantity"),
  unit: varchar("unit", { length: 10 }),
  category: varchar("category", { length: 50 }).default("food").notNull(),
  expiryDate: date("expiry_date"),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("pantry_items_family_idx").on(table.familyId, table.normalizedName),
]);

export type PantryItem = typeof pantryItems.$inferSelect;

// EXPENSES — spese quotidiane della famiglia, per categoria (budget familiare).
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => familyMembers.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  description: varchar("description", { length: 255 }),
  date: date("date").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("expenses_family_date_idx").on(table.familyId, table.date),
]);

export type Expense = typeof expenses.$inferSelect;

// FAMILY BUDGETS — tetto di spesa mensile (category 'total' = complessivo,
// altrimenti tetto per singola categoria).
export const familyBudgets = pgTable("family_budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 30 }).notNull().default("total"),
  monthlyLimit: numeric("monthly_limit", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("family_budgets_family_category_uq").on(table.familyId, table.category),
]);

export type FamilyBudget = typeof familyBudgets.$inferSelect;

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

// WEB PUSH SUBSCRIPTIONS — notifiche push per la web app (PWA) via VAPID.
// L'endpoint identifica univocamente il browser/dispositivo.
export const webPushSubscriptions = pgTable("web_push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("web_push_subs_user_idx").on(table.userId),
]);

export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect;

// BILL REMINDER LOG — deduplica dei promemoria bollette inviati dal server
// (email + push). Una riga per (bolletta, tipo promemoria).
export const billReminderLog = pgTable("bill_reminder_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 20 }).notNull(), // 'due_tomorrow' | 'due_today'
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  unique("bill_reminder_log_unique").on(table.billId, table.kind),
]);

// EVENT REMINDER LOG — deduplica dei promemoria eventi calendario inviati dal
// server (email + push). Una riga per (evento, tipo promemoria).
export const eventReminderLog = pgTable("event_reminder_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 20 }).notNull(), // 'event_tomorrow' | 'event_today'
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  unique("event_reminder_log_unique").on(table.eventId, table.kind),
]);

// SCHEDULED JOB RUNS — schedulazione durevole per job periodici lato server.
// Su deployment autoscale l'istanza non resta viva per giorni: il "quando è
// partito l'ultimo run" deve vivere nel DB, non in un setInterval in-process.
// Il claim è atomico (INSERT ... ON CONFLICT DO UPDATE ... WHERE): una sola
// istanza alla volta può aggiudicarsi il run del periodo corrente.
export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  jobName: varchar("job_name", { length: 64 }).primaryKey(),
  lastRunAt: timestamp("last_run_at").defaultNow().notNull(),
});

// CLIENT CRASH REPORTS — finestra scorrevole PERSISTITA dei report CLIENT_CRASH
// (endpoint pubblico /api/client-errors). In-memory non basta: su autoscale un
// riavvio azzererebbe il conteggio e più istanze conterebbero separatamente,
// quindi la soglia dell'alert email potrebbe non scattare. I campi sono già
// sanificati (sanitizeCrashSample) PRIMA dell'insert: mai token/segreti su DB.
// Le righe fuori finestra vengono potate ad ogni report.
export const clientCrashReports = pgTable("client_crash_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  message: varchar("message", { length: 1000 }).notNull(),
  url: varchar("url", { length: 500 }),
  userAgent: varchar("user_agent", { length: 500 }),
  platform: varchar("platform", { length: 50 }),
  at: timestamp("at").defaultNow().notNull(),
}, (table) => [
  index("client_crash_reports_at_idx").on(table.at),
]);

// MEAL PLAN LATENCY ALERT STATE — stato operativo condiviso, senza contenuti
// utente. Mantiene i contatori consecutivi e il ciclo aperto/risolto nel DB,
// così più istanze autoscale non inviano notifiche duplicate dopo un riavvio.
export const mealPlanLatencyAlertState = pgTable("meal_plan_latency_alert_state", {
  mode: varchar("mode", { length: 16 }).primaryKey(),
  consecutiveOverDurationBudget: integer("consecutive_over_duration_budget").default(0).notNull(),
  consecutiveOverModelCallBudget: integer("consecutive_over_model_call_budget").default(0).notNull(),
  episodeActive: boolean("episode_active").default(false).notNull(),
  notificationDelivered: boolean("notification_delivered").default(false).notNull(),
  notificationClaimId: varchar("notification_claim_id", { length: 36 }),
  notificationClaimedAt: timestamp("notification_claimed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  // Prova gratuita (account tester): numero di giorni di accesso Premium a
  // partire dal PRIMO login. Se valorizzato, l'entitlement è una prova: nasce
  // "pending" e viene attivata al primo accesso (status=active, expiresAt=now+N).
  // NULL per gli entitlement normali (acquisti reali via store).
  trialDays: integer("trial_days"),
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
  // Evento calendario collegato (scadenza sincronizzata con calendario/feed ICS).
  calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, { onDelete: "set null" }),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  // Date promemoria PERSONALIZZATE scelte dall'utente (ISO "AAAA-MM-GG"), oltre
  // agli offset automatici. La notifica locale viene programmata alle 08:00.
  customReminderDates: jsonb("custom_reminder_dates").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
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

// TEST ANALYTICS EVENTS — analytics interna TEMPORANEA per il periodo di test.
// Attiva solo con ENABLE_TEST_ANALYTICS=true. Niente contenuti personali:
// solo nome evento, schermata, piattaforma, versione app e metadata minimale.
// Retention: massimo 30 giorni (pulizia automatica lato server).
export const testAnalyticsEvents = pgTable("test_analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventName: varchar("event_name", { length: 50 }).notNull(),
  userId: uuid("user_id"),
  familyId: uuid("family_id"),
  platform: varchar("platform", { length: 10 }),
  appVersion: varchar("app_version", { length: 20 }),
  screen: varchar("screen", { length: 100 }),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>().notNull().default(sql`'{}'::jsonb`),
  isDemoAccount: boolean("is_demo_account").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("test_analytics_created_idx").on(table.createdAt),
  index("test_analytics_event_idx").on(table.eventName),
  index("test_analytics_user_idx").on(table.userId),
  index("test_analytics_platform_idx").on(table.platform),
]);

export type TestAnalyticsEvent = typeof testAnalyticsEvents.$inferSelect;

// CONSENT RECORDS — registro append-only dei consensi/accettazioni (GDPR).
// Una riga per ogni variazione: grant (granted=true, grantedAt valorizzato)
// o revoca (granted=false, revokedAt valorizzato). Non si aggiorna mai una
// riga esistente: la storia completa resta consultabile.
export const consentTypeEnum = pgEnum("consent_type", ["terms", "ai_features", "ai_health"]);

export const consentRecords = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consentType: consentTypeEnum("consent_type").notNull(),
  granted: boolean("granted").notNull(),
  policyVersion: varchar("policy_version", { length: 20 }).notNull(),
  grantedAt: timestamp("granted_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("consent_records_user_idx").on(table.userId, table.consentType, table.createdAt),
]);

export type ConsentRecord = typeof consentRecords.$inferSelect;

// SOCIAL SIGNUP PENDING (GDPR): un nuovo utente Google/Apple NON viene creato
// subito. Il profilo verificato dal provider resta qui in attesa che l'utente
// completi la registrazione (nome, fascia d'età, presa visione privacy,
// accettazione Termini, consensi). Token monouso, hash-only, scadenza breve.
export const socialSignupTokens = pgTable("social_signup_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  provider: varchar("provider", { length: 20 }).notNull(), // 'google' | 'apple'
  email: varchar("email", { length: 255 }).notNull(),
  suggestedName: varchar("suggested_name", { length: 100 }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SocialSignupToken = typeof socialSignupTokens.$inferSelect;

// CODICI OAUTH CONSUMATI — registro CONDIVISO (DB) dei loginCode monouso già
// usati. Su autoscale girano più istanze: una mappa in-memory non basta a
// impedire il replay di un codice su un'istanza diversa. L'inserimento è
// atomico (ON CONFLICT DO NOTHING): se la riga esiste già, il codice è
// già stato consumato e va rifiutato.
export const consumedOauthCodes = pgTable("consumed_oauth_codes", {
  jti: varchar("jti", { length: 64 }).primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
});

// RISULTATI CALLBACK OAUTH — alcuni browser mobile (Chrome Android, browser
// in-app) richiamano il callback Google DUE volte con lo stesso authorization
// code: il secondo scambio con Google fallisce con invalid_grant e l'utente
// vede un errore. Registriamo su DB (condiviso tra istanze) il redirect
// prodotto dal primo scambio, così la richiesta duplicata viene reindirizzata
// allo stesso risultato invece di fallire. TTL breve (2 minuti).
export const oauthCallbackResults = pgTable("oauth_callback_results", {
  codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
  redirectUrl: text("redirect_url").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// FEEDBACK TESTER — modulo interno "Dacci il tuo parere" (fase di test):
// bug, suggerimenti e valutazione a stelle. Consultabile solo dal
// proprietario dell'app (APP_OWNER_EMAILS).
export const feedbackEntries = pgTable("feedback_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 20 }).notNull(), // 'bug' | 'suggestion' | 'other'
  rating: integer("rating"), // 1-5, facoltativa
  message: text("message").notNull(),
  platform: varchar("platform", { length: 10 }),
  appVersion: varchar("app_version", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("feedback_entries_created_idx").on(table.createdAt),
  index("feedback_entries_user_idx").on(table.userId),
]);

export type FeedbackEntry = typeof feedbackEntries.$inferSelect;

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  name: true,
  passwordHash: true,
});

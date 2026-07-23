var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/lib/jwt.ts
import jwt from "jsonwebtoken";
import crypto from "crypto";
function deriveFromSessionSecret(purpose) {
  const base = process.env.SESSION_SECRET;
  if (base && base.length > 0) {
    return crypto.createHash("sha256").update(`${base}:${purpose}`).digest("hex");
  }
  return void 0;
}
function resolveSecret(name, purpose, devFallback) {
  const value = process.env[name];
  if (value && value.length > 0) {
    return value;
  }
  const derived = deriveFromSessionSecret(purpose);
  if (derived) {
    return derived;
  }
  if (isProduction) {
    throw new Error(
      `[FATAL] La variabile d'ambiente ${name} (o in alternativa SESSION_SECRET) \xE8 obbligatoria in produzione e non \xE8 impostata. Configurala prima di avviare il server.`
    );
  }
  return devFallback;
}
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
}
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
}
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error("Invalid token");
  }
}
function generateMediaToken(userId, opts) {
  const payload = { userId, scope: "media" };
  if (opts?.familyId) {
    payload.familyId = opts.familyId;
  }
  if (opts?.filePath) {
    payload.filePath = opts.filePath;
  }
  return jwt.sign(payload, JWT_MEDIA_SECRET, { expiresIn: "5m" });
}
function verifyMediaToken(token) {
  const decoded = jwt.verify(token, JWT_MEDIA_SECRET);
  if (decoded.scope !== "media") {
    throw new Error("Invalid media token scope");
  }
  return decoded;
}
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch {
    throw new Error("Invalid refresh token");
  }
}
var isProduction, JWT_SECRET, JWT_REFRESH_SECRET, JWT_MEDIA_SECRET;
var init_jwt = __esm({
  "server/lib/jwt.ts"() {
    "use strict";
    isProduction = process.env.NODE_ENV === "production";
    JWT_SECRET = resolveSecret("JWT_SECRET", "access", "dev-secret-change-me");
    JWT_REFRESH_SECRET = resolveSecret("JWT_REFRESH_SECRET", "refresh", "dev-refresh-secret");
    JWT_MEDIA_SECRET = resolveSecret("JWT_MEDIA_SECRET", "media", "dev-media-secret-change-me");
  }
});

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  aiInsights: () => aiInsights,
  aiUsage: () => aiUsage,
  aiUsageStatusEnum: () => aiUsageStatusEnum,
  billAttachmentKindEnum: () => billAttachmentKindEnum,
  billAttachments: () => billAttachments,
  billCategoryEnum: () => billCategoryEnum,
  billPaymentHistory: () => billPaymentHistory,
  billSplitTypeEnum: () => billSplitTypeEnum,
  billSplits: () => billSplits,
  billStatusEnum: () => billStatusEnum,
  bills: () => bills,
  blocks: () => blocks,
  calendarEvents: () => calendarEvents,
  chatMessages: () => chatMessages,
  chores: () => chores,
  emailVerificationTokens: () => emailVerificationTokens,
  entitlementStatusEnum: () => entitlementStatusEnum,
  entitlements: () => entitlements,
  eventCategoryEnum: () => eventCategoryEnum,
  expenses: () => expenses,
  families: () => families,
  familyBudgets: () => familyBudgets,
  familyInvites: () => familyInvites,
  familyMembers: () => familyMembers,
  ingredientUnitEnum: () => ingredientUnitEnum,
  insertUserSchema: () => insertUserSchema,
  mealPlanItems: () => mealPlanItems,
  mealPlans: () => mealPlans,
  mealTypeEnum: () => mealTypeEnum,
  messageTypeEnum: () => messageTypeEnum,
  pantryItems: () => pantryItems,
  passwordResetTokens: () => passwordResetTokens,
  purchasePlatformEnum: () => purchasePlatformEnum,
  pushTokens: () => pushTokens,
  recipeIngredients: () => recipeIngredients,
  recipeSourceEnum: () => recipeSourceEnum,
  recipes: () => recipes,
  reportReasonEnum: () => reportReasonEnum,
  reportStatusEnum: () => reportStatusEnum,
  reportTargetTypeEnum: () => reportTargetTypeEnum,
  reports: () => reports,
  rewardRedemptions: () => rewardRedemptions,
  rewards: () => rewards,
  roleEnum: () => roleEnum,
  shoppingHistory: () => shoppingHistory,
  shoppingItems: () => shoppingItems,
  shoppingLists: () => shoppingLists,
  subscriptionStatusEnum: () => subscriptionStatusEnum,
  testAnalyticsEvents: () => testAnalyticsEvents,
  users: () => users
});
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
  date
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var roleEnum, subscriptionStatusEnum, eventCategoryEnum, reportTargetTypeEnum, reportReasonEnum, reportStatusEnum, mealTypeEnum, recipeSourceEnum, ingredientUnitEnum, purchasePlatformEnum, entitlementStatusEnum, billCategoryEnum, billStatusEnum, billSplitTypeEnum, billAttachmentKindEnum, users, families, familyMembers, familyInvites, calendarEvents, shoppingLists, shoppingItems, shoppingHistory, chores, aiInsights, emailVerificationTokens, passwordResetTokens, reports, blocks, recipes, recipeIngredients, mealPlans, mealPlanItems, aiUsageStatusEnum, aiUsage, rewards, rewardRedemptions, pantryItems, expenses, familyBudgets, messageTypeEnum, chatMessages, pushTokens, entitlements, bills, billSplits, billAttachments, billPaymentHistory, testAnalyticsEvents, insertUserSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    roleEnum = pgEnum("role", ["admin", "adult", "teen", "child"]);
    subscriptionStatusEnum = pgEnum("subscription_status", ["free", "premium", "canceled"]);
    eventCategoryEnum = pgEnum("event_category", ["work", "school", "sport", "health", "social", "family", "other"]);
    reportTargetTypeEnum = pgEnum("report_target_type", ["calendar_event", "shopping_item", "chore", "user"]);
    reportReasonEnum = pgEnum("report_reason", ["spam", "harassment", "hate", "sexual", "violence", "other"]);
    reportStatusEnum = pgEnum("report_status", ["open", "actioned", "dismissed"]);
    mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"]);
    recipeSourceEnum = pgEnum("recipe_source", ["ai", "manual"]);
    ingredientUnitEnum = pgEnum("ingredient_unit", ["g", "kg", "ml", "l", "pcs", "tbsp", "tsp", "cup", "pinch", "to_taste"]);
    purchasePlatformEnum = pgEnum("purchase_platform", ["google", "apple", "revenuecat"]);
    entitlementStatusEnum = pgEnum("entitlement_status", ["active", "expired", "canceled", "pending"]);
    billCategoryEnum = pgEnum("bill_category", ["luce", "gas", "acqua", "telefono", "scuola", "assicurazione", "tasse", "altro"]);
    billStatusEnum = pgEnum("bill_status", ["da_pagare", "pagata"]);
    billSplitTypeEnum = pgEnum("bill_split_type", ["equal", "custom"]);
    billAttachmentKindEnum = pgEnum("bill_attachment_kind", ["document", "receipt"]);
    users = pgTable("users", {
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
      aiFeaturesEnabled: boolean("ai_features_enabled").default(true).notNull(),
      deletedAt: timestamp("deleted_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    families = pgTable("families", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    familyMembers = pgTable("family_members", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      role: roleEnum("role").notNull(),
      nickname: varchar("nickname", { length: 100 }),
      color: varchar("color", { length: 7 }).notNull(),
      points: integer("points").default(0),
      joinedAt: timestamp("joined_at").defaultNow().notNull()
    }, (table) => [
      unique("family_members_family_user_unique").on(table.familyId, table.userId)
    ]);
    familyInvites = pgTable("family_invites", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    calendarEvents = pgTable("calendar_events", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    shoppingLists = pgTable("shopping_lists", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      name: varchar("name", { length: 255 }).notNull(),
      icon: varchar("icon", { length: 50 }),
      createdBy: uuid("created_by").notNull().references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    shoppingItems = pgTable("shopping_items", {
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
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    shoppingHistory = pgTable("shopping_history", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      itemName: varchar("item_name", { length: 255 }).notNull(),
      quantity: varchar("quantity", { length: 50 }),
      category: varchar("category", { length: 50 }),
      purchasedAt: timestamp("purchased_at").defaultNow().notNull()
    });
    chores = pgTable("chores", {
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
      // Evento calendario collegato (per faccende con scadenza): la faccenda
      // compare nel calendario dell'app e nel feed ICS come le bollette.
      calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, { onDelete: "set null" }),
      createdBy: uuid("created_by").references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    aiInsights = pgTable("ai_insights", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      type: varchar("type", { length: 50 }).notNull(),
      title: varchar("title", { length: 255 }).notNull(),
      description: text("description").notNull(),
      actionData: jsonb("action_data"),
      dismissed: boolean("dismissed").default(false),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    emailVerificationTokens = pgTable("email_verification_tokens", {
      id: uuid("id").primaryKey().defaultRandom(),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      token: varchar("token", { length: 255 }).notNull().unique(),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    passwordResetTokens = pgTable("password_reset_tokens", {
      id: uuid("id").primaryKey().defaultRandom(),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      token: varchar("token", { length: 255 }).notNull().unique(),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    reports = pgTable("reports", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id),
      targetType: reportTargetTypeEnum("target_type").notNull(),
      targetId: uuid("target_id").notNull(),
      reasonCategory: reportReasonEnum("reason_category").notNull(),
      reasonText: text("reason_text"),
      status: reportStatusEnum("status").default("open").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      index("reports_family_status_idx").on(table.familyId, table.status, table.createdAt),
      index("reports_target_idx").on(table.targetType, table.targetId)
    ]);
    blocks = pgTable("blocks", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      blockerUserId: uuid("blocker_user_id").notNull().references(() => users.id),
      blockedUserId: uuid("blocked_user_id").notNull().references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      unique("blocks_unique").on(table.familyId, table.blockerUserId, table.blockedUserId)
    ]);
    recipes = pgTable("recipes", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
      source: recipeSourceEnum("source").notNull().default("ai"),
      title: text("title").notNull(),
      description: text("description"),
      servings: integer("servings"),
      prepTimeMinutes: integer("prep_time_minutes"),
      cookTimeMinutes: integer("cook_time_minutes"),
      steps: jsonb("steps").notNull().$type(),
      tags: jsonb("tags").$type(),
      imageUrl: text("image_url"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    recipeIngredients = pgTable("recipe_ingredients", {
      id: uuid("id").primaryKey().defaultRandom(),
      recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      quantity: numeric("quantity"),
      unit: ingredientUnitEnum("unit"),
      notes: text("notes"),
      category: varchar("category", { length: 50 }),
      normalizedName: text("normalized_name").notNull()
    }, (table) => [
      index("recipe_ingredients_recipe_idx").on(table.recipeId),
      index("recipe_ingredients_norm_idx").on(table.normalizedName)
    ]);
    mealPlans = pgTable("meal_plans", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
      weekStartDate: date("week_start_date").notNull(),
      title: text("title"),
      preferences: jsonb("preferences").$type(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      unique("meal_plans_family_week").on(table.familyId, table.weekStartDate)
    ]);
    mealPlanItems = pgTable("meal_plan_items", {
      id: uuid("id").primaryKey().defaultRandom(),
      mealPlanId: uuid("meal_plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
      date: date("date").notNull(),
      mealType: mealTypeEnum("meal_type").notNull(),
      recipeId: uuid("recipe_id").references(() => recipes.id),
      titleOverride: text("title_override"),
      servings: integer("servings"),
      notes: text("notes"),
      ingredients: jsonb("ingredients").$type()
    }, (table) => [
      index("meal_plan_items_plan_date_idx").on(table.mealPlanId, table.date)
    ]);
    aiUsageStatusEnum = pgEnum("ai_usage_status", ["started", "succeeded", "failed"]);
    aiUsage = pgTable("ai_usage", {
      id: uuid("id").primaryKey().defaultRandom(),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      feature: varchar("feature", { length: 64 }).notNull(),
      status: aiUsageStatusEnum("status").notNull().default("started"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      index("ai_usage_family_feature_created_idx").on(table.familyId, table.feature, table.createdAt)
    ]);
    rewards = pgTable("rewards", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      title: varchar("title", { length: 200 }).notNull(),
      description: text("description"),
      pointsCost: integer("points_cost").notNull(),
      isActive: boolean("is_active").default(true).notNull(),
      createdBy: uuid("created_by").notNull().references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    rewardRedemptions = pgTable("reward_redemptions", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      rewardId: uuid("reward_id").notNull().references(() => rewards.id, { onDelete: "cascade" }),
      memberId: uuid("member_id").notNull().references(() => familyMembers.id, { onDelete: "cascade" }),
      // Snapshot del titolo: la cronologia resta leggibile anche se il premio cambia.
      rewardTitle: varchar("reward_title", { length: 200 }).notNull(),
      pointsSpent: integer("points_spent").notNull(),
      redeemedAt: timestamp("redeemed_at").defaultNow().notNull()
    }, (table) => [
      index("reward_redemptions_family_redeemed_idx").on(table.familyId, table.redeemedAt)
    ]);
    pantryItems = pgTable("pantry_items", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      index("pantry_items_family_idx").on(table.familyId, table.normalizedName)
    ]);
    expenses = pgTable("expenses", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      memberId: uuid("member_id").references(() => familyMembers.id, { onDelete: "set null" }),
      amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
      category: varchar("category", { length: 30 }).notNull(),
      description: varchar("description", { length: 255 }),
      date: date("date").notNull(),
      createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      index("expenses_family_date_idx").on(table.familyId, table.date)
    ]);
    familyBudgets = pgTable("family_budgets", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      category: varchar("category", { length: 30 }).notNull().default("total"),
      monthlyLimit: numeric("monthly_limit", { precision: 10, scale: 2 }).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      unique("family_budgets_family_category_uq").on(table.familyId, table.category)
    ]);
    messageTypeEnum = pgEnum("message_type", ["text", "image", "file"]);
    chatMessages = pgTable("chat_messages", {
      id: uuid("id").primaryKey().defaultRandom(),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      messageType: messageTypeEnum("message_type").notNull().default("text"),
      content: text("content"),
      fileUrl: text("file_url"),
      fileName: text("file_name"),
      fileMimeType: varchar("file_mime_type", { length: 100 }),
      fileSize: integer("file_size"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("chat_messages_family_idx").on(table.familyId, table.createdAt),
      index("chat_messages_user_idx").on(table.userId)
    ]);
    pushTokens = pgTable("push_tokens", {
      id: uuid("id").primaryKey().defaultRandom(),
      userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      token: text("token").notNull().unique(),
      platform: varchar("platform", { length: 20 }),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      index("push_tokens_user_idx").on(table.userId)
    ]);
    entitlements = pgTable("entitlements", {
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
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      unique("entitlements_family_unique").on(table.familyId),
      index("entitlements_status_idx").on(table.status, table.expiresAt)
    ]);
    bills = pgTable("bills", {
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
      customReminderDates: jsonb("custom_reminder_dates").$type().notNull().default(sql`'[]'::jsonb`),
      paidAt: timestamp("paid_at"),
      paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
      createdBy: uuid("created_by").references(() => users.id),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      index("bills_family_status_idx").on(table.familyId, table.status, table.dueDate)
    ]);
    billSplits = pgTable("bill_splits", {
      id: uuid("id").primaryKey().defaultRandom(),
      billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
      memberId: uuid("member_id").notNull().references(() => familyMembers.id, { onDelete: "cascade" }),
      amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
      isPaid: boolean("is_paid").notNull().default(false),
      paidAt: timestamp("paid_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      unique("bill_splits_bill_member_unique").on(table.billId, table.memberId),
      index("bill_splits_bill_idx").on(table.billId)
    ]);
    billAttachments = pgTable("bill_attachments", {
      id: uuid("id").primaryKey().defaultRandom(),
      billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      kind: billAttachmentKindEnum("kind").notNull().default("document"),
      fileUrl: text("file_url").notNull(),
      fileName: text("file_name"),
      fileMimeType: varchar("file_mime_type", { length: 100 }),
      fileSize: integer("file_size"),
      uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("bill_attachments_bill_idx").on(table.billId)
    ]);
    billPaymentHistory = pgTable("bill_payment_history", {
      id: uuid("id").primaryKey().defaultRandom(),
      billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
      familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
      memberId: uuid("member_id").references(() => familyMembers.id, { onDelete: "set null" }),
      paidByUserId: uuid("paid_by_user_id").references(() => users.id, { onDelete: "set null" }),
      amount: numeric("amount", { precision: 10, scale: 2 }),
      note: text("note"),
      paidAt: timestamp("paid_at").defaultNow().notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("bill_payment_history_bill_idx").on(table.billId),
      index("bill_payment_history_family_idx").on(table.familyId, table.paidAt)
    ]);
    testAnalyticsEvents = pgTable("test_analytics_events", {
      id: uuid("id").primaryKey().defaultRandom(),
      eventName: varchar("event_name", { length: 50 }).notNull(),
      userId: uuid("user_id"),
      familyId: uuid("family_id"),
      platform: varchar("platform", { length: 10 }),
      appVersion: varchar("app_version", { length: 20 }),
      screen: varchar("screen", { length: 100 }),
      metadata: jsonb("metadata").$type().notNull().default(sql`'{}'::jsonb`),
      isDemoAccount: boolean("is_demo_account").notNull().default(false),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("test_analytics_created_idx").on(table.createdAt),
      index("test_analytics_event_idx").on(table.eventName),
      index("test_analytics_user_idx").on(table.userId),
      index("test_analytics_platform_idx").on(table.platform)
    ]);
    insertUserSchema = createInsertSchema(users).pick({
      email: true,
      name: true,
      passwordHash: true
    });
  }
});

// server/db.ts
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
var pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema: schema_exports });
  }
});

// server/lib/logger.ts
import * as crypto2 from "crypto";
function generateRequestId() {
  return crypto2.randomBytes(8).toString("hex");
}
function formatLog(level, message, meta) {
  const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  return `[${timestamp2}] ${level.toUpperCase()} ${message}${metaStr}`;
}
var logger;
var init_logger = __esm({
  "server/lib/logger.ts"() {
    "use strict";
    logger = {
      info(message, meta) {
        console.log(formatLog("info", message, meta));
      },
      warn(message, meta) {
        console.warn(formatLog("warn", message, meta));
      },
      error(message, meta) {
        console.error(formatLog("error", message, meta));
      },
      debug(message, meta) {
        if (process.env.NODE_ENV === "development") {
          console.log(formatLog("debug", message, meta));
        }
      }
    };
  }
});

// server/lib/block-filter.ts
import { eq, and, or, isNull, notInArray } from "drizzle-orm";
async function getBlockedUserIds(userId, familyId) {
  const userBlocks = await db.select({ blockedUserId: blocks.blockedUserId }).from(blocks).where(and(eq(blocks.blockerUserId, userId), eq(blocks.familyId, familyId)));
  return userBlocks.map((b) => b.blockedUserId);
}
async function getBlockRelatedUserIds(userId, familyId) {
  const rows = await db.select({ blockerUserId: blocks.blockerUserId, blockedUserId: blocks.blockedUserId }).from(blocks).where(
    and(
      eq(blocks.familyId, familyId),
      or(eq(blocks.blockerUserId, userId), eq(blocks.blockedUserId, userId))
    )
  );
  const related = /* @__PURE__ */ new Set();
  for (const r of rows) {
    const other = r.blockerUserId === userId ? r.blockedUserId : r.blockerUserId;
    if (other !== userId) related.add(other);
  }
  return Array.from(related);
}
function applyBlockedFilter(createdByColumn, blockedIds) {
  if (blockedIds.length === 0) return void 0;
  return or(isNull(createdByColumn), notInArray(createdByColumn, blockedIds));
}
var init_block_filter = __esm({
  "server/lib/block-filter.ts"() {
    "use strict";
    init_db();
    init_schema();
  }
});

// server/lib/websocket.ts
import { Server as SocketIOServer } from "socket.io";
import { eq as eq2, and as and2 } from "drizzle-orm";
function getAllowedOrigins() {
  const origins = ["http://localhost:8081"];
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    origins.push(`https://${devDomain}`);
  }
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    replitDomains.split(",").forEach((d) => {
      origins.push(`https://${d.trim()}`);
    });
  }
  const publicDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (publicDomain) {
    origins.push(`https://${publicDomain}`);
  }
  return origins;
}
function setupWebSocket(httpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true
    }
  });
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }
    try {
      const user = verifyAccessToken(token);
      const [record] = await db.select({ emailVerified: users.emailVerified }).from(users).where(eq2(users.id, user.userId)).limit(1);
      if (!record) {
        return next(new Error("User not found"));
      }
      if (!record.emailVerified) {
        return next(new Error("Email not verified"));
      }
      socket.data.userId = user.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });
  io.on("connection", (socket) => {
    logger.info("WebSocket user connected", { userId: socket.data.userId });
    socket.on("join_family", async (familyId) => {
      if (!familyId || typeof familyId !== "string") {
        socket.emit("error", { code: "INVALID_FAMILY_ID", message: "familyId non valido" });
        return;
      }
      try {
        const [membership] = await db.select().from(familyMembers).where(
          and2(
            eq2(familyMembers.userId, socket.data.userId),
            eq2(familyMembers.familyId, familyId)
          )
        ).limit(1);
        if (!membership) {
          logger.warn("WebSocket join_family denied: not a member", {
            userId: socket.data.userId,
            familyId
          });
          socket.emit("error", {
            code: "NOT_FAMILY_MEMBER",
            message: "Non fai parte di questa famiglia"
          });
          return;
        }
        socket.join(`family:${familyId}`);
        logger.info("WebSocket user joined family", {
          userId: socket.data.userId,
          familyId
        });
      } catch (err) {
        logger.error("WebSocket join_family error", { error: String(err) });
        socket.emit("error", {
          code: "SERVER_ERROR",
          message: "Errore nel join della famiglia"
        });
      }
    });
    socket.on("leave_family", (familyId) => {
      socket.leave(`family:${familyId}`);
    });
    socket.on("chat:typing", async (data) => {
      if (!data.familyId || !data.userName) return;
      const roomName = `family:${data.familyId}`;
      if (!socket.rooms.has(roomName)) return;
      try {
        await broadcastTypingToFamily(data.familyId, socket.data.userId, "chat:typing", {
          userId: socket.data.userId,
          userName: data.userName
        });
      } catch (err) {
        logger.error("WebSocket chat:typing error", { error: String(err) });
      }
    });
    socket.on("chat:stop_typing", async (data) => {
      if (!data.familyId) return;
      const roomName = `family:${data.familyId}`;
      if (!socket.rooms.has(roomName)) return;
      try {
        await broadcastTypingToFamily(data.familyId, socket.data.userId, "chat:stop_typing", {
          userId: socket.data.userId
        });
      } catch (err) {
        logger.error("WebSocket chat:stop_typing error", { error: String(err) });
      }
    });
    socket.on("disconnect", () => {
      logger.info("WebSocket user disconnected", { userId: socket.data.userId });
    });
  });
  return io;
}
function broadcastToFamily(familyId, event, data) {
  if (io) {
    io.to(`family:${familyId}`).emit(event, data);
  }
}
async function notifyUserInFamily(familyId, userId, event, data) {
  if (!io) return;
  const room = `family:${familyId}`;
  const sockets = await io.in(room).fetchSockets();
  for (const s of sockets) {
    if (s.data?.userId === userId) {
      s.emit(event, data);
    }
  }
}
async function broadcastChatMessageToFamily(familyId, authorId, event, data) {
  if (!io) return;
  const room = `family:${familyId}`;
  const sockets = await io.in(room).fetchSockets();
  if (sockets.length === 0) return;
  const blockedRelated = new Set(await getBlockRelatedUserIds(authorId, familyId));
  for (const s of sockets) {
    const uid = s.data?.userId;
    if (uid && uid !== authorId && blockedRelated.has(uid)) {
      continue;
    }
    s.emit(event, data);
  }
}
function sweepExpiredBlockCache(now) {
  for (const [key, entry] of blockRelatedCache) {
    if (entry.expires <= now) {
      blockRelatedCache.delete(key);
    }
  }
}
async function getBlockRelatedCached(familyId, userId) {
  const key = `${familyId}:${userId}`;
  const now = nowFn();
  const hit = blockRelatedCache.get(key);
  if (hit && hit.expires > now) {
    return hit.ids;
  }
  if (blockRelatedCache.size > 1e3) {
    sweepExpiredBlockCache(now);
  }
  const ids = new Set(await blockRelatedFetcher(userId, familyId));
  blockRelatedCache.set(key, { ids, expires: now + BLOCK_CACHE_TTL_MS });
  return ids;
}
function shouldReceiveTyping(uid, authorId, blockedRelated) {
  if (!uid || uid === authorId) return false;
  if (blockedRelated.has(uid)) return false;
  return true;
}
function invalidateBlockCache(familyId, userId) {
  if (userId) {
    blockRelatedCache.delete(`${familyId}:${userId}`);
    return;
  }
  const prefix = `${familyId}:`;
  for (const key of blockRelatedCache.keys()) {
    if (key.startsWith(prefix)) {
      blockRelatedCache.delete(key);
    }
  }
}
async function broadcastTypingToFamily(familyId, authorId, event, data) {
  if (!io) return;
  const room = `family:${familyId}`;
  const sockets = await io.in(room).fetchSockets();
  if (sockets.length === 0) return;
  const blockedRelated = await getBlockRelatedCached(familyId, authorId);
  for (const s of sockets) {
    const uid = s.data?.userId;
    if (shouldReceiveTyping(uid, authorId, blockedRelated)) {
      s.emit(event, data);
    }
  }
}
var io, BLOCK_CACHE_TTL_MS, blockRelatedCache, blockRelatedFetcher, nowFn;
var init_websocket = __esm({
  "server/lib/websocket.ts"() {
    "use strict";
    init_jwt();
    init_db();
    init_schema();
    init_logger();
    init_block_filter();
    io = null;
    BLOCK_CACHE_TTL_MS = 3e4;
    blockRelatedCache = /* @__PURE__ */ new Map();
    blockRelatedFetcher = getBlockRelatedUserIds;
    nowFn = () => Date.now();
  }
});

// server/lib/config.ts
var config;
var init_config = __esm({
  "server/lib/config.ts"() {
    "use strict";
    config = {
      premiumPaymentsEnabled: process.env.PREMIUM_PAYMENTS_ENABLED === "true",
      // Regola gating AI:
      // - false (default, pagamenti disattivi): l'AI è gratuita per tutti gli utenti
      //   che hanno dato il consenso (toggle GDPR), limitata dalla quota giornaliera.
      // - true (quando i pagamenti Premium saranno attivi): l'AI richiede ANCHE che
      //   la famiglia abbia subscriptionStatus = "premium".
      // Vedi server/middleware/ai-guard.ts (requireAiEnabled).
      aiRequiresPremium: process.env.AI_REQUIRES_PREMIUM === "true",
      // Email (separate da virgola) di account "proprietario" con Premium permanente.
      // Ogni famiglia di cui questi account fanno parte è sempre Premium, a
      // prescindere da acquisti/scadenze. Vuoto = nessun account privilegiato.
      premiumOwnerEmails: (process.env.PREMIUM_OWNER_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
      // RevenueCat è il motore degli acquisti store-native (Premium mobile). Il
      // backend sincronizza lo stato da RevenueCat (REST v2) verso la tabella
      // entitlements; isPremium(familyId) resta letto dal DB. AppUserID = familyId.
      revenuecat: {
        projectId: process.env.REVENUECAT_PROJECT_ID || "",
        // lookup_key dell'entitlement Premium (es. "premium").
        entitlementId: process.env.REVENUECAT_ENTITLEMENT_ID || "premium",
        // id oggetto RevenueCat dell'entitlement (es. entl...), usato come ulteriore
        // confronto perché l'endpoint active_entitlements espone l'entitlement_id.
        entitlementRcId: process.env.REVENUECAT_ENTITLEMENT_RC_ID || "",
        // Valore atteso nell'header Authorization dei webhook RevenueCat. Se vuoto,
        // i webhook NON sono autenticati (accettabile solo in sviluppo).
        webhookAuthHeader: process.env.REVENUECAT_WEBHOOK_AUTH_HEADER || ""
      },
      port: parseInt(process.env.PORT || "5000", 10),
      // True quando il server gira in ambiente di produzione (deploy). Usato per
      // imporre requisiti più stringenti (es. invio email obbligatorio).
      get isProduction() {
        return process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
      },
      getBaseUrl(req) {
        if (req) {
          const proto = req.header("x-forwarded-proto") || req.protocol || "https";
          const host = req.header("x-forwarded-host") || req.get("host");
          if (host) return `${proto}://${host}`;
        }
        if (process.env.REPLIT_DOMAINS) {
          const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
          return `https://${domain}`;
        }
        if (process.env.REPLIT_DEV_DOMAIN) {
          return `https://${process.env.REPLIT_DEV_DOMAIN}`;
        }
        return `http://localhost:${config.port}`;
      }
    };
  }
});

// server/lib/entitlements.ts
import { and as and3, eq as eq3, inArray, isNotNull, sql as sql2 } from "drizzle-orm";
function isEntitlementActive(ent, now = /* @__PURE__ */ new Date()) {
  if (!ent) return false;
  if (ent.status !== "active") return false;
  if (ent.expiresAt && ent.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
function deriveStatus(result, now = /* @__PURE__ */ new Date()) {
  if (result.active) {
    if (result.expiresAt && result.expiresAt.getTime() <= now.getTime()) return "expired";
    return "active";
  }
  if (result.expiresAt && result.expiresAt.getTime() <= now.getTime()) return "expired";
  return "expired";
}
async function syncEntitlementFromRevenueCat(params) {
  let active = params.active;
  let expiresAt = params.expiresAt;
  if (await isOwnerPremiumFamily(params.familyId)) {
    active = true;
    expiresAt = null;
  }
  if (!active) {
    const current = await store.get(params.familyId);
    if (current && current.trialDays != null && (isEntitlementActive(current) || current.status === "pending")) {
      return { premium: isEntitlementActive(current), status: current.status, expiresAt: current.expiresAt };
    }
  }
  const status = deriveStatus({ active, expiresAt });
  const premium = status === "active";
  await store.upsert({
    familyId: params.familyId,
    userId: params.userId,
    platform: "revenuecat",
    productId: params.productId ?? "premium",
    status,
    expiresAt,
    purchaseToken: null,
    originalTransactionId: null,
    transactionId: null,
    latestReceipt: null
  });
  await store.setFamilySubscriptionStatus(params.familyId, premium ? "premium" : "free");
  return { premium, status, expiresAt };
}
async function isOwnerPremiumFamily(familyId) {
  const owners = config.premiumOwnerEmails;
  if (owners.length === 0) return false;
  try {
    const rows = await db.select({ email: users.email }).from(familyMembers).innerJoin(users, eq3(familyMembers.userId, users.id)).where(eq3(familyMembers.familyId, familyId));
    return rows.some((r) => owners.includes(r.email.toLowerCase()));
  } catch {
    return false;
  }
}
async function isPremium(familyId) {
  try {
    const ent = await store.get(familyId);
    return isEntitlementActive(ent);
  } catch {
    return false;
  }
}
async function seedOwnerEntitlements() {
  const owners = config.premiumOwnerEmails;
  if (owners.length === 0) return 0;
  const rows = await db.select({ familyId: familyMembers.familyId, userId: familyMembers.userId }).from(familyMembers).innerJoin(users, eq3(familyMembers.userId, users.id)).where(inArray(sql2`lower(${users.email})`, owners));
  const seen = /* @__PURE__ */ new Set();
  for (const r of rows) {
    if (seen.has(r.familyId)) continue;
    seen.add(r.familyId);
    await store.upsert({
      familyId: r.familyId,
      userId: r.userId,
      platform: "revenuecat",
      productId: "owner_grant",
      status: "active",
      expiresAt: null,
      purchaseToken: null,
      originalTransactionId: null,
      transactionId: null,
      latestReceipt: null
    });
    await store.setFamilySubscriptionStatus(r.familyId, "premium");
  }
  return seen.size;
}
async function getEntitlement(familyId) {
  return store.get(familyId);
}
async function getPlanForFamily(familyId) {
  return await isPremium(familyId) ? "premium" : "free";
}
async function isFamilyMemberLimitReached(familyId) {
  if (await isPremium(familyId)) return false;
  const [row] = await db.select({ count: sql2`count(*)::int` }).from(familyMembers).where(eq3(familyMembers.familyId, familyId));
  return (row?.count ?? 0) >= FREE_MAX_FAMILY_MEMBERS;
}
async function isFamilyMemberLimitReachedTx(tx, familyId) {
  if (await isPremium(familyId)) return false;
  await tx.execute(sql2`SELECT pg_advisory_xact_lock(hashtext(${`family-members:${familyId}`}))`);
  const [row] = await tx.select({ count: sql2`count(*)::int` }).from(familyMembers).where(eq3(familyMembers.familyId, familyId));
  return (row?.count ?? 0) >= FREE_MAX_FAMILY_MEMBERS;
}
async function activatePendingTrialsForUser(userId, now = /* @__PURE__ */ new Date()) {
  try {
    const rows = await db.select({ id: entitlements.id, familyId: entitlements.familyId, trialDays: entitlements.trialDays }).from(entitlements).innerJoin(familyMembers, eq3(familyMembers.familyId, entitlements.familyId)).where(
      and3(
        eq3(familyMembers.userId, userId),
        eq3(entitlements.status, "pending"),
        isNotNull(entitlements.trialDays)
      )
    );
    let activated = 0;
    for (const r of rows) {
      const days = r.trialDays ?? 0;
      if (days <= 0) continue;
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + days);
      const flipped = await db.update(entitlements).set({ status: "active", expiresAt, updatedAt: /* @__PURE__ */ new Date() }).where(and3(eq3(entitlements.id, r.id), eq3(entitlements.status, "pending"))).returning({ id: entitlements.id });
      if (flipped.length === 0) continue;
      await db.update(families).set({ subscriptionStatus: "premium" }).where(eq3(families.id, r.familyId));
      activated += 1;
    }
    return activated;
  } catch {
    return 0;
  }
}
var dbEntitlementStore, store, FREE_MAX_FAMILY_MEMBERS;
var init_entitlements = __esm({
  "server/lib/entitlements.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_config();
    dbEntitlementStore = {
      async get(familyId) {
        const [row] = await db.select({ status: entitlements.status, expiresAt: entitlements.expiresAt, trialDays: entitlements.trialDays }).from(entitlements).where(eq3(entitlements.familyId, familyId)).limit(1);
        return row ?? null;
      },
      async upsert(input) {
        await db.insert(entitlements).values({
          familyId: input.familyId,
          userId: input.userId,
          platform: input.platform,
          productId: input.productId,
          status: input.status,
          expiresAt: input.expiresAt,
          purchaseToken: input.purchaseToken,
          originalTransactionId: input.originalTransactionId,
          transactionId: input.transactionId,
          latestReceipt: input.latestReceipt,
          updatedAt: /* @__PURE__ */ new Date()
        }).onConflictDoUpdate({
          target: entitlements.familyId,
          set: {
            userId: input.userId,
            platform: input.platform,
            productId: input.productId,
            status: input.status,
            expiresAt: input.expiresAt,
            purchaseToken: input.purchaseToken,
            originalTransactionId: input.originalTransactionId,
            transactionId: input.transactionId,
            latestReceipt: input.latestReceipt,
            updatedAt: /* @__PURE__ */ new Date()
          }
        });
      },
      async setFamilySubscriptionStatus(familyId, status) {
        await db.update(families).set({ subscriptionStatus: status }).where(eq3(families.id, familyId));
      }
    };
    store = dbEntitlementStore;
    FREE_MAX_FAMILY_MEMBERS = 5;
  }
});

// server/lib/media-auth.ts
import { eq as eq4, and as and4, or as or2 } from "drizzle-orm";
function normalizeUploadFileUrl(p) {
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    decoded = p;
  }
  const filename = decoded.replace(/^\/+/, "").replace(/^uploads\/+/, "");
  return `/uploads/${filename}`;
}
async function userIsFamilyMember(userId, familyId) {
  const [row] = await db.select({ id: familyMembers.id }).from(familyMembers).where(and4(eq4(familyMembers.userId, userId), eq4(familyMembers.familyId, familyId))).limit(1);
  return !!row;
}
async function usersHaveBlockRelationship(userA, userB, familyId) {
  if (userA === userB) return false;
  const [row] = await db.select({ id: blocks.id }).from(blocks).where(
    and4(
      eq4(blocks.familyId, familyId),
      or2(
        and4(eq4(blocks.blockerUserId, userA), eq4(blocks.blockedUserId, userB)),
        and4(eq4(blocks.blockerUserId, userB), eq4(blocks.blockedUserId, userA))
      )
    )
  ).limit(1);
  return !!row;
}
async function resolveUploadFileAccess(userId, fileUrlOrPath) {
  const fileUrl = normalizeUploadFileUrl(fileUrlOrPath);
  const chatRow = await activeMediaAccessStore.findChatFileAccess(userId, fileUrl);
  if (chatRow) {
    if (chatRow.authorId !== userId) {
      const blocked = await activeMediaAccessStore.hasBlockRelationship(
        userId,
        chatRow.authorId,
        chatRow.familyId
      );
      if (blocked) return null;
    }
    return chatRow.familyId;
  }
  const billRow = await activeMediaAccessStore.findBillAttachmentAccess(userId, fileUrl);
  if (billRow) {
    const premium = await activeMediaAccessStore.isFamilyPremium(billRow.familyId);
    if (!premium) return null;
    return billRow.familyId;
  }
  return null;
}
function authorizeMediaRequest(input) {
  const requested = normalizeUploadFileUrl(input.requestedFileUrl);
  if (input.tokenFilePath) {
    const allowed = normalizeUploadFileUrl(input.tokenFilePath);
    if (requested !== allowed) return { ok: false, code: "FORBIDDEN_FILE" };
  }
  if (!input.fileFamilyId) return { ok: false, code: "FORBIDDEN_FILE" };
  if (input.tokenFamilyId && input.tokenFamilyId !== input.fileFamilyId) {
    return { ok: false, code: "FORBIDDEN_FILE" };
  }
  return { ok: true };
}
var dbMediaAccessStore, activeMediaAccessStore;
var init_media_auth = __esm({
  "server/lib/media-auth.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_entitlements();
    dbMediaAccessStore = {
      async findChatFileAccess(userId, fileUrl) {
        const [row] = await db.select({ familyId: chatMessages.familyId, authorId: chatMessages.userId }).from(chatMessages).innerJoin(familyMembers, eq4(familyMembers.familyId, chatMessages.familyId)).where(and4(eq4(chatMessages.fileUrl, fileUrl), eq4(familyMembers.userId, userId))).limit(1);
        return row ?? null;
      },
      async findBillAttachmentAccess(userId, fileUrl) {
        const [row] = await db.select({ familyId: billAttachments.familyId }).from(billAttachments).innerJoin(familyMembers, eq4(familyMembers.familyId, billAttachments.familyId)).where(and4(eq4(billAttachments.fileUrl, fileUrl), eq4(familyMembers.userId, userId))).limit(1);
        return row ?? null;
      },
      async hasBlockRelationship(userA, userB, familyId) {
        return usersHaveBlockRelationship(userA, userB, familyId);
      },
      async isFamilyPremium(familyId) {
        return isPremium(familyId);
      }
    };
    activeMediaAccessStore = dbMediaAccessStore;
  }
});

// server/middleware/auth.ts
import { eq as eq5 } from "drizzle-orm";
async function authenticate(req, res, next) {
  let payload;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }
    const token = authHeader.substring(7);
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
  }
  try {
    const [record] = await db.select({ deletedAt: users.deletedAt }).from(users).where(eq5(users.id, payload.userId)).limit(1);
    if (!record || record.deletedAt) {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'autenticazione" } });
  }
}
async function authenticateMedia(req, res, next) {
  const token = typeof req.query.token === "string" && req.query.token.length > 0 ? req.query.token : void 0;
  if (!token) {
    return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
  }
  let payload;
  try {
    payload = verifyMediaToken(token);
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
  }
  const requestedFileUrl = normalizeUploadFileUrl(req.path);
  try {
    const fileFamilyId = await resolveUploadFileAccess(payload.userId, requestedFileUrl);
    const decision = authorizeMediaRequest({
      requestedFileUrl,
      fileFamilyId,
      tokenFilePath: payload.filePath,
      tokenFamilyId: payload.familyId
    });
    if (!decision.ok) {
      return res.status(403).json({ error: { code: "FORBIDDEN_FILE", message: "Non hai i permessi per accedere a questo file" } });
    }
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica dei permessi" } });
  }
  req.user = { userId: payload.userId, email: "" };
  next();
}
async function requireEmailVerified(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }
    const [record] = await db.select({ emailVerified: users.emailVerified }).from(users).where(eq5(users.id, req.user.userId)).limit(1);
    if (!record) {
      return res.status(401).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    if (!record.emailVerified) {
      return res.status(403).json({
        error: { code: "EMAIL_NOT_VERIFIED", message: "Devi verificare la tua email per accedere a questa funzione" }
      });
    }
    next();
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica email" } });
  }
}
var init_auth = __esm({
  "server/middleware/auth.ts"() {
    "use strict";
    init_jwt();
    init_db();
    init_schema();
    init_media_auth();
  }
});

// server/lib/http-params.ts
function getParam(req, name) {
  const value = req.params[name];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}
function getQuery(req, name) {
  const value = req.query[name];
  return typeof value === "string" ? value : void 0;
}
var init_http_params = __esm({
  "server/lib/http-params.ts"() {
    "use strict";
  }
});

// server/middleware/family.ts
import { eq as eq8, and as and6 } from "drizzle-orm";
function requireFamilyMember(paramName = "familyId") {
  return async (req, res, next) => {
    const familyId = req.params[paramName] || req.body?.familyId;
    if (!familyId || typeof familyId !== "string") {
      return res.status(400).json({
        error: { code: "MISSING_FAMILY_ID", message: "familyId \xE8 obbligatorio" }
      });
    }
    const [membership] = await db.select().from(familyMembers).where(
      and6(
        eq8(familyMembers.userId, req.user.userId),
        eq8(familyMembers.familyId, familyId)
      )
    ).limit(1);
    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" }
      });
    }
    req.membership = membership;
    next();
  };
}
function requireFamilyAdmin(paramName = "familyId") {
  return async (req, res, next) => {
    const familyId = req.params[paramName] || req.body?.familyId;
    if (!familyId || typeof familyId !== "string") {
      return res.status(400).json({
        error: { code: "MISSING_FAMILY_ID", message: "familyId \xE8 obbligatorio" }
      });
    }
    const [membership] = await db.select().from(familyMembers).where(
      and6(
        eq8(familyMembers.userId, req.user.userId),
        eq8(familyMembers.familyId, familyId)
      )
    ).limit(1);
    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" }
      });
    }
    if (membership.role !== "admin") {
      return res.status(403).json({
        error: { code: "NOT_ADMIN", message: "Solo gli admin possono eseguire questa azione" }
      });
    }
    req.membership = membership;
    next();
  };
}
var init_family = __esm({
  "server/middleware/family.ts"() {
    "use strict";
    init_db();
    init_schema();
  }
});

// server/routes/expenses.ts
var expenses_exports = {};
__export(expenses_exports, {
  EXPENSE_CATEGORIES: () => EXPENSE_CATEGORIES,
  default: () => expenses_default,
  getBudgetSummary: () => getBudgetSummary
});
import { Router as Router11 } from "express";
import { z as z10 } from "zod";
import { eq as eq20, and as and17, sql as sql8, desc as desc2, gte as gte4, lt as lt2 } from "drizzle-orm";
function isRealDate2(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}
function monthRange(month) {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextM = mo === 12 ? 1 : mo + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start, end };
}
function currentMonth() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
}
async function getBudgetSummary(familyId, month) {
  const range = monthRange(month);
  if (!range) return null;
  const byCategory = await db.select({
    category: expenses.category,
    total: sql8`SUM(${expenses.amount})`,
    count: sql8`COUNT(*)::int`
  }).from(expenses).where(and17(
    eq20(expenses.familyId, familyId),
    gte4(expenses.date, range.start),
    lt2(expenses.date, range.end)
  )).groupBy(expenses.category);
  const [billsRow] = await db.select({
    total: sql8`SUM(${billPaymentHistory.amount})`,
    count: sql8`COUNT(*)::int`
  }).from(billPaymentHistory).where(and17(
    eq20(billPaymentHistory.familyId, familyId),
    gte4(billPaymentHistory.paidAt, /* @__PURE__ */ new Date(range.start + "T00:00:00Z")),
    lt2(billPaymentHistory.paidAt, /* @__PURE__ */ new Date(range.end + "T00:00:00Z"))
  ));
  const categories = {};
  for (const row of byCategory) {
    categories[row.category] = { total: Number(row.total || 0), count: row.count };
  }
  const billsTotal = Number(billsRow?.total || 0);
  if (billsTotal > 0 || (billsRow?.count || 0) > 0) {
    categories["bollette"] = { total: billsTotal, count: billsRow?.count || 0 };
  }
  const total = Object.values(categories).reduce((s, c) => s + c.total, 0);
  const budgets = await db.select().from(familyBudgets).where(eq20(familyBudgets.familyId, familyId));
  const trendStartDate = /* @__PURE__ */ new Date(range.start + "T00:00:00Z");
  trendStartDate.setUTCMonth(trendStartDate.getUTCMonth() - 5);
  const trendStart = trendStartDate.toISOString().slice(0, 10);
  const expenseTrend = await db.select({
    month: sql8`to_char(${expenses.date}, 'YYYY-MM')`,
    total: sql8`SUM(${expenses.amount})`
  }).from(expenses).where(and17(
    eq20(expenses.familyId, familyId),
    gte4(expenses.date, trendStart),
    lt2(expenses.date, range.end)
  )).groupBy(sql8`to_char(${expenses.date}, 'YYYY-MM')`);
  const billsTrend = await db.select({
    month: sql8`to_char(${billPaymentHistory.paidAt}, 'YYYY-MM')`,
    total: sql8`SUM(${billPaymentHistory.amount})`
  }).from(billPaymentHistory).where(and17(
    eq20(billPaymentHistory.familyId, familyId),
    gte4(billPaymentHistory.paidAt, /* @__PURE__ */ new Date(trendStart + "T00:00:00Z")),
    lt2(billPaymentHistory.paidAt, /* @__PURE__ */ new Date(range.end + "T00:00:00Z"))
  )).groupBy(sql8`to_char(${billPaymentHistory.paidAt}, 'YYYY-MM')`);
  const trendMap = /* @__PURE__ */ new Map();
  for (let i = 5; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date(range.start + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - i);
    trendMap.set(d.toISOString().slice(0, 7), 0);
  }
  for (const row of expenseTrend) {
    if (trendMap.has(row.month)) trendMap.set(row.month, (trendMap.get(row.month) || 0) + Number(row.total || 0));
  }
  for (const row of billsTrend) {
    if (trendMap.has(row.month)) trendMap.set(row.month, (trendMap.get(row.month) || 0) + Number(row.total || 0));
  }
  const trend = [...trendMap.entries()].map(([m, t]) => ({ month: m, total: Math.round(t * 100) / 100 }));
  return {
    month,
    total: Math.round(total * 100) / 100,
    categories,
    budgets: budgets.map((b) => ({ category: b.category, monthlyLimit: Number(b.monthlyLimit) })),
    trend
  };
}
var router11, EXPENSE_CATEGORIES, BUDGET_CATEGORIES, expenseSchema, budgetSchema, expenses_default;
var init_expenses = __esm({
  "server/routes/expenses.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_auth();
    init_family();
    init_http_params();
    init_websocket();
    init_logger();
    router11 = Router11();
    EXPENSE_CATEGORIES = [
      "alimentari",
      "trasporti",
      "svago",
      "salute",
      "casa",
      "abbigliamento",
      "istruzione",
      "altro"
    ];
    BUDGET_CATEGORIES = ["total", "bollette", ...EXPENSE_CATEGORIES];
    expenseSchema = z10.object({
      amount: z10.number().positive("L'importo deve essere maggiore di zero").max(1e6),
      category: z10.enum(EXPENSE_CATEGORIES),
      description: z10.string().trim().max(255).optional().nullable(),
      date: z10.string().refine(isRealDate2, "Data non valida (YYYY-MM-DD)")
    });
    budgetSchema = z10.object({
      category: z10.enum(BUDGET_CATEGORIES),
      // null/0 = rimuovi il tetto
      monthlyLimit: z10.number().min(0).max(1e7).nullable()
    });
    router11.get("/:familyId/summary", authenticate, requireFamilyMember(), async (req, res) => {
      try {
        const familyId = getParam(req, "familyId");
        const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
        const summary = await getBudgetSummary(familyId, month);
        if (!summary) {
          return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Mese non valido (YYYY-MM)" } });
        }
        res.json(summary);
      } catch (error) {
        logger.error("Budget summary error", { error: String(error) });
        res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel riepilogo del budget" } });
      }
    });
    router11.get("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
      try {
        const familyId = getParam(req, "familyId");
        const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
        const range = monthRange(month);
        if (!range) {
          return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Mese non valido (YYYY-MM)" } });
        }
        const items = await db.select().from(expenses).where(and17(
          eq20(expenses.familyId, familyId),
          gte4(expenses.date, range.start),
          lt2(expenses.date, range.end)
        )).orderBy(desc2(expenses.date), desc2(expenses.createdAt)).limit(500);
        res.json({ items });
      } catch (error) {
        logger.error("List expenses error", { error: String(error) });
        res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero delle spese" } });
      }
    });
    router11.post("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
      try {
        const familyId = getParam(req, "familyId");
        const parsed = expenseSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
          });
        }
        const membership = req.membership;
        const [created] = await db.insert(expenses).values({
          familyId,
          memberId: membership.id,
          amount: String(parsed.data.amount),
          category: parsed.data.category,
          description: parsed.data.description?.trim() || null,
          date: parsed.data.date,
          createdBy: req.user.userId
        }).returning();
        broadcastToFamily(familyId, "expenses_updated", { item: created });
        res.status(201).json(created);
      } catch (error) {
        logger.error("Create expense error", { error: String(error) });
        res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiunta della spesa" } });
      }
    });
    router11.put("/:familyId/:expenseId", authenticate, requireFamilyMember(), async (req, res) => {
      try {
        const familyId = getParam(req, "familyId");
        const expenseId = getParam(req, "expenseId");
        const parsed = expenseSchema.partial().safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
          });
        }
        const updateData = { updatedAt: /* @__PURE__ */ new Date() };
        if (parsed.data.amount !== void 0) updateData.amount = String(parsed.data.amount);
        if (parsed.data.category !== void 0) updateData.category = parsed.data.category;
        if (parsed.data.description !== void 0) updateData.description = parsed.data.description?.trim() || null;
        if (parsed.data.date !== void 0) updateData.date = parsed.data.date;
        const [item] = await db.update(expenses).set(updateData).where(and17(eq20(expenses.id, expenseId), eq20(expenses.familyId, familyId))).returning();
        if (!item) {
          return res.status(404).json({ error: { code: "NOT_FOUND", message: "Spesa non trovata" } });
        }
        broadcastToFamily(familyId, "expenses_updated", { item });
        res.json(item);
      } catch (error) {
        logger.error("Update expense error", { error: String(error) });
        res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento della spesa" } });
      }
    });
    router11.delete("/:familyId/:expenseId", authenticate, requireFamilyMember(), async (req, res) => {
      try {
        const familyId = getParam(req, "familyId");
        const expenseId = getParam(req, "expenseId");
        const [deleted] = await db.delete(expenses).where(and17(eq20(expenses.id, expenseId), eq20(expenses.familyId, familyId))).returning();
        if (!deleted) {
          return res.status(404).json({ error: { code: "NOT_FOUND", message: "Spesa non trovata" } });
        }
        broadcastToFamily(familyId, "expenses_updated", { removedId: expenseId });
        res.json({ success: true });
      } catch (error) {
        logger.error("Delete expense error", { error: String(error) });
        res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione della spesa" } });
      }
    });
    router11.put("/:familyId/budget/limit", authenticate, requireFamilyMember(), async (req, res) => {
      try {
        const familyId = getParam(req, "familyId");
        const membership = req.membership;
        if (membership.role !== "admin" && membership.role !== "adult") {
          return res.status(403).json({
            error: { code: "FORBIDDEN", message: "Solo admin e adulti possono impostare il budget" }
          });
        }
        const parsed = budgetSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
          });
        }
        if (parsed.data.monthlyLimit == null || parsed.data.monthlyLimit <= 0) {
          await db.delete(familyBudgets).where(and17(eq20(familyBudgets.familyId, familyId), eq20(familyBudgets.category, parsed.data.category)));
          broadcastToFamily(familyId, "expenses_updated", { budgetRemoved: parsed.data.category });
          return res.json({ success: true, removed: true });
        }
        const [saved] = await db.insert(familyBudgets).values({
          familyId,
          category: parsed.data.category,
          monthlyLimit: String(parsed.data.monthlyLimit)
        }).onConflictDoUpdate({
          target: [familyBudgets.familyId, familyBudgets.category],
          set: { monthlyLimit: String(parsed.data.monthlyLimit), updatedAt: /* @__PURE__ */ new Date() }
        }).returning();
        broadcastToFamily(familyId, "expenses_updated", { budget: saved });
        res.json(saved);
      } catch (error) {
        logger.error("Set budget error", { error: String(error) });
        res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'impostazione del budget" } });
      }
    });
    expenses_default = router11;
  }
});

// server/lib/stripeClient.ts
var stripeClient_exports = {};
__export(stripeClient_exports, {
  getStripePublishableKey: () => getStripePublishableKey,
  getStripeSecretKey: () => getStripeSecretKey,
  getStripeSync: () => getStripeSync,
  getUncachableStripeClient: () => getUncachableStripeClient
});
import Stripe from "stripe";
async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }
  const connectorName = "stripe";
  const isProduction3 = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction3 ? "production" : "development";
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", connectorName);
  url.searchParams.set("environment", targetEnvironment);
  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "X_REPLIT_TOKEN": xReplitToken
    }
  });
  const data = await response.json();
  connectionSettings = data.items?.[0];
  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }
  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret
  };
}
async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey);
}
async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}
async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}
async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    const secretKey = await getStripeSecretKey();
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL,
        max: 2
      },
      stripeSecretKey: secretKey
    });
  }
  return stripeSync;
}
var connectionSettings, stripeSync;
var init_stripeClient = __esm({
  "server/lib/stripeClient.ts"() {
    "use strict";
    stripeSync = null;
  }
});

// server/lib/stripeService.ts
var stripeService_exports = {};
__export(stripeService_exports, {
  PLAN_TO_INTERVAL: () => PLAN_TO_INTERVAL,
  PaymentConfigError: () => PaymentConfigError,
  StripeService: () => StripeService,
  buildCheckoutSessionParams: () => buildCheckoutSessionParams,
  extractFamilyRefFromSubscription: () => extractFamilyRefFromSubscription,
  mapStripeStatusToFamily: () => mapStripeStatusToFamily,
  resolvePriceIdForPlan: () => resolvePriceIdForPlan,
  stripeService: () => stripeService,
  validatePlan: () => validatePlan
});
import { sql as sql10, eq as eq24 } from "drizzle-orm";
function validatePlan(plan) {
  if (plan === "monthly" || plan === "yearly") return plan;
  throw new PaymentConfigError("INVALID_PLAN", 'Piano non valido: usa "monthly" o "yearly"');
}
function mapStripeStatusToFamily(status) {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return "premium";
    default:
      return "canceled";
  }
}
function extractFamilyRefFromSubscription(subscription) {
  const familyId = subscription?.metadata?.familyId;
  const customerId = typeof subscription?.customer === "string" ? subscription.customer : subscription?.customer?.id;
  return { familyId: familyId || void 0, customerId: customerId || void 0 };
}
function buildCheckoutSessionParams(opts) {
  return {
    customer: opts.customerId,
    payment_method_types: ["card"],
    line_items: [{ price: opts.priceId, quantity: 1 }],
    mode: "subscription",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.familyId,
    metadata: { familyId: opts.familyId, userId: opts.userId },
    subscription_data: {
      metadata: { familyId: opts.familyId, userId: opts.userId }
    }
  };
}
async function resolvePriceIdForPlan(plan, stripe) {
  const interval = PLAN_TO_INTERVAL[validatePlan(plan)];
  let product;
  try {
    const search = await stripe.products.search({
      query: "name:'FamilySync Premium' AND active:'true'"
    });
    product = search.data.find((p) => p.metadata?.tier === "premium") || search.data[0];
  } catch {
  }
  if (!product) {
    const list = await stripe.products.list({ active: true, limit: 100 });
    product = list.data.find(
      (p) => p.metadata?.tier === "premium" || p.name === "FamilySync Premium"
    );
  }
  if (!product) {
    throw new PaymentConfigError(
      "PRODUCT_NOT_FOUND",
      "Prodotto FamilySync Premium non trovato su Stripe"
    );
  }
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const match = prices.data.find(
    (pr) => pr.active && pr.recurring?.interval === interval && pr.currency?.toLowerCase() === PREMIUM_CURRENCY
  );
  if (!match) {
    throw new PaymentConfigError(
      "PRICE_NOT_FOUND",
      `Nessun prezzo ${interval} attivo in ${PREMIUM_CURRENCY.toUpperCase()} per FamilySync Premium`
    );
  }
  return match.id;
}
var PLAN_TO_INTERVAL, PREMIUM_CURRENCY, PaymentConfigError, StripeService, stripeService;
var init_stripeService = __esm({
  "server/lib/stripeService.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_stripeClient();
    PLAN_TO_INTERVAL = {
      monthly: "month",
      yearly: "year"
    };
    PREMIUM_CURRENCY = "eur";
    PaymentConfigError = class extends Error {
      code;
      constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "PaymentConfigError";
      }
    };
    StripeService = class {
      async createCustomer(email, familyId, familyName) {
        const stripe = await getUncachableStripeClient();
        return await stripe.customers.create({
          email,
          metadata: { familyId, familyName }
        });
      }
      /** Risolve il priceId attivo per il piano usando il client Stripe reale. */
      async getPriceIdForPlan(plan) {
        const stripe = await getUncachableStripeClient();
        return resolvePriceIdForPlan(plan, stripe);
      }
      async createCheckoutSession(opts) {
        const stripe = await getUncachableStripeClient();
        return await stripe.checkout.sessions.create(buildCheckoutSessionParams(opts));
      }
      async createCustomerPortalSession(customerId, returnUrl) {
        const stripe = await getUncachableStripeClient();
        return await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl
        });
      }
      async getProduct(productId) {
        const result = await db.execute(
          sql10`SELECT * FROM stripe.products WHERE id = ${productId}`
        );
        return result.rows[0] || null;
      }
      async listProducts(active = true, limit = 20, offset = 0) {
        const result = await db.execute(
          sql10`SELECT * FROM stripe.products WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
        );
        if (result.rows.length === 0) {
          const stripe = await getUncachableStripeClient();
          const products = await stripe.products.list({ active, limit });
          return products.data;
        }
        return result.rows;
      }
      async listProductsWithPrices(active = true, limit = 20, offset = 0) {
        const result = await db.execute(
          sql10`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active,
          pr.metadata as price_metadata
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
        );
        if (result.rows.length === 0) {
          const stripe = await getUncachableStripeClient();
          const products = await stripe.products.list({ active, limit });
          const productsWithPrices = await Promise.all(
            products.data.map(async (product) => {
              const prices = await stripe.prices.list({ product: product.id, active: true });
              return {
                product_id: product.id,
                product_name: product.name,
                product_description: product.description,
                product_active: product.active,
                product_metadata: product.metadata,
                prices: prices.data.map((price) => ({
                  price_id: price.id,
                  unit_amount: price.unit_amount,
                  currency: price.currency,
                  recurring: price.recurring,
                  price_active: price.active,
                  price_metadata: price.metadata
                }))
              };
            })
          );
          return productsWithPrices;
        }
        return result.rows;
      }
      async getPrice(priceId) {
        const result = await db.execute(
          sql10`SELECT * FROM stripe.prices WHERE id = ${priceId}`
        );
        return result.rows[0] || null;
      }
      async listPrices(active = true, limit = 20, offset = 0) {
        const result = await db.execute(
          sql10`SELECT * FROM stripe.prices WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
        );
        return result.rows;
      }
      async getPricesForProduct(productId) {
        const result = await db.execute(
          sql10`SELECT * FROM stripe.prices WHERE product = ${productId} AND active = true`
        );
        return result.rows;
      }
      async getSubscription(subscriptionId) {
        const result = await db.execute(
          sql10`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
        );
        return result.rows[0] || null;
      }
      async updateFamilyStripeInfo(familyId, stripeInfo) {
        const [family] = await db.update(families).set(stripeInfo).where(eq24(families.id, familyId)).returning();
        return family;
      }
      /**
       * Aggiorna la tabella `families` a partire da un oggetto subscription Stripe
       * (eventi customer.subscription.*). L'app legge lo stato Premium da `families`,
       * quindi non basta sincronizzare le tabelle stripe.*.
       */
      async updateFamilyFromStripeSubscription(subscription) {
        const { familyId, customerId } = extractFamilyRefFromSubscription(subscription);
        const status = mapStripeStatusToFamily(subscription?.status);
        const periodEnd = typeof subscription?.current_period_end === "number" ? new Date(subscription.current_period_end * 1e3) : void 0;
        const set = {
          subscriptionStatus: status,
          stripeSubscriptionId: subscription?.id ?? null
        };
        if (periodEnd) set.subscriptionCurrentPeriodEnd = periodEnd;
        if (familyId) {
          const [family] = await db.update(families).set(set).where(eq24(families.id, familyId)).returning();
          return family;
        }
        if (customerId) {
          const [family] = await db.update(families).set(set).where(eq24(families.stripeCustomerId, customerId)).returning();
          return family;
        }
        return void 0;
      }
      async getFamily(familyId) {
        const [family] = await db.select().from(families).where(eq24(families.id, familyId));
        return family;
      }
    };
    stripeService = new StripeService();
  }
});

// server/lib/webhookHandlers.ts
var webhookHandlers_exports = {};
__export(webhookHandlers_exports, {
  WebhookHandlers: () => WebhookHandlers,
  reconcileFamilyFromEvent: () => reconcileFamilyFromEvent
});
async function reconcileFamilyFromEvent(event, service = stripeService) {
  const type = event?.type;
  const obj = event?.data?.object;
  if (!type || !obj) return;
  if (type.startsWith("customer.subscription.")) {
    await service.updateFamilyFromStripeSubscription(obj);
    return;
  }
  if (type === "checkout.session.completed") {
    const familyId = obj.client_reference_id || obj.metadata?.familyId;
    const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
    const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id;
    if (familyId) {
      await service.updateFamilyStripeInfo(familyId, {
        ...customerId ? { stripeCustomerId: customerId } : {},
        ...subscriptionId ? { stripeSubscriptionId: subscriptionId } : {},
        subscriptionStatus: "premium"
      });
    }
    return;
  }
}
var WebhookHandlers;
var init_webhookHandlers = __esm({
  "server/lib/webhookHandlers.ts"() {
    "use strict";
    init_stripeClient();
    init_stripeService();
    init_logger();
    WebhookHandlers = class {
      static async processWebhook(payload, signature) {
        if (!Buffer.isBuffer(payload)) {
          throw new Error(
            "STRIPE WEBHOOK ERROR: Payload must be a Buffer. Received type: " + typeof payload + ". This usually means express.json() parsed the body before reaching this handler. FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
          );
        }
        const sync = await getStripeSync();
        await sync.processWebhook(payload, signature);
        try {
          const event = JSON.parse(payload.toString("utf8"));
          await reconcileFamilyFromEvent(event);
        } catch (error) {
          logger.error("Errore riconciliazione famiglia da webhook", { error: String(error) });
        }
      }
    };
  }
});

// server/index.ts
import express2 from "express";

// server/routes.ts
init_websocket();
init_auth();
import express from "express";
import { createServer } from "node:http";
import helmet from "helmet";
import rateLimit6 from "express-rate-limit";

// server/routes/auth.ts
init_db();
init_schema();
init_jwt();
init_media_auth();
import { Router } from "express";
import { z } from "zod";
import bcrypt2 from "bcryptjs";
import { eq as eq7 } from "drizzle-orm";

// server/lib/email.ts
import { Resend } from "resend";
function apiKey() {
  return (process.env.RESEND_API_KEY || "").trim();
}
function fromAddress() {
  return (process.env.EMAIL_FROM || "noreply@familysync.eu").trim();
}
function supportAddress() {
  return (process.env.SUPPORT_EMAIL || "").trim();
}
function clientBaseUrl() {
  return (process.env.CLIENT_URL || "").trim().replace(/\/+$/, "");
}
function isEmailConfigured() {
  return apiKey().length > 0;
}
function isLinkEmailConfigured() {
  return isEmailConfigured() && clientBaseUrl().length > 0 && fromAddress().length > 0;
}
function isPasswordResetEmailConfigured() {
  return isLinkEmailConfigured();
}
function isVerificationEmailConfigured() {
  return isLinkEmailConfigured();
}
function isSupportEmailConfigured() {
  return isEmailConfigured() && supportAddress().length > 0;
}
async function sendEmail(params) {
  const resend = new Resend(apiKey());
  const replyTo = params.replyTo ?? supportAddress();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...replyTo ? { replyTo } : {}
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? "unknown error"}`);
  }
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
async function sendVerificationEmail(email, name, token) {
  const link = `${clientBaseUrl()}/verify-email/${token}`;
  if (!isEmailConfigured()) {
    console.log(`[DEV] Email verification link for ${email}: ${link}`);
    return;
  }
  await sendEmail({
    to: email,
    subject: "Verifica il tuo account Family Sync",
    html: `<h1>Ciao ${name}!</h1><p><a href="${link}">Verifica Email</a></p>`
  });
}
async function sendPasswordResetEmail(email, name, token) {
  const link = `${clientBaseUrl()}/reset-password/${token}`;
  if (!isEmailConfigured()) {
    console.log(`[DEV] Password reset link for ${email}: ${link}`);
    return;
  }
  await sendEmail({
    to: email,
    subject: "Reset Password - Family Sync",
    html: `<h1>Ciao ${name}</h1><p><a href="${link}">Reset Password</a></p>`
  });
}
async function sendFamilyInviteEmail(email, familyName, inviterName, link, invitedName) {
  const greeting = invitedName ? `Ciao ${invitedName}!` : "Ciao!";
  if (!isEmailConfigured()) {
    console.log(`[DEV] Family invite email queued for ${email} (famiglia: ${familyName})`);
    return;
  }
  await sendEmail({
    to: email,
    subject: `${inviterName} ti ha invitato su FamilySync`,
    html: `
      <h1>${greeting}</h1>
      <p><strong>${inviterName}</strong> ti ha invitato a unirti alla famiglia <strong>${familyName}</strong> su FamilySync.</p>
      <p>Per accettare l'invito, apri questo link sicuro e crea la tua password:</p>
      <p><a href="${link}">Accetta l'invito</a></p>
      <p>Il link \xE8 personale, monouso e scade tra 72 ore. Non condividerlo con nessuno.</p>
      <p>Se non ti aspettavi questo invito, ignora questa email.</p>
    `
  });
}
async function sendSupportRequestEmail(params) {
  const support = supportAddress();
  if (!isSupportEmailConfigured()) {
    console.log(`[DEV] Richiesta assistenza da ${params.userEmail}: ${params.subject}`);
    return;
  }
  const name = escapeHtml(params.userName);
  const userEmail = escapeHtml(params.userEmail);
  const subject = escapeHtml(params.subject);
  const messageHtml = escapeHtml(params.message).replace(/\n/g, "<br/>");
  const safeSubject = params.subject.replace(/[\r\n]+/g, " ").trim();
  await sendEmail({
    to: support,
    replyTo: params.userEmail,
    subject: `[Assistenza] ${safeSubject}`,
    html: `
      <h2>Nuova richiesta di assistenza</h2>
      <p><strong>Da:</strong> ${name} &lt;${userEmail}&gt;</p>
      <p><strong>Oggetto:</strong> ${subject}</p>
      <hr/>
      <p>${messageHtml}</p>
      <hr/>
      <p style="color:#888;font-size:12px;">Rispondi a questa email per contattare direttamente l'utente.</p>
    `
  });
}

// server/routes/auth.ts
init_auth();
init_logger();
init_config();
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";

// server/lib/reset-token.ts
import { randomBytes as randomBytes2, createHash } from "crypto";
function generateResetToken() {
  return randomBytes2(32).toString("hex");
}
function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// server/lib/account-deletion.ts
init_db();
init_schema();
import { eq as eq6, and as and5, ne, or as or3 } from "drizzle-orm";
import bcrypt from "bcryptjs";

// server/lib/uploads-cleanup.ts
import fs from "fs/promises";
import path from "path";
var uploadsDir = path.resolve("uploads");
function resolveSafeUploadPath(fileUrl, baseDir = uploadsDir) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) {
    return null;
  }
  const filePath = path.resolve(fileUrl.replace(/^\/+/, ""));
  if (filePath === baseDir) return null;
  if (filePath.startsWith(baseDir + path.sep)) {
    return filePath;
  }
  return null;
}
async function deleteUploadFiles(fileUrls) {
  const result = { deleted: 0, missing: 0, failed: 0 };
  const safePaths = /* @__PURE__ */ new Set();
  for (const url of fileUrls) {
    if (!url) continue;
    const safe = resolveSafeUploadPath(url);
    if (safe) safePaths.add(safe);
  }
  for (const filePath of safePaths) {
    try {
      await fs.unlink(filePath);
      result.deleted++;
    } catch (error) {
      const code = error?.code;
      if (code === "ENOENT") {
        result.missing++;
      } else {
        result.failed++;
        console.error("Eliminazione file upload fallita", { code: code ?? "UNKNOWN" });
      }
    }
  }
  return result;
}

// server/lib/account-deletion.ts
async function deleteUserAccount(userId) {
  const filesToDelete = [];
  const summary = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq6(users.id, userId)).limit(1);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    filesToDelete.push(user.avatarUrl);
    let familiesDeleted = 0;
    let membershipsRemoved = 0;
    let ownershipTransfers = 0;
    const memberships = await tx.select().from(familyMembers).where(eq6(familyMembers.userId, userId));
    for (const membership of memberships) {
      const others = await tx.select().from(familyMembers).where(
        and5(
          eq6(familyMembers.familyId, membership.familyId),
          ne(familyMembers.userId, userId)
        )
      );
      if (others.length === 0) {
        const [familyRow] = await tx.select({ avatarUrl: families.avatarUrl }).from(families).where(eq6(families.id, membership.familyId)).limit(1);
        if (familyRow) filesToDelete.push(familyRow.avatarUrl);
        const chatFiles = await tx.select({ fileUrl: chatMessages.fileUrl }).from(chatMessages).where(eq6(chatMessages.familyId, membership.familyId));
        for (const c of chatFiles) filesToDelete.push(c.fileUrl);
        const attachmentFiles = await tx.select({ fileUrl: billAttachments.fileUrl }).from(billAttachments).where(eq6(billAttachments.familyId, membership.familyId));
        for (const a of attachmentFiles) filesToDelete.push(a.fileUrl);
        await tx.delete(families).where(eq6(families.id, membership.familyId));
        familiesDeleted++;
        continue;
      }
      if (membership.role === "admin") {
        const otherAdmins = others.filter((o) => o.role === "admin");
        if (otherAdmins.length === 0) {
          const successor = [...others].sort(
            (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
          )[0];
          await tx.update(familyMembers).set({ role: "admin" }).where(eq6(familyMembers.id, successor.id));
          ownershipTransfers++;
        }
      }
      await tx.delete(familyMembers).where(eq6(familyMembers.id, membership.id));
      membershipsRemoved++;
    }
    await tx.delete(pushTokens).where(eq6(pushTokens.userId, userId));
    await tx.delete(blocks).where(
      or3(eq6(blocks.blockerUserId, userId), eq6(blocks.blockedUserId, userId))
    );
    await tx.delete(familyInvites).where(
      or3(
        eq6(familyInvites.invitedBy, userId),
        eq6(familyInvites.acceptedByUserId, userId),
        eq6(familyInvites.email, user.email)
      )
    );
    await tx.delete(emailVerificationTokens).where(eq6(emailVerificationTokens.userId, userId));
    await tx.delete(passwordResetTokens).where(eq6(passwordResetTokens.userId, userId));
    await tx.update(entitlements).set({ userId: null }).where(eq6(entitlements.userId, userId));
    const scrambledHash = await bcrypt.hash(
      `deleted-${userId}-${Date.now()}-${Math.random()}`,
      12
    );
    await tx.update(users).set({
      email: `deleted-${userId}@deleted.familysync.invalid`,
      name: "Utente eliminato",
      passwordHash: scrambledHash,
      avatarUrl: null,
      emailVerified: false,
      aiFeaturesEnabled: false,
      deletedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq6(users.id, userId));
    return { familiesDeleted, membershipsRemoved, ownershipTransfers };
  });
  const cleanup3 = await deleteUploadFiles(filesToDelete);
  return { ...summary, filesDeleted: cleanup3.deleted };
}

// server/routes/auth.ts
init_entitlements();

// server/lib/oauth.ts
init_logger();
import crypto3 from "crypto";
import jwt2 from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
var isProduction2 = process.env.NODE_ENV === "production";
function deriveFromSessionSecret2(purpose) {
  const base = process.env.SESSION_SECRET;
  if (base && base.length > 0) {
    return crypto3.createHash("sha256").update(`${base}:${purpose}`).digest("hex");
  }
  return void 0;
}
function resolveSecret2(purpose, devFallback) {
  const derived = deriveFromSessionSecret2(purpose);
  if (derived) return derived;
  if (isProduction2) {
    throw new Error("[FATAL] SESSION_SECRET \xE8 obbligatoria in produzione per il login social.");
  }
  return devFallback;
}
var OAUTH_STATE_SECRET = resolveSecret2("oauth-state", "dev-oauth-state-secret");
var LOGIN_CODE_SECRET = resolveSecret2("oauth-login-code", "dev-oauth-code-secret");
function isGoogleLoginConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}
function getPublicBaseUrl() {
  if (isProduction2 && process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, "");
  return "http://localhost:5000";
}
function getGoogleRedirectUri() {
  return `${getPublicBaseUrl()}/api/auth/google/callback`;
}
function isAllowedReturnUrl(returnUrl) {
  if (!returnUrl || returnUrl.length > 2e3) return false;
  if (returnUrl.startsWith("myapp://")) return true;
  if (!isProduction2 && /^exp(\+[a-z0-9-]+)?:\/\//i.test(returnUrl)) return true;
  let parsed;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = /* @__PURE__ */ new Set();
  if (process.env.REPLIT_DEV_DOMAIN) allowedHosts.add(process.env.REPLIT_DEV_DOMAIN.toLowerCase());
  for (const envName of ["CLIENT_URL", "EXPO_PUBLIC_DOMAIN"]) {
    const v = process.env[envName];
    if (!v) continue;
    try {
      allowedHosts.add(new URL(v.startsWith("http") ? v : `https://${v}`).hostname.toLowerCase());
    } catch {
      allowedHosts.add(v.replace(/^https?:\/\//, "").split("/")[0].toLowerCase());
    }
  }
  if (!isProduction2) {
    allowedHosts.add("localhost");
    allowedHosts.add("127.0.0.1");
  }
  return allowedHosts.has(host);
}
function signOauthState(returnUrl) {
  return jwt2.sign({ returnUrl, purpose: "google-oauth-state" }, OAUTH_STATE_SECRET, {
    expiresIn: "10m"
  });
}
function verifyOauthState(state) {
  const decoded = jwt2.verify(state, OAUTH_STATE_SECRET);
  if (decoded.purpose !== "google-oauth-state" || !decoded.returnUrl) {
    throw new Error("Invalid oauth state");
  }
  return { returnUrl: decoded.returnUrl };
}
var consumedLoginCodes = /* @__PURE__ */ new Map();
var LOGIN_CODE_TTL_MS = 2 * 60 * 1e3;
function pruneConsumedCodes() {
  const now = Date.now();
  for (const [jti, expiresAt] of consumedLoginCodes) {
    if (expiresAt <= now) consumedLoginCodes.delete(jti);
  }
}
function signLoginCode(userId) {
  const jti = crypto3.randomUUID();
  return jwt2.sign({ userId, jti, purpose: "oauth-login-code" }, LOGIN_CODE_SECRET, {
    expiresIn: "2m"
  });
}
function verifyLoginCode(code) {
  const decoded = jwt2.verify(code, LOGIN_CODE_SECRET);
  if (decoded.purpose !== "oauth-login-code" || !decoded.userId || !decoded.jti) {
    throw new Error("Invalid login code");
  }
  pruneConsumedCodes();
  if (consumedLoginCodes.has(decoded.jti)) {
    throw new Error("Login code already used");
  }
  consumedLoginCodes.set(decoded.jti, Date.now() + LOGIN_CODE_TTL_MS);
  return { userId: decoded.userId };
}
var googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
async function exchangeGoogleCode(code) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code"
    })
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error("Google token exchange failed", { status: res.status, body: body.slice(0, 300) });
    throw new Error("Google token exchange failed");
  }
  const data = await res.json();
  if (!data.id_token) throw new Error("Google response missing id_token");
  const { payload } = await jwtVerify(data.id_token, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId
  });
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!email) throw new Error("Google id_token missing email");
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!emailVerified) throw new Error("Google email not verified");
  return {
    email,
    emailVerified: true,
    name: typeof payload.name === "string" ? payload.name : null
  };
}
var appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
var APPLE_AUDIENCES = ["com.familysyncapp.coordinator", "host.exp.Exponent"];
async function verifyAppleIdentityToken(identityToken) {
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: isProduction2 ? ["com.familysyncapp.coordinator"] : APPLE_AUDIENCES
  });
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!email) throw new Error("Apple identity token missing email");
  if (payload.email_verified === false || payload.email_verified === "false") {
    throw new Error("Apple email not verified");
  }
  return { email, emailVerified: true, name: null };
}

// server/routes/auth.ts
var router = Router();
var passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test"
});
var deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test"
});
var emailSchema = z.string().trim().toLowerCase().email("Email non valida");
var strongPasswordSchema = z.string().min(8, "La password deve avere almeno 8 caratteri").regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola").regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola").regex(/[0-9]/, "La password deve contenere almeno un numero");
var signupSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  name: z.string().min(1, "Il nome \xE8 obbligatorio").max(100),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Devi accettare Privacy Policy e Termini d'Uso" }) })
});
var loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La password \xE8 obbligatoria")
});
var requestPasswordResetSchema = z.object({
  email: emailSchema
});
var resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Token obbligatorio"),
  newPassword: strongPasswordSchema
});
var changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "La password attuale \xE8 obbligatoria"),
  newPassword: strongPasswordSchema
});
var deleteAccountSchema = z.object({
  password: z.string().min(1, "La password attuale \xE8 obbligatoria"),
  confirmation: z.string().min(1, "Conferma richiesta")
});
router.post("/signup", async (req, res) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { email, password, name } = parsed.data;
    const existing = await db.select().from(users).where(eq7(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: { code: "EMAIL_EXISTS", message: "Email gi\xE0 registrata" } });
    }
    const passwordHash = await bcrypt2.hash(password, 12);
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      name,
      emailVerified: false,
      termsAcceptedAt: /* @__PURE__ */ new Date()
    }).returning();
    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1e3);
    await db.insert(emailVerificationTokens).values({
      userId: newUser.id,
      token: verificationToken,
      expiresAt
    });
    if (!config.isProduction || isVerificationEmailConfigured()) {
      await sendVerificationEmail(email, name, verificationToken);
    } else {
      logger.warn("Verification email skipped: email service not fully configured", { userId: newUser.id });
    }
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    res.status(201).json({
      user: { id: newUser.id, email: newUser.email, name: newUser.name, emailVerified: false },
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error("Signup error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la registrazione" } });
  }
});
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { email, password } = parsed.data;
    const [user] = await db.select().from(users).where(eq7(users.email, email)).limit(1);
    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Credenziali non valide" } });
    }
    if (!user.passwordHash) {
      return res.status(401).json({
        error: { code: "SOCIAL_LOGIN_ONLY", message: "Questo account usa l'accesso con Google o Apple: usa il pulsante dedicato." }
      });
    }
    const validPassword = await bcrypt2.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Credenziali non valide" } });
    }
    await activatePendingTrialsForUser(user.id);
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
      accessToken,
      refreshToken
    });
  } catch (error) {
    logger.error("Login error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il login" } });
  }
});
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: { code: "MISSING_TOKEN", message: "Refresh token richiesto" } });
    }
    const payload = verifyRefreshToken(refreshToken);
    const [user] = await db.select().from(users).where(eq7(users.id, payload.userId)).limit(1);
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    const newAccessToken = generateAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token non valido" } });
  }
});
router.get("/me", authenticate, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq7(users.id, req.user.userId)).limit(1);
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified
    });
  } catch (error) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero utente" } });
  }
});
router.post("/change-password", authenticate, async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { currentPassword, newPassword } = parsed.data;
    const [user] = await db.select().from(users).where(eq7(users.id, req.user.userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    if (!user.passwordHash) {
      return res.status(400).json({
        error: { code: "SOCIAL_LOGIN_ONLY", message: "Questo account usa l'accesso con Google o Apple e non ha una password." }
      });
    }
    const validPassword = await bcrypt2.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: { code: "INVALID_PASSWORD", message: "La password attuale non \xE8 corretta" } });
    }
    const passwordHash = await bcrypt2.hash(newPassword, 12);
    await db.update(users).set({ passwordHash }).where(eq7(users.id, user.id));
    res.json({ message: "Password aggiornata con successo" });
  } catch (error) {
    logger.error("Change password error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il cambio password" } });
  }
});
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    const [tokenRecord] = await db.select().from(emailVerificationTokens).where(eq7(emailVerificationTokens.token, token)).limit(1);
    if (!tokenRecord) {
      return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Token non valido" } });
    }
    if (/* @__PURE__ */ new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: { code: "TOKEN_EXPIRED", message: "Token scaduto" } });
    }
    await db.update(users).set({ emailVerified: true }).where(eq7(users.id, tokenRecord.userId));
    await db.delete(emailVerificationTokens).where(eq7(emailVerificationTokens.token, token));
    res.json({ message: "Email verificata con successo" });
  } catch (error) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica" } });
  }
});
router.post("/resend-verification-email", authenticate, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq7(users.id, req.user.userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    if (user.emailVerified) {
      return res.json({ message: "Email gi\xE0 verificata" });
    }
    if (config.isProduction && !isVerificationEmailConfigured()) {
      return res.status(503).json({ error: { code: "EMAIL_NOT_CONFIGURED", message: "Servizio email non configurato (Resend e CLIENT_URL richiesti)" } });
    }
    await db.delete(emailVerificationTokens).where(eq7(emailVerificationTokens.userId, user.id));
    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1e3);
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      token: verificationToken,
      expiresAt
    });
    await sendVerificationEmail(user.email, user.name, verificationToken);
    res.json({ message: "Email di verifica inviata" });
  } catch (error) {
    logger.error("Resend verification error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'invio" } });
  }
});
router.post("/media-token", authenticate, requireEmailVerified, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rawFilePath = typeof req.body?.filePath === "string" ? req.body.filePath.trim() : "";
    let filePath;
    if (rawFilePath.length > 0) {
      const isValid = /^\/?uploads\/[A-Za-z0-9._\-/]+$/.test(rawFilePath) && !rawFilePath.includes("..");
      if (!isValid) {
        return res.status(400).json({ error: { code: "INVALID_FILE_PATH", message: "Percorso file non valido" } });
      }
      filePath = rawFilePath;
    }
    const familyId = typeof req.body?.familyId === "string" && req.body.familyId.trim().length > 0 ? req.body.familyId.trim() : void 0;
    if (!filePath && !familyId) {
      return res.status(400).json({ error: { code: "MISSING_SCOPE", message: "Specifica filePath o familyId" } });
    }
    if (filePath) {
      const fileFamilyId = await resolveUploadFileAccess(userId, filePath);
      if (!fileFamilyId) {
        return res.status(403).json({ error: { code: "NOT_AUTHORIZED", message: "Non hai i permessi per accedere a questo file" } });
      }
    }
    if (familyId) {
      const isMember = await userIsFamilyMember(userId, familyId);
      if (!isMember) {
        return res.status(403).json({ error: { code: "NOT_AUTHORIZED", message: "Non fai parte di questa famiglia" } });
      }
    }
    const mediaToken = generateMediaToken(userId, { familyId, filePath });
    res.json({ mediaToken, expiresIn: 300 });
  } catch (error) {
    logger.error("Media token error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la generazione del token" } });
  }
});
router.post("/request-password-reset", passwordResetLimiter, async (req, res) => {
  try {
    const parsed = requestPasswordResetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    if (config.isProduction && !isPasswordResetEmailConfigured()) {
      return res.status(503).json({ error: { code: "EMAIL_NOT_CONFIGURED", message: "Servizio email non configurato (Resend e CLIENT_URL richiesti)" } });
    }
    const { email } = parsed.data;
    const genericMessage = { message: "Se l'email esiste, riceverai un link" };
    const [user] = await db.select().from(users).where(eq7(users.email, email)).limit(1);
    if (!user) {
      return res.json(genericMessage);
    }
    await db.delete(passwordResetTokens).where(eq7(passwordResetTokens.userId, user.id));
    const rawToken = generateResetToken();
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: tokenHash,
      expiresAt
    });
    try {
      await sendPasswordResetEmail(email, user.name, rawToken);
    } catch (mailError) {
      logger.error("Password reset email send failed", { error: String(mailError) });
    }
    return res.json(genericMessage);
  } catch (error) {
    logger.error("Request password reset error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la richiesta" } });
  }
});
router.post("/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { token, newPassword } = parsed.data;
    const tokenHash = hashResetToken(token);
    const [claimed] = await db.delete(passwordResetTokens).where(eq7(passwordResetTokens.token, tokenHash)).returning();
    if (!claimed) {
      return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o gi\xE0 utilizzato" } });
    }
    if (/* @__PURE__ */ new Date() > claimed.expiresAt) {
      return res.status(400).json({ error: { code: "TOKEN_EXPIRED", message: "Token scaduto" } });
    }
    const passwordHash = await bcrypt2.hash(newPassword, 12);
    await db.update(users).set({ passwordHash }).where(eq7(users.id, claimed.userId));
    res.json({ message: "Password reimpostata con successo" });
  } catch (error) {
    logger.error("Reset password error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il reset" } });
  }
});
router.delete("/account", deleteAccountLimiter, authenticate, async (req, res) => {
  try {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { password, confirmation } = parsed.data;
    if (confirmation.trim().toUpperCase() !== "ELIMINA") {
      return res.status(400).json({
        error: { code: "INVALID_CONFIRMATION", message: 'Digita "ELIMINA" per confermare' }
      });
    }
    const [user] = await db.select().from(users).where(eq7(users.id, req.user.userId)).limit(1);
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    if (user.passwordHash) {
      const validPassword = await bcrypt2.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ error: { code: "INVALID_PASSWORD", message: "La password attuale non \xE8 corretta" } });
      }
    }
    const summary = await deleteUserAccount(user.id);
    res.json({
      message: "Account eliminato con successo",
      familiesDeleted: summary.familiesDeleted,
      membershipsRemoved: summary.membershipsRemoved,
      ownershipTransfers: summary.ownershipTransfers,
      filesDeleted: summary.filesDeleted
    });
  } catch (error) {
    logger.error("Delete account error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'eliminazione dell'account" } });
  }
});
var socialLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test"
});
async function upsertSocialUser(profile, provider) {
  const [existing] = await db.select().from(users).where(eq7(users.email, profile.email)).limit(1);
  if (existing) {
    if (existing.deletedAt) {
      throw Object.assign(new Error("ACCOUNT_DELETED"), { code: "ACCOUNT_DELETED" });
    }
    if (!existing.emailVerified) {
      await db.update(users).set({ emailVerified: true }).where(eq7(users.id, existing.id));
      existing.emailVerified = true;
    }
    return existing;
  }
  const [created] = await db.insert(users).values({
    email: profile.email,
    passwordHash: null,
    authProvider: provider,
    name: profile.name || profile.email.split("@")[0],
    emailVerified: true,
    termsAcceptedAt: /* @__PURE__ */ new Date()
  }).returning();
  return created;
}
function issueSessionResponse(user) {
  return {
    user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user)
  };
}
router.get("/google/start", socialLoginLimiter, (req, res) => {
  if (!isGoogleLoginConfigured()) {
    return res.status(503).send("Accesso con Google non configurato.");
  }
  const returnUrl = typeof req.query.returnUrl === "string" ? req.query.returnUrl : "";
  if (!isAllowedReturnUrl(returnUrl)) {
    return res.status(400).send("returnUrl non valido.");
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: signOauthState(returnUrl),
    prompt: "select_account"
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});
router.get("/google/callback", socialLoginLimiter, async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) {
      return res.status(400).send("Richiesta non valida.");
    }
    const { returnUrl } = verifyOauthState(state);
    if (!isAllowedReturnUrl(returnUrl)) {
      return res.status(400).send("returnUrl non valido.");
    }
    const profile = await exchangeGoogleCode(code);
    const user = await upsertSocialUser(profile, "google");
    await activatePendingTrialsForUser(user.id);
    const loginCode = signLoginCode(user.id);
    const sep = returnUrl.includes("?") ? "&" : "?";
    res.redirect(`${returnUrl}${sep}loginCode=${encodeURIComponent(loginCode)}`);
  } catch (error) {
    if (error?.code === "ACCOUNT_DELETED") {
      return res.status(403).send("Questo account \xE8 stato eliminato.");
    }
    logger.error("Google OAuth callback error", { error: String(error) });
    res.status(500).send("Errore durante l'accesso con Google. Riprova.");
  }
});
router.post("/oauth/complete", socialLoginLimiter, async (req, res) => {
  try {
    const code = typeof req.body?.loginCode === "string" ? req.body.loginCode : "";
    if (!code) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "loginCode obbligatorio" } });
    }
    const { userId } = verifyLoginCode(code);
    const [user] = await db.select().from(users).where(eq7(users.id, userId)).limit(1);
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: { code: "INVALID_CODE", message: "Codice di accesso non valido" } });
    }
    res.json(issueSessionResponse(user));
  } catch (error) {
    logger.warn("OAuth complete error", { error: String(error) });
    res.status(401).json({ error: { code: "INVALID_CODE", message: "Codice di accesso scaduto o non valido" } });
  }
});
router.post("/apple", socialLoginLimiter, async (req, res) => {
  try {
    const identityToken = typeof req.body?.identityToken === "string" ? req.body.identityToken : "";
    if (!identityToken) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "identityToken obbligatorio" } });
    }
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim().slice(0, 100) : "";
    const profile = await verifyAppleIdentityToken(identityToken);
    if (fullName) profile.name = fullName;
    const user = await upsertSocialUser(profile, "apple");
    await activatePendingTrialsForUser(user.id);
    res.json(issueSessionResponse(user));
  } catch (error) {
    if (error?.code === "ACCOUNT_DELETED") {
      return res.status(403).json({ error: { code: "ACCOUNT_DELETED", message: "Questo account \xE8 stato eliminato" } });
    }
    logger.warn("Apple login error", { error: String(error) });
    res.status(401).json({ error: { code: "INVALID_APPLE_TOKEN", message: "Accesso con Apple non riuscito. Riprova." } });
  }
});
router.get("/social-config", (_req, res) => {
  res.json({ google: isGoogleLoginConfigured(), apple: true });
});
var auth_default = router;

// server/routes/families.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
import { Router as Router2 } from "express";
import rateLimit2 from "express-rate-limit";
import { z as z2 } from "zod";
import { eq as eq9, and as and7, isNull as isNull2, sql as sql3 } from "drizzle-orm";
init_websocket();
init_config();
init_logger();

// server/lib/invite-token.ts
import { randomBytes as randomBytes3, createHash as createHash2 } from "crypto";
function generateInviteToken() {
  return randomBytes3(32).toString("hex");
}
function hashInviteToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}
function generateJoinCode() {
  return randomBytes3(16).toString("base64url");
}

// server/routes/families.ts
init_entitlements();
var router2 = Router2();
var createFamilySchema = z2.object({
  name: z2.string().min(1, "Il nome \xE8 obbligatorio").max(50),
  colorTheme: z2.string().optional().default("#6366F1")
});
var updateFamilySchema = z2.object({
  name: z2.string().min(2, "Il nome deve avere almeno 2 caratteri").max(50).optional(),
  colorTheme: z2.string().optional()
});
var inviteSchema = z2.object({
  email: z2.string().trim().toLowerCase().email("Email non valida"),
  invitedName: z2.string().trim().max(255).optional(),
  role: z2.enum(["admin", "adult", "teen", "child"]).optional().default("adult")
});
var INVITE_TTL_MS = 72 * 60 * 60 * 1e3;
var createInviteLimiter = rateLimit2({
  windowMs: 15 * 60 * 1e3,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});
router2.post("/", authenticate, async (req, res) => {
  try {
    const parsed = createFamilySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const [family] = await db.insert(families).values({
      name: parsed.data.name,
      colorTheme: parsed.data.colorTheme
    }).returning();
    await db.insert(familyMembers).values({
      familyId: family.id,
      userId: req.user.userId,
      role: "admin",
      nickname: "Admin",
      color: "#6366F1",
      points: 0
    });
    res.status(201).json(family);
  } catch (error) {
    logger.error("Create family error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della famiglia" } });
  }
});
router2.get("/", authenticate, async (req, res) => {
  try {
    const myFamilies = await db.select({ family: families, member: familyMembers }).from(familyMembers).innerJoin(families, eq9(familyMembers.familyId, families.id)).where(eq9(familyMembers.userId, req.user.userId));
    res.json(myFamilies.map((f) => ({ ...f.family, myRole: f.member.role, myMemberId: f.member.id })));
  } catch (error) {
    logger.error("Get families error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero delle famiglie" } });
  }
});
router2.get("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const [family] = await db.select().from(families).where(eq9(families.id, familyId)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }
    const members = await db.select({ member: familyMembers, user: users }).from(familyMembers).innerJoin(users, eq9(familyMembers.userId, users.id)).where(eq9(familyMembers.familyId, familyId));
    const [eventsCount] = await db.select({ count: sql3`count(*)::int` }).from(calendarEvents).where(and7(eq9(calendarEvents.familyId, familyId), isNull2(calendarEvents.createdBy)));
    const [itemsCount] = await db.select({ count: sql3`count(*)::int` }).from(shoppingItems).innerJoin(shoppingLists, eq9(shoppingItems.listId, shoppingLists.id)).where(and7(eq9(shoppingLists.familyId, familyId), isNull2(shoppingItems.createdBy)));
    const [choresCount] = await db.select({ count: sql3`count(*)::int` }).from(chores).where(and7(eq9(chores.familyId, familyId), isNull2(chores.createdBy)));
    console.log(JSON.stringify({
      tag: "LEGACY_NULL_CREATED_BY",
      familyId,
      counts: { events: eventsCount.count, shoppingItems: itemsCount.count, chores: choresCount.count }
    }));
    res.json({
      ...family,
      members: members.map((m) => ({
        id: m.member.id,
        userId: m.user.id,
        name: m.user.name,
        nickname: m.member.nickname,
        role: m.member.role,
        color: m.member.color,
        points: m.member.points,
        avatarUrl: m.user.avatarUrl
      }))
    });
  } catch (error) {
    logger.error("Get family detail error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero della famiglia" } });
  }
});
router2.put("/:familyId", authenticate, requireFamilyAdmin(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = updateFamilySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const [updatedFamily] = await db.update(families).set({ ...parsed.data, updatedAt: /* @__PURE__ */ new Date() }).where(eq9(families.id, familyId)).returning();
    broadcastToFamily(familyId, "family_updated", updatedFamily);
    res.json(updatedFamily);
  } catch (error) {
    logger.error("Update family error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento della famiglia" } });
  }
});
router2.post("/:familyId/invite", createInviteLimiter, authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { email, invitedName, role } = parsed.data;
    const inviterRole = req.membership?.role;
    const effectiveRole = role === "admin" && inviterRole !== "admin" ? "adult" : role;
    if (config.isProduction && !isEmailConfigured()) {
      return res.status(503).json({
        error: { code: "EMAIL_NOT_CONFIGURED", message: "Il servizio email non \xE8 configurato. Impossibile inviare l'invito." }
      });
    }
    const [family] = await db.select().from(families).where(eq9(families.id, familyId)).limit(1);
    const [inviter] = await db.select().from(users).where(eq9(users.id, req.user.userId)).limit(1);
    const [existingUser] = await db.select().from(users).where(eq9(users.email, email)).limit(1);
    if (existingUser) {
      const [alreadyMember] = await db.select().from(familyMembers).where(and7(eq9(familyMembers.familyId, familyId), eq9(familyMembers.userId, existingUser.id))).limit(1);
      if (alreadyMember) {
        return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Questa persona fa gi\xE0 parte della famiglia" } });
      }
    }
    if (await isFamilyMemberLimitReached(familyId)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Il piano Free consente al massimo ${FREE_MAX_FAMILY_MEMBERS} membri. Passa a Premium per aggiungere altri familiari.`
        }
      });
    }
    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const [createdInvite] = await db.insert(familyInvites).values({
      familyId,
      tokenHash,
      email,
      invitedName: invitedName || null,
      invitedBy: req.user.userId,
      role: effectiveRole,
      expiresAt
    }).returning();
    const baseUrl = process.env.CLIENT_URL || config.getBaseUrl(req);
    const inviteLink = `${baseUrl}/join/${token}`;
    try {
      await sendFamilyInviteEmail(email, family.name, inviter.name, inviteLink, invitedName);
    } catch (mailError) {
      logger.error("Invite email send failed", { error: String(mailError) });
      if (config.isProduction) {
        await db.delete(familyInvites).where(eq9(familyInvites.id, createdInvite.id));
        return res.status(502).json({
          error: { code: "EMAIL_SEND_FAILED", message: "Invio email fallito. Riprova pi\xF9 tardi." }
        });
      }
    }
    logger.info("Family invite created", { familyId, role });
    const response = { ok: true, email, expiresAt, inviteLink };
    res.json(response);
  } catch (error) {
    logger.error("Create invite error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione dell'invito" } });
  }
});
router2.post("/:familyId/invite-link", authenticate, requireFamilyMember(), createInviteLimiter, async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const [family] = await db.select().from(families).where(eq9(families.id, familyId)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }
    let code = family.inviteCode;
    if (!code) {
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = generateJoinCode();
        try {
          const [updated] = await db.update(families).set({ inviteCode: candidate }).where(and7(eq9(families.id, familyId), isNull2(families.inviteCode))).returning();
          if (updated?.inviteCode) {
            code = updated.inviteCode;
          } else {
            const [refreshed] = await db.select().from(families).where(eq9(families.id, familyId)).limit(1);
            code = refreshed?.inviteCode ?? null;
          }
        } catch {
        }
      }
    }
    if (!code) {
      return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Impossibile generare il link di invito" } });
    }
    const baseUrl = process.env.CLIENT_URL || config.getBaseUrl(req);
    const inviteLink = `${baseUrl}/join-link/${code}`;
    logger.info("Family invite-link retrieved", { familyId });
    res.json({ ok: true, inviteLink, code, familyName: family.name });
  } catch (error) {
    logger.error("Get invite-link error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero del link di invito" } });
  }
});
router2.post("/join-link/:code", authenticate, async (req, res) => {
  try {
    const code = getParam(req, "code");
    const { nickname, color } = req.body;
    const [family] = await db.select().from(families).where(eq9(families.inviteCode, code)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Link di invito non valido" } });
    }
    const [currentUser] = await db.select().from(users).where(eq9(users.id, req.user.userId)).limit(1);
    if (!currentUser) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Utente non trovato" } });
    }
    const existing = await db.select().from(familyMembers).where(and7(eq9(familyMembers.familyId, family.id), eq9(familyMembers.userId, req.user.userId))).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Fai gi\xE0 parte di questa famiglia" } });
    }
    let txResult;
    try {
      txResult = await db.transaction(async (tx) => {
        if (await isFamilyMemberLimitReachedTx(tx, family.id)) {
          return { limitReached: true };
        }
        const [member] = await tx.insert(familyMembers).values({
          familyId: family.id,
          userId: req.user.userId,
          role: "adult",
          nickname: nickname || currentUser.name || "Membro",
          color: color || "#6366F1",
          points: 0
        }).returning();
        return { limitReached: false, member };
      });
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Fai gi\xE0 parte di questa famiglia" } });
      }
      throw err;
    }
    if (txResult.limitReached) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`
        }
      });
    }
    broadcastToFamily(family.id, "member_joined", txResult.member);
    res.json({ message: "Sei entrato nella famiglia!", family });
  } catch (error) {
    logger.error("Join via invite-link error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});
router2.post("/join/:token", authenticate, async (req, res) => {
  try {
    const token = getParam(req, "token");
    const { nickname, color } = req.body;
    const tokenHash = hashInviteToken(token);
    const [invite] = await db.select().from(familyInvites).where(eq9(familyInvites.tokenHash, tokenHash)).limit(1);
    if (!invite) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Invito non trovato" } });
    }
    if (invite.acceptedAt) {
      return res.status(409).json({ error: { code: "ALREADY_ACCEPTED", message: "Invito gi\xE0 accettato" } });
    }
    if (/* @__PURE__ */ new Date() > invite.expiresAt) {
      return res.status(400).json({ error: { code: "INVITE_EXPIRED", message: "Invito scaduto" } });
    }
    const [currentUser] = await db.select().from(users).where(eq9(users.id, req.user.userId)).limit(1);
    if (!currentUser || currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({
        error: { code: "EMAIL_MISMATCH", message: "Questo invito \xE8 destinato a un altro indirizzo email" }
      });
    }
    const existing = await db.select().from(familyMembers).where(and7(eq9(familyMembers.familyId, invite.familyId), eq9(familyMembers.userId, req.user.userId))).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Fai gi\xE0 parte di questa famiglia" } });
    }
    if (await isFamilyMemberLimitReached(invite.familyId)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`
        }
      });
    }
    const txResult = await db.transaction(async (tx) => {
      if (await isFamilyMemberLimitReachedTx(tx, invite.familyId)) {
        return { limitReached: true };
      }
      const claimed = await tx.update(familyInvites).set({ acceptedAt: /* @__PURE__ */ new Date(), acceptedByUserId: req.user.userId }).where(and7(eq9(familyInvites.id, invite.id), isNull2(familyInvites.acceptedAt))).returning();
      if (claimed.length === 0) {
        return { conflict: true };
      }
      const [member] = await tx.insert(familyMembers).values({
        familyId: invite.familyId,
        userId: req.user.userId,
        role: invite.role,
        nickname: nickname || invite.invitedName || currentUser.name || "Membro",
        color: color || "#6366F1",
        points: 0
      }).returning();
      return { conflict: false, member };
    });
    if (txResult.limitReached) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`
        }
      });
    }
    if (txResult.conflict) {
      return res.status(409).json({ error: { code: "ALREADY_ACCEPTED", message: "Invito gi\xE0 accettato" } });
    }
    const newMember = txResult.member;
    const [family] = await db.select().from(families).where(eq9(families.id, invite.familyId)).limit(1);
    broadcastToFamily(invite.familyId, "member_joined", newMember);
    res.json({ message: "Invito accettato!", family });
  } catch (error) {
    logger.error("Accept invite error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});
router2.put("/:familyId/members/:memberId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const memberId = getParam(req, "memberId");
    const { nickname, color, role } = req.body;
    const membership = req.membership;
    const [target] = await db.select().from(familyMembers).where(and7(eq9(familyMembers.id, memberId), eq9(familyMembers.familyId, familyId))).limit(1);
    if (!target) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Membro non trovato" } });
    }
    const isSelf = target.userId === req.user.userId;
    if (!isSelf && membership.role !== "admin") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Puoi modificare solo il tuo profilo" } });
    }
    const updateData = {};
    if (nickname !== void 0) updateData.nickname = nickname || null;
    if (color) updateData.color = color;
    if (role && membership.role === "admin") {
      updateData.role = role;
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: { code: "NO_CHANGES", message: "Nessuna modifica fornita" } });
    }
    const [updated] = await db.update(familyMembers).set(updateData).where(and7(eq9(familyMembers.id, memberId), eq9(familyMembers.familyId, familyId))).returning();
    broadcastToFamily(familyId, "member_updated", updated);
    res.json(updated);
  } catch (error) {
    logger.error("Update member error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento del membro" } });
  }
});
router2.delete("/:familyId/members/:memberId", authenticate, requireFamilyAdmin(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const memberId = getParam(req, "memberId");
    await db.delete(familyMembers).where(and7(eq9(familyMembers.id, memberId), eq9(familyMembers.familyId, familyId)));
    broadcastToFamily(familyId, "member_removed", { memberId });
    res.json({ message: "Membro rimosso" });
  } catch (error) {
    logger.error("Remove member error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione del membro" } });
  }
});
var families_default = router2;

// server/routes/invites.ts
init_http_params();
init_db();
init_schema();
init_jwt();
import { Router as Router3 } from "express";
import { z as z3 } from "zod";
import bcrypt3 from "bcryptjs";
import rateLimit3 from "express-rate-limit";
import { eq as eq10, and as and8, isNull as isNull3 } from "drizzle-orm";
init_entitlements();
init_websocket();
init_logger();
var router3 = Router3();
var inviteLimiter = rateLimit3({
  windowMs: 15 * 60 * 1e3,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Troppe richieste. Riprova pi\xF9 tardi." } }
});
var strongPasswordSchema2 = z3.string().min(8, "La password deve avere almeno 8 caratteri").regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola").regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola").regex(/[0-9]/, "La password deve contenere almeno un numero");
var acceptSchema = z3.object({
  name: z3.string().trim().min(2, "Il nome deve avere almeno 2 caratteri").max(255).optional(),
  password: strongPasswordSchema2,
  acceptedTerms: z3.literal(true)
});
router3.get("/:token", async (req, res) => {
  try {
    const token = getParam(req, "token");
    const tokenHash = hashInviteToken(token);
    const [invite] = await db.select().from(familyInvites).where(eq10(familyInvites.tokenHash, tokenHash)).limit(1);
    if (!invite) {
      return res.status(404).json({ status: "not_found" });
    }
    const [family] = await db.select().from(families).where(eq10(families.id, invite.familyId)).limit(1);
    const [existingUser] = await db.select().from(users).where(eq10(users.email, invite.email)).limit(1);
    let status = "valid";
    if (invite.acceptedAt) {
      status = "accepted";
    } else if (/* @__PURE__ */ new Date() > invite.expiresAt) {
      status = "expired";
    }
    res.json({
      status,
      email: invite.email,
      invitedName: invite.invitedName,
      familyName: family?.name ?? null,
      userExists: !!existingUser,
      expiresAt: invite.expiresAt
    });
  } catch (error) {
    logger.error("Get invite error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero dell'invito" } });
  }
});
router3.post("/:token/accept", async (req, res) => {
  try {
    const token = getParam(req, "token");
    const tokenHash = hashInviteToken(token);
    if (req.body?.acceptedTerms !== true) {
      return res.status(400).json({
        error: { code: "TERMS_REQUIRED", message: "Devi accettare i Termini di servizio e la Privacy Policy" }
      });
    }
    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const [invite] = await db.select().from(familyInvites).where(eq10(familyInvites.tokenHash, tokenHash)).limit(1);
    if (!invite) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Invito non trovato" } });
    }
    if (invite.acceptedAt) {
      return res.status(409).json({ error: { code: "ALREADY_ACCEPTED", message: "Invito gi\xE0 accettato" } });
    }
    if (/* @__PURE__ */ new Date() > invite.expiresAt) {
      return res.status(400).json({ error: { code: "INVITE_EXPIRED", message: "Invito scaduto" } });
    }
    const [existingUser] = await db.select().from(users).where(eq10(users.email, invite.email)).limit(1);
    if (existingUser) {
      return res.status(409).json({
        error: { code: "USER_EXISTS", message: "Esiste gi\xE0 un account con questa email. Accedi per accettare l'invito." }
      });
    }
    if (await isFamilyMemberLimitReached(invite.familyId)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`
        }
      });
    }
    const passwordHash = await bcrypt3.hash(parsed.data.password, 12);
    const name = parsed.data.name || invite.invitedName || invite.email.split("@")[0];
    let createdUser;
    let createdMember;
    try {
      const result = await db.transaction(async (tx) => {
        if (await isFamilyMemberLimitReachedTx(tx, invite.familyId)) {
          throw new Error("MEMBER_LIMIT_REACHED");
        }
        const claimed = await tx.update(familyInvites).set({ acceptedAt: /* @__PURE__ */ new Date() }).where(and8(eq10(familyInvites.id, invite.id), isNull3(familyInvites.acceptedAt))).returning();
        if (claimed.length === 0) {
          throw new Error("INVITE_RACE");
        }
        const [user] = await tx.insert(users).values({
          email: invite.email,
          passwordHash,
          name,
          emailVerified: true,
          termsAcceptedAt: /* @__PURE__ */ new Date()
        }).returning();
        const [member] = await tx.insert(familyMembers).values({
          familyId: invite.familyId,
          userId: user.id,
          role: invite.role,
          nickname: invite.invitedName || name,
          color: "#6366F1",
          points: 0
        }).returning();
        await tx.update(familyInvites).set({ acceptedByUserId: user.id }).where(eq10(familyInvites.id, invite.id));
        return { user, member };
      });
      createdUser = result.user;
      createdMember = result.member;
    } catch (txError) {
      if (txError?.message === "MEMBER_LIMIT_REACHED") {
        return res.status(403).json({
          error: {
            code: "MEMBER_LIMIT_REACHED",
            message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`
          }
        });
      }
      if (txError?.message === "INVITE_RACE") {
        return res.status(409).json({ error: { code: "ALREADY_ACCEPTED", message: "Invito gi\xE0 accettato" } });
      }
      if (txError?.code === "23505") {
        return res.status(409).json({ error: { code: "USER_EXISTS", message: "Esiste gi\xE0 un account con questa email" } });
      }
      throw txError;
    }
    const [family] = await db.select().from(families).where(eq10(families.id, invite.familyId)).limit(1);
    broadcastToFamily(invite.familyId, "member_joined", createdMember);
    const accessToken = generateAccessToken(createdUser);
    const refreshToken = generateRefreshToken(createdUser);
    res.status(201).json({
      user: { id: createdUser.id, email: createdUser.email, name: createdUser.name, emailVerified: true },
      accessToken,
      refreshToken,
      family
    });
  } catch (error) {
    logger.error("Accept invite (public) error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});
var invites_default = router3;

// server/routes/join-link.ts
init_http_params();
init_db();
init_schema();
init_jwt();
init_entitlements();
init_websocket();
init_logger();
import { Router as Router4 } from "express";
import { z as z4 } from "zod";
import bcrypt4 from "bcryptjs";
import rateLimit4 from "express-rate-limit";
import { eq as eq11 } from "drizzle-orm";
var router4 = Router4();
var joinLinkLimiter = rateLimit4({
  windowMs: 15 * 60 * 1e3,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Troppe richieste. Riprova pi\xF9 tardi." } }
});
var strongPasswordSchema3 = z4.string().min(8, "La password deve avere almeno 8 caratteri").regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola").regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola").regex(/[0-9]/, "La password deve contenere almeno un numero");
var acceptSchema2 = z4.object({
  email: z4.string().trim().toLowerCase().email("Email non valida"),
  name: z4.string().trim().min(2, "Il nome deve avere almeno 2 caratteri").max(255),
  password: strongPasswordSchema3,
  acceptedTerms: z4.literal(true)
});
router4.get("/:code", async (req, res) => {
  try {
    const code = getParam(req, "code");
    const [family] = await db.select().from(families).where(eq11(families.inviteCode, code)).limit(1);
    if (!family) {
      return res.status(404).json({ status: "not_found" });
    }
    const full = await isFamilyMemberLimitReached(family.id);
    res.json({
      status: full ? "full" : "valid",
      familyName: family.name,
      memberLimitReached: full
    });
  } catch (error) {
    logger.error("Get join-link error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero del link" } });
  }
});
router4.post("/:code/accept", async (req, res) => {
  try {
    const code = getParam(req, "code");
    if (req.body?.acceptedTerms !== true) {
      return res.status(400).json({
        error: { code: "TERMS_REQUIRED", message: "Devi accettare i Termini di servizio e la Privacy Policy" }
      });
    }
    const parsed = acceptSchema2.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { email, name, password } = parsed.data;
    const [family] = await db.select().from(families).where(eq11(families.inviteCode, code)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Link di invito non valido" } });
    }
    const [existingUser] = await db.select().from(users).where(eq11(users.email, email)).limit(1);
    if (existingUser) {
      return res.status(409).json({
        error: { code: "USER_EXISTS", message: "Esiste gi\xE0 un account con questa email. Accedi per entrare nella famiglia." }
      });
    }
    if (await isFamilyMemberLimitReached(family.id)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`
        }
      });
    }
    const passwordHash = await bcrypt4.hash(password, 12);
    let createdUser;
    let createdMember;
    try {
      const result = await db.transaction(async (tx) => {
        if (await isFamilyMemberLimitReachedTx(tx, family.id)) {
          throw new Error("MEMBER_LIMIT_REACHED");
        }
        const [user] = await tx.insert(users).values({
          email,
          passwordHash,
          name,
          emailVerified: true,
          termsAcceptedAt: /* @__PURE__ */ new Date()
        }).returning();
        const [member] = await tx.insert(familyMembers).values({
          familyId: family.id,
          userId: user.id,
          role: "adult",
          nickname: name,
          color: "#6366F1",
          points: 0
        }).returning();
        return { user, member };
      });
      createdUser = result.user;
      createdMember = result.member;
    } catch (txError) {
      if (txError?.message === "MEMBER_LIMIT_REACHED") {
        return res.status(403).json({
          error: {
            code: "MEMBER_LIMIT_REACHED",
            message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`
          }
        });
      }
      if (txError?.code === "23505") {
        return res.status(409).json({ error: { code: "USER_EXISTS", message: "Esiste gi\xE0 un account con questa email" } });
      }
      throw txError;
    }
    broadcastToFamily(family.id, "member_joined", createdMember);
    const accessToken = generateAccessToken(createdUser);
    const refreshToken = generateRefreshToken(createdUser);
    res.status(201).json({
      user: { id: createdUser.id, email: createdUser.email, name: createdUser.name, emailVerified: true },
      accessToken,
      refreshToken,
      family
    });
  } catch (error) {
    logger.error("Accept join-link (public) error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});
var join_link_default = router4;

// server/routes/calendar.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
init_websocket();
import { Router as Router5 } from "express";
import { randomBytes as randomBytes4 } from "crypto";
import { z as z5 } from "zod";
import { eq as eq14, and as and11, gte as gte2, lte } from "drizzle-orm";

// server/lib/push.ts
init_db();
init_schema();
init_logger();
import { eq as eq12, inArray as inArray2 } from "drizzle-orm";
var EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
function isExpoPushToken(token) {
  return typeof token === "string" && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
}
async function sendToTokens(validTokens, payload) {
  if (validTokens.length === 0) return;
  const messages = validTokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: "default"
  }));
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messages)
  });
  if (!res.ok) {
    logger.error("Expo push send failed", { status: res.status });
    return;
  }
  const result = await res.json();
  const tickets = Array.isArray(result?.data) ? result.data : [];
  const invalidTokens = [];
  tickets.forEach((ticket, i) => {
    if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
      invalidTokens.push(validTokens[i]);
    }
  });
  if (invalidTokens.length > 0) {
    await db.delete(pushTokens).where(inArray2(pushTokens.token, invalidTokens));
  }
}
async function sendPushToFamily(familyId, payload, opts) {
  try {
    const excluded = new Set(opts?.excludeUserIds ?? []);
    const members = await db.select({ userId: familyMembers.userId }).from(familyMembers).where(eq12(familyMembers.familyId, familyId));
    const targetIds = members.map((m) => m.userId).filter((id) => !excluded.has(id));
    if (targetIds.length === 0) return;
    const tokens = await db.select({ token: pushTokens.token }).from(pushTokens).where(inArray2(pushTokens.userId, targetIds));
    const validTokens = tokens.map((t) => t.token).filter((t) => isExpoPushToken(t));
    await sendToTokens(validTokens, payload);
  } catch (error) {
    logger.error("sendPushToFamily error", { error: String(error) });
  }
}
async function sendPushToUser(userId, payload) {
  try {
    const tokens = await db.select({ token: pushTokens.token }).from(pushTokens).where(eq12(pushTokens.userId, userId));
    const validTokens = tokens.map((t) => t.token).filter((t) => isExpoPushToken(t));
    await sendToTokens(validTokens, payload);
  } catch (error) {
    logger.error("sendPushToUser error", { error: String(error) });
  }
}

// server/routes/calendar.ts
init_block_filter();
init_logger();

// server/lib/base-usage.ts
init_db();
init_schema();
init_logger();
init_entitlements();
import { and as and10, eq as eq13, gte, sql as sql4 } from "drizzle-orm";
var BASE_FREE_DAILY_LIMIT = 5;
var FEATURE_PREFIX = "base:";
var BASE_LABELS = {
  "calendar-event": "eventi del calendario",
  "shopping-item": "articoli della spesa",
  chore: "faccende",
  "chat-message": "messaggi in chat"
};
function startOfToday() {
  const d = /* @__PURE__ */ new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function lockKey(familyId, feature) {
  return `base_usage:${familyId}:${feature}`;
}
async function reserveBaseSlot(userId, familyId, feature) {
  const plan = await getPlanForFamily(familyId);
  if (plan === "premium") return { status: "ok" };
  const max = BASE_FREE_DAILY_LIMIT;
  const since = startOfToday();
  const dbFeature = FEATURE_PREFIX + feature;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql4`SELECT pg_advisory_xact_lock(hashtext(${lockKey(familyId, feature)}))`);
      const [row] = await tx.select({ count: sql4`count(*)::int` }).from(aiUsage).where(
        and10(
          eq13(aiUsage.familyId, familyId),
          eq13(aiUsage.feature, dbFeature),
          gte(aiUsage.createdAt, since)
        )
      );
      const used = row?.count ?? 0;
      if (used >= max) {
        return { status: "limited", used, max, feature };
      }
      await tx.insert(aiUsage).values({ userId, familyId, feature: dbFeature, status: "succeeded" });
      return { status: "ok" };
    });
  } catch (err) {
    logger.error("reserveBaseSlot failed (fail-open)", { feature, error: String(err) });
    return { status: "ok" };
  }
}
function baseLimitBody(result) {
  return {
    error: {
      code: "FREE_DAILY_LIMIT_REACHED",
      message: `Hai raggiunto il limite giornaliero del piano Free (${result.max} ${BASE_LABELS[result.feature]} al giorno, condivisi da tutta la famiglia). Passa a Premium per usarne quanti vuoi, oppure riprova domani.`,
      feature: result.feature,
      max: result.max
    }
  };
}

// shared/chore-recurrence.ts
function isRealIsoDate(value) {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
function parseRecurrenceRule(rule) {
  if (!rule) return null;
  const colonIdx = rule.indexOf(":");
  const freq = colonIdx === -1 ? rule : rule.slice(0, colonIdx);
  const args = colonIdx === -1 ? null : rule.slice(colonIdx + 1);
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly") return null;
  const parsed = {
    frequency: freq,
    weekdays: [],
    weekday: null,
    monthDays: [],
    monthDay: null
  };
  if (args === null) return parsed;
  const tokens = args.split(",").map((s) => s.trim());
  if (tokens.length === 0 || tokens.some((t) => !/^\d+$/.test(t))) return null;
  const nums = tokens.map((t) => parseInt(t, 10));
  if (freq === "daily" || freq === "weekly") {
    if (nums.some((n) => n < 1 || n > 7)) return null;
    const days = Array.from(new Set(nums)).sort((a, b) => a - b);
    parsed.weekdays = days;
    if (freq === "weekly") parsed.weekday = days[0] ?? null;
  } else {
    if (nums.some((n) => n < 1 || n > 31)) return null;
    const days = Array.from(new Set(nums)).sort((a, b) => a - b);
    parsed.monthDays = days;
    parsed.monthDay = days[0] ?? null;
  }
  return parsed;
}
function toUtcDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}
function toIso(d) {
  return d.toISOString().slice(0, 10);
}
function isoWeekday(d) {
  const wd = d.getUTCDay();
  return wd === 0 ? 7 : wd;
}
function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
function nextDueDate(rule, afterIsoDate) {
  const parsed = parseRecurrenceRule(rule);
  const base = toUtcDate(afterIsoDate);
  if (!parsed || !base) return null;
  if (parsed.frequency === "daily") {
    const days = parsed.weekdays.length > 0 ? parsed.weekdays : [1, 2, 3, 4, 5, 6, 7];
    const next = new Date(base);
    for (let i = 0; i < 7; i++) {
      next.setUTCDate(next.getUTCDate() + 1);
      if (days.includes(isoWeekday(next))) return toIso(next);
    }
    return null;
  }
  if (parsed.frequency === "weekly") {
    const targets2 = parsed.weekdays.length > 0 ? parsed.weekdays : [isoWeekday(base)];
    const next = new Date(base);
    for (let i = 0; i < 7; i++) {
      next.setUTCDate(next.getUTCDate() + 1);
      if (targets2.includes(isoWeekday(next))) return toIso(next);
    }
    return null;
  }
  const targets = parsed.monthDays.length > 0 ? parsed.monthDays : [base.getUTCDate()];
  let year = base.getUTCFullYear();
  let month = base.getUTCMonth();
  for (let i = 0; i < 2; i++) {
    const candidates = targets.map((t) => new Date(Date.UTC(year, month, Math.min(t, lastDayOfMonth(year, month))))).filter((c) => c.getTime() > base.getTime()).sort((a, b) => a.getTime() - b.getTime());
    if (candidates.length > 0) return toIso(candidates[0]);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return null;
}
function expandOccurrences(rule, startIsoDate, untilIsoDate, maxOccurrences = 100) {
  const parsed = parseRecurrenceRule(rule);
  const start = toUtcDate(startIsoDate);
  const until = toUtcDate(untilIsoDate);
  if (!parsed || !start || !until) return [];
  const out = [];
  const startIso = toIso(start);
  const matchesRule = (d) => {
    if (parsed.frequency === "daily") {
      const days = parsed.weekdays.length > 0 ? parsed.weekdays : [1, 2, 3, 4, 5, 6, 7];
      return days.includes(isoWeekday(d));
    }
    if (parsed.frequency === "weekly") {
      const targets2 = parsed.weekdays.length > 0 ? parsed.weekdays : [isoWeekday(start)];
      return targets2.includes(isoWeekday(d));
    }
    const targets = parsed.monthDays.length > 0 ? parsed.monthDays : [start.getUTCDate()];
    const last = lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth());
    return targets.some((t) => Math.min(t, last) === d.getUTCDate());
  };
  if (matchesRule(start)) out.push(startIso);
  let cursor = startIso;
  while (out.length < maxOccurrences) {
    const next = nextDueDate(rule, cursor);
    if (!next) break;
    const nextDate = toUtcDate(next);
    if (!nextDate || nextDate.getTime() > until.getTime()) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

// server/routes/calendar.ts
var MAX_RECURRENCE_OCCURRENCES = 60;
var RECURRENCE_HORIZON_MONTHS = 6;
async function notifyAssignedMember(familyId, event, creatorUserId) {
  try {
    if (!event.memberId) return;
    const [member] = await db.select({ userId: familyMembers.userId }).from(familyMembers).where(eq14(familyMembers.id, event.memberId)).limit(1);
    if (!member) return;
    if (member.userId === creatorUserId) return;
    const title = "Nuovo evento assegnato";
    const body = event.time ? `${event.title} \xB7 ${event.date} alle ${event.time}` : `${event.title} \xB7 ${event.date}`;
    const data = { type: "event_assigned", eventId: event.id, familyId };
    await notifyUserInFamily(familyId, member.userId, "event_assigned", {
      title,
      body,
      event
    });
    await sendPushToUser(member.userId, { title, body, data });
  } catch (error) {
    logger.error("notifyAssignedMember error", { error: String(error) });
  }
}
var router5 = Router5();
var createEventSchema = z5.object({
  title: z5.string().min(1, "Il titolo \xE8 obbligatorio"),
  description: z5.string().optional(),
  date: z5.string().refine(isRealIsoDate, "Data non valida (formato AAAA-MM-GG)"),
  time: z5.string().optional(),
  endTime: z5.string().optional(),
  allDay: z5.boolean().optional().default(false),
  category: z5.enum(["work", "school", "sport", "health", "social", "family", "other"]).optional().default("other"),
  location: z5.string().optional(),
  color: z5.string().optional().default("#6366F1"),
  memberId: z5.string().optional(),
  recurrenceRule: z5.string().optional()
});
var updateEventSchema = z5.object({
  title: z5.string().min(1).optional(),
  description: z5.string().optional(),
  date: z5.string().refine(isRealIsoDate, "Data non valida (formato AAAA-MM-GG)").optional(),
  time: z5.string().nullable().optional(),
  endTime: z5.string().nullable().optional(),
  allDay: z5.boolean().optional(),
  category: z5.enum(["work", "school", "sport", "health", "social", "family", "other"]).optional(),
  location: z5.string().nullable().optional(),
  color: z5.string().optional(),
  memberId: z5.string().nullable().optional(),
  recurrenceRule: z5.string().nullable().optional()
}).strict();
function feedBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}
router5.get("/:familyId/feed-url", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const regenerate = getQuery(req, "regenerate") === "1";
    const [family] = await db.select({ icsFeedToken: families.icsFeedToken }).from(families).where(eq14(families.id, familyId)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }
    let token = family.icsFeedToken;
    if (!token || regenerate) {
      token = randomBytes4(24).toString("hex");
      await db.update(families).set({ icsFeedToken: token, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(families.id, familyId));
    }
    res.json({ url: `${feedBaseUrl(req)}/calendar-feed/${token}.ics` });
  } catch (error) {
    logger.error("Feed URL error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero del link calendario" } });
  }
});
router5.get("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const startDate = getQuery(req, "startDate");
    const endDate = getQuery(req, "endDate");
    const blockedIds = await getBlockedUserIds(req.user.userId, familyId);
    const conditions = [eq14(calendarEvents.familyId, familyId)];
    if (startDate && endDate) {
      conditions.push(gte2(calendarEvents.date, startDate));
      conditions.push(lte(calendarEvents.date, endDate));
    }
    const blockFilter = applyBlockedFilter(calendarEvents.createdBy, blockedIds);
    if (blockFilter) conditions.push(blockFilter);
    const events = await db.select().from(calendarEvents).where(and11(...conditions));
    res.json(events);
  } catch (error) {
    logger.error("Get events error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero eventi" } });
  }
});
router5.post("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    if (parsed.data.recurrenceRule && !parseRecurrenceRule(parsed.data.recurrenceRule)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Regola di ricorrenza non valida" }
      });
    }
    const gate = await reserveBaseSlot(req.user.userId, familyId, "calendar-event");
    if (gate.status === "limited") {
      return res.status(429).json(baseLimitBody(gate));
    }
    let dates = [parsed.data.date];
    if (parsed.data.recurrenceRule) {
      const until = /* @__PURE__ */ new Date(`${parsed.data.date.slice(0, 10)}T00:00:00Z`);
      until.setUTCMonth(until.getUTCMonth() + RECURRENCE_HORIZON_MONTHS);
      const expanded = expandOccurrences(
        parsed.data.recurrenceRule,
        parsed.data.date.slice(0, 10),
        until.toISOString().slice(0, 10),
        MAX_RECURRENCE_OCCURRENCES
      );
      if (expanded.length > 0) dates = expanded;
    }
    const inserted = await db.insert(calendarEvents).values(
      dates.map((date2) => ({
        familyId,
        ...parsed.data,
        date: date2,
        createdBy: req.user.userId
      }))
    ).returning();
    const event = inserted[0];
    broadcastToFamily(familyId, "event_created", event);
    void notifyAssignedMember(familyId, event, req.user.userId);
    void (async () => {
      const creatorId = req.user.userId;
      const excluded = new Set(await getBlockRelatedUserIds(creatorId, familyId));
      excluded.add(creatorId);
      if (event.memberId) {
        const [assignee] = await db.select({ userId: familyMembers.userId }).from(familyMembers).where(eq14(familyMembers.id, event.memberId)).limit(1);
        if (assignee) excluded.add(assignee.userId);
      }
      const body = event.time ? `${event.title} \xB7 ${event.date} alle ${event.time}` : `${event.title} \xB7 ${event.date}`;
      await sendPushToFamily(familyId, {
        title: "Nuovo evento in calendario",
        body,
        data: { route: "/(tabs)/calendar" }
      }, { excludeUserIds: excluded });
    })().catch(() => {
    });
    res.status(201).json(event);
  } catch (error) {
    logger.error("Create event error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione dell'evento" } });
  }
});
router5.put("/:familyId/:eventId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const eventId = getParam(req, "eventId");
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    if (parsed.data.recurrenceRule && !parseRecurrenceRule(parsed.data.recurrenceRule)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Regola di ricorrenza non valida" }
      });
    }
    const [event] = await db.update(calendarEvents).set({ ...parsed.data, updatedAt: /* @__PURE__ */ new Date() }).where(and11(eq14(calendarEvents.id, eventId), eq14(calendarEvents.familyId, familyId))).returning();
    if (!event) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Evento non trovato" } });
    }
    broadcastToFamily(familyId, "event_updated", event);
    res.json(event);
  } catch (error) {
    logger.error("Update event error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});
router5.delete("/:familyId/:eventId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const eventId = getParam(req, "eventId");
    await db.delete(calendarEvents).where(and11(eq14(calendarEvents.id, eventId), eq14(calendarEvents.familyId, familyId)));
    broadcastToFamily(familyId, "event_deleted", { eventId });
    res.json({ message: "Evento eliminato" });
  } catch (error) {
    logger.error("Delete event error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});
var calendar_default = router5;

// server/routes/calendar-feed.ts
init_http_params();
init_db();
init_schema();
init_logger();
import { Router as Router6 } from "express";
import { eq as eq15, and as and12, gte as gte3 } from "drizzle-orm";
var router6 = Router6();
function icsEscape(text2) {
  return text2.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function foldLine(line) {
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}
function icsDate(date2) {
  return date2.replace(/-/g, "");
}
function icsDateTime(date2, time) {
  return `${icsDate(date2)}T${time.replace(":", "")}00`;
}
function nextDayIso(date2) {
  const d = /* @__PURE__ */ new Date(`${date2}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function nextDay(date2) {
  return icsDate(nextDayIso(date2));
}
function plusOneHour(time) {
  const [h = 0, m = 0] = time.split(":").map((n) => parseInt(n, 10));
  const total = (h * 60 + m + 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function computeTimedEnd(date2, time, endTime) {
  const end = endTime || plusOneHour(time);
  const endDate = end <= time ? nextDayIso(date2) : date2;
  return { endDate, endTime: end };
}
router6.get("/:token", async (req, res) => {
  try {
    const raw = getParam(req, "token");
    const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
    if (!token || token.length < 32 || !/^[a-f0-9]+$/i.test(token)) {
      return res.status(404).send("Not found");
    }
    const [family] = await db.select({ id: families.id, name: families.name }).from(families).where(eq15(families.icsFeedToken, token)).limit(1);
    if (!family) {
      return res.status(404).send("Not found");
    }
    const fromDate = /* @__PURE__ */ new Date();
    fromDate.setDate(fromDate.getDate() - 90);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const events = await db.select().from(calendarEvents).where(and12(eq15(calendarEvents.familyId, family.id), gte3(calendarEvents.date, fromStr)));
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FamilySync//Calendario Famiglia//IT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      foldLine(`X-WR-CALNAME:${icsEscape(`FamilySync - ${family.name}`)}`),
      "X-WR-TIMEZONE:Europe/Rome"
    ];
    for (const ev of events) {
      if (!isRealIsoDate(ev.date)) {
        logger.warn("Calendar feed: skipping event with invalid date", { eventId: ev.id });
        continue;
      }
      lines.push("BEGIN:VEVENT");
      lines.push(foldLine(`UID:${ev.id}@familysync`));
      const stamp = (ev.updatedAt ?? ev.createdAt ?? /* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      lines.push(`DTSTAMP:${stamp}`);
      if (ev.allDay || !ev.time) {
        lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`);
        lines.push(`DTEND;VALUE=DATE:${nextDay(ev.date)}`);
      } else {
        lines.push(`DTSTART;TZID=Europe/Rome:${icsDateTime(ev.date, ev.time)}`);
        const end = computeTimedEnd(ev.date, ev.time, ev.endTime);
        lines.push(`DTEND;TZID=Europe/Rome:${icsDateTime(end.endDate, end.endTime)}`);
      }
      lines.push(foldLine(`SUMMARY:${icsEscape(ev.title)}`));
      if (ev.description) lines.push(foldLine(`DESCRIPTION:${icsEscape(ev.description)}`));
      if (ev.location) lines.push(foldLine(`LOCATION:${icsEscape(ev.location)}`));
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="familysync.ics"');
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(lines.join("\r\n") + "\r\n");
  } catch (error) {
    logger.error("Calendar feed error", { error: String(error) });
    res.status(500).send("Server error");
  }
});
var calendar_feed_default = router6;

// server/routes/shopping.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
init_websocket();
import { Router as Router8 } from "express";
import { z as z7 } from "zod";
import { eq as eq17, and as and14 } from "drizzle-orm";
init_block_filter();

// server/lib/normalize.ts
var ITALIAN_STOPWORDS = /* @__PURE__ */ new Set([
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "uno",
  "una",
  "di",
  "del",
  "dello",
  "della",
  "dei",
  "degli",
  "delle",
  "a",
  "al",
  "allo",
  "alla",
  "ai",
  "agli",
  "alle",
  "da",
  "dal",
  "dallo",
  "dalla",
  "dai",
  "dagli",
  "dalle",
  "in",
  "nel",
  "nello",
  "nella",
  "nei",
  "negli",
  "nelle",
  "su",
  "sul",
  "sullo",
  "sulla",
  "sui",
  "sugli",
  "sulle",
  "con",
  "per",
  "tra",
  "fra",
  "e",
  "ed",
  "o",
  "od",
  "che",
  "non",
  "se",
  "come",
  "pi\xF9",
  "piu",
  "anche",
  "ci",
  "ne",
  "si"
]);
var UNIT_MAP = {
  pz: "pcs",
  pcs: "pcs",
  pezzo: "pcs",
  pezzi: "pcs",
  g: "g",
  gr: "g",
  grammi: "g",
  kg: "kg",
  kilo: "kg",
  chilo: "kg",
  ml: "ml",
  millilitri: "ml",
  l: "l",
  lt: "l",
  litro: "l",
  litri: "l"
};
function parseQuantityString(raw) {
  if (!raw || raw.trim() === "") return { quantity: null, unit: null };
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?$/);
  if (match) {
    const num = parseFloat(match[1].replace(",", "."));
    const rawUnit = (match[2] || "").toLowerCase();
    const unit = UNIT_MAP[rawUnit] || (rawUnit || null);
    return { quantity: isNaN(num) ? null : num, unit };
  }
  const numOnly = parseFloat(trimmed.replace(",", "."));
  if (!isNaN(numOnly)) return { quantity: numOnly, unit: null };
  return { quantity: null, unit: null };
}
function normalizeItemName(name) {
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?'"()[\]{}]/g, "");
  const tokens = cleaned.split(" ").filter((t) => t.length > 0 && !ITALIAN_STOPWORDS.has(t));
  if (tokens.length === 0) return cleaned.replace(/\s+/g, "");
  tokens.sort();
  return tokens.join(" ");
}

// server/routes/shopping.ts
init_logger();

// server/routes/pantry.ts
init_db();
init_schema();
init_auth();
init_family();
init_http_params();
import { Router as Router7 } from "express";
import { z as z6 } from "zod";
import { eq as eq16, and as and13, sql as sql5, asc } from "drizzle-orm";
init_websocket();
init_logger();
var router7 = Router7();
var VALID_UNITS = ["pcs", "g", "kg", "ml", "l"];
function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date2 = new Date(Date.UTC(y, m - 1, d));
  return date2.getUTCFullYear() === y && date2.getUTCMonth() + 1 === m && date2.getUTCDate() === d;
}
var upsertItemSchema = z6.object({
  name: z6.string().trim().min(1, "Il nome \xE8 obbligatorio").max(255),
  quantity: z6.number().min(0).max(1e6).optional().nullable(),
  unit: z6.enum(VALID_UNITS).optional().nullable(),
  category: z6.string().trim().max(50).optional(),
  expiryDate: z6.string().refine(isRealDate, "Data non valida (YYYY-MM-DD)").optional().nullable()
});
var updateItemSchema = upsertItemSchema.partial();
async function addToPantry(params) {
  const normalized = normalizeItemName(params.name);
  const rawQty = params.quantity != null && params.quantity !== "" ? Number(params.quantity) : null;
  const qty = rawQty != null && Number.isFinite(rawQty) ? String(rawQty) : null;
  const unit = params.unit?.trim() || null;
  const result = await db.execute(sql5`
    INSERT INTO pantry_items (family_id, name, normalized_name, quantity, unit, category, expiry_date, added_by)
    VALUES (
      ${params.familyId}, ${params.name.trim()}, ${normalized}, ${qty}::numeric, ${unit},
      ${params.category || "food"}, ${params.expiryDate || null}::date, ${params.addedBy || null}::uuid
    )
    ON CONFLICT (family_id, normalized_name, COALESCE(unit, ''))
    DO UPDATE SET
      quantity = CASE
        WHEN EXCLUDED.quantity IS NULL THEN pantry_items.quantity
        ELSE COALESCE(pantry_items.quantity, 0) + EXCLUDED.quantity
      END,
      expiry_date = CASE
        WHEN EXCLUDED.expiry_date IS NULL THEN pantry_items.expiry_date
        WHEN pantry_items.expiry_date IS NULL THEN EXCLUDED.expiry_date
        ELSE LEAST(pantry_items.expiry_date, EXCLUDED.expiry_date)
      END,
      updated_at = now()
    RETURNING
      id, family_id AS "familyId", name, normalized_name AS "normalizedName",
      quantity, unit, category, expiry_date AS "expiryDate", added_by AS "addedBy",
      created_at AS "createdAt", updated_at AS "updatedAt",
      (xmax = 0) AS "inserted"
  `);
  const row = result.rows[0];
  const { inserted, ...item } = row;
  return { item, merged: !inserted };
}
router7.get("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const items = await db.select().from(pantryItems).where(eq16(pantryItems.familyId, familyId)).orderBy(sql5`${pantryItems.expiryDate} ASC NULLS LAST`, asc(pantryItems.name));
    res.json({ items });
  } catch (error) {
    logger.error("Get pantry error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero della dispensa" } });
  }
});
router7.post("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = upsertItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const result = await addToPantry({
      familyId,
      name: parsed.data.name,
      quantity: parsed.data.quantity ?? null,
      unit: parsed.data.unit ?? null,
      category: parsed.data.category,
      expiryDate: parsed.data.expiryDate ?? null,
      addedBy: req.user.userId
    });
    broadcastToFamily(familyId, "pantry_updated", { item: result.item });
    res.status(result.merged ? 200 : 201).json(result);
  } catch (error) {
    logger.error("Add pantry item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiunta in dispensa" } });
  }
});
router7.put("/:familyId/:itemId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const itemId = getParam(req, "itemId");
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const updateData = { updatedAt: /* @__PURE__ */ new Date() };
    if (parsed.data.name !== void 0) {
      updateData.name = parsed.data.name.trim();
      updateData.normalizedName = normalizeItemName(parsed.data.name);
    }
    if (parsed.data.quantity !== void 0) {
      updateData.quantity = parsed.data.quantity != null ? String(parsed.data.quantity) : null;
    }
    if (parsed.data.unit !== void 0) updateData.unit = parsed.data.unit?.trim() || null;
    if (parsed.data.category !== void 0) updateData.category = parsed.data.category || "food";
    if (parsed.data.expiryDate !== void 0) updateData.expiryDate = parsed.data.expiryDate || null;
    const [item] = await db.update(pantryItems).set(updateData).where(and13(eq16(pantryItems.id, itemId), eq16(pantryItems.familyId, familyId))).returning();
    if (!item) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in dispensa" } });
    }
    broadcastToFamily(familyId, "pantry_updated", { item });
    res.json(item);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({
        error: { code: "DUPLICATE_ITEM", message: "Esiste gi\xE0 un prodotto con questo nome e unit\xE0 in dispensa" }
      });
    }
    logger.error("Update pantry item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento della dispensa" } });
  }
});
router7.delete("/:familyId/:itemId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const itemId = getParam(req, "itemId");
    const [deleted] = await db.delete(pantryItems).where(and13(eq16(pantryItems.id, itemId), eq16(pantryItems.familyId, familyId))).returning();
    if (!deleted) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in dispensa" } });
    }
    broadcastToFamily(familyId, "pantry_updated", { removedId: itemId });
    res.json({ success: true });
  } catch (error) {
    logger.error("Delete pantry item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione dalla dispensa" } });
  }
});
var pantry_default = router7;

// server/routes/shopping.ts
var router8 = Router8();
var VALID_UNITS2 = ["pcs", "g", "kg", "ml", "l"];
var VALID_CATEGORIES = ["food", "household_cleaning", "personal_care"];
var createListSchema = z7.object({
  name: z7.string().min(1, "Il nome \xE8 obbligatorio"),
  icon: z7.string().optional()
});
var quantitySchema = z7.union([
  z7.number().nonnegative(),
  z7.string().min(1)
]).transform((v) => {
  if (typeof v === "number") return v;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}).nullable().optional();
var addItemSchema = z7.object({
  name: z7.string().min(1, "Il nome del prodotto \xE8 obbligatorio"),
  quantity: quantitySchema,
  unit: z7.enum(VALID_UNITS2).optional(),
  category: z7.enum(VALID_CATEGORIES).optional().default("food"),
  note: z7.string().optional()
});
var updateItemSchema2 = z7.object({
  name: z7.string().min(1).optional(),
  quantity: quantitySchema,
  unit: z7.enum(VALID_UNITS2).nullable().optional(),
  category: z7.enum(VALID_CATEGORIES).optional(),
  note: z7.string().optional()
});
function enrichItemWithLegacyParsing(item) {
  if (item.unit) return item;
  if (!item.quantity) return item;
  const parsed = parseQuantityString(String(item.quantity));
  if (parsed.unit && !item.unit) {
    return { ...item, quantity: parsed.quantity, unit: parsed.unit };
  }
  return item;
}
async function verifyListOwnership(listId, familyId) {
  const [list] = await db.select({ id: shoppingLists.id }).from(shoppingLists).where(and14(eq17(shoppingLists.id, listId), eq17(shoppingLists.familyId, familyId))).limit(1);
  return !!list;
}
async function verifyItemOwnership(itemId, listId) {
  const [item] = await db.select({ id: shoppingItems.id }).from(shoppingItems).where(and14(eq17(shoppingItems.id, itemId), eq17(shoppingItems.listId, listId))).limit(1);
  return !!item;
}
router8.get("/:familyId/lists", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const blockedIds = await getBlockedUserIds(req.user.userId, familyId);
    const listConditions = [eq17(shoppingLists.familyId, familyId)];
    const blockFilter = applyBlockedFilter(shoppingLists.createdBy, blockedIds);
    if (blockFilter) listConditions.push(blockFilter);
    const lists = await db.select().from(shoppingLists).where(and14(...listConditions));
    const listsWithItems = await Promise.all(lists.map(async (list) => {
      const itemConditions = [eq17(shoppingItems.listId, list.id)];
      const itemBlockFilter = applyBlockedFilter(shoppingItems.createdBy, blockedIds);
      if (itemBlockFilter) itemConditions.push(itemBlockFilter);
      const items = await db.select().from(shoppingItems).where(and14(...itemConditions));
      return { ...list, items: items.map(enrichItemWithLegacyParsing) };
    }));
    res.json(listsWithItems);
  } catch (error) {
    logger.error("Get shopping lists error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero liste" } });
  }
});
router8.post("/:familyId/lists", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = createListSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const [list] = await db.insert(shoppingLists).values({
      familyId,
      name: parsed.data.name,
      icon: parsed.data.icon,
      createdBy: req.user.userId
    }).returning();
    broadcastToFamily(familyId, "shopping_list_created", { ...list, items: [] });
    res.status(201).json({ ...list, items: [] });
  } catch (error) {
    logger.error("Create shopping list error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della lista" } });
  }
});
router8.delete("/:familyId/lists/:listId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const listId = getParam(req, "listId");
    if (!await verifyListOwnership(listId, familyId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }
    await db.delete(shoppingLists).where(and14(eq17(shoppingLists.id, listId), eq17(shoppingLists.familyId, familyId)));
    broadcastToFamily(familyId, "shopping_list_deleted", { listId });
    res.json({ message: "Lista eliminata" });
  } catch (error) {
    logger.error("Delete shopping list error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});
router8.post("/:familyId/lists/:listId/items", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const listId = getParam(req, "listId");
    if (!await verifyListOwnership(listId, familyId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    let finalQuantity = parsed.data.quantity ?? null;
    let finalUnit = parsed.data.unit || null;
    if (finalQuantity != null && !finalUnit) {
      const legacyParsed = parseQuantityString(String(finalQuantity));
      if (legacyParsed.unit) {
        finalQuantity = legacyParsed.quantity;
        finalUnit = legacyParsed.unit;
      }
    }
    const gate = await reserveBaseSlot(req.user.userId, familyId, "shopping-item");
    if (gate.status === "limited") {
      return res.status(429).json(baseLimitBody(gate));
    }
    const [item] = await db.insert(shoppingItems).values({
      listId,
      name: parsed.data.name,
      quantity: finalQuantity != null ? String(finalQuantity) : null,
      unit: finalUnit,
      category: parsed.data.category,
      note: parsed.data.note,
      createdBy: req.user.userId
    }).returning();
    broadcastToFamily(familyId, "shopping_item_added", { listId, item });
    void (async () => {
      const authorId = req.user.userId;
      const excluded = new Set(await getBlockRelatedUserIds(authorId, familyId));
      excluded.add(authorId);
      const [author] = await db.select({ name: users.name }).from(users).where(eq17(users.id, authorId)).limit(1);
      await sendPushToFamily(familyId, {
        title: "Lista della spesa",
        body: `${author?.name ?? "Un familiare"} ha aggiunto "${item.name}" alla spesa`,
        data: { route: "/(tabs)/shopping" }
      }, { excludeUserIds: excluded });
    })().catch(() => {
    });
    res.status(201).json(item);
  } catch (error) {
    logger.error("Add shopping item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiunta del prodotto" } });
  }
});
router8.patch("/:familyId/lists/:listId/items/:itemId/toggle", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const listId = getParam(req, "listId");
    const itemId = getParam(req, "itemId");
    if (!await verifyListOwnership(listId, familyId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }
    if (!await verifyItemOwnership(itemId, listId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa lista" } });
    }
    const [currentItem] = await db.select().from(shoppingItems).where(and14(eq17(shoppingItems.id, itemId), eq17(shoppingItems.listId, listId))).limit(1);
    if (!currentItem) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato" } });
    }
    const [item] = await db.update(shoppingItems).set({
      isChecked: !currentItem.isChecked,
      checkedBy: !currentItem.isChecked ? req.user.userId : null,
      checkedAt: !currentItem.isChecked ? /* @__PURE__ */ new Date() : null
    }).where(and14(eq17(shoppingItems.id, itemId), eq17(shoppingItems.listId, listId))).returning();
    if (!currentItem.isChecked) {
      await db.insert(shoppingHistory).values({
        familyId,
        itemName: item.name,
        quantity: item.quantity,
        category: item.category
      });
      try {
        const pantryResult = await addToPantry({
          familyId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          addedBy: req.user.userId
        });
        broadcastToFamily(familyId, "pantry_updated", { item: pantryResult.item });
      } catch (pantryErr) {
        logger.error("Add purchased item to pantry failed", { error: String(pantryErr) });
      }
    }
    broadcastToFamily(familyId, "shopping_item_toggled", { listId, item });
    res.json(item);
  } catch (error) {
    logger.error("Toggle shopping item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});
router8.patch("/:familyId/lists/:listId/items/:itemId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const listId = getParam(req, "listId");
    const itemId = getParam(req, "itemId");
    if (!await verifyListOwnership(listId, familyId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }
    if (!await verifyItemOwnership(itemId, listId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa lista" } });
    }
    const parsed = updateItemSchema2.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const updateData = {};
    if (parsed.data.name !== void 0) updateData.name = parsed.data.name;
    if (parsed.data.quantity !== void 0) updateData.quantity = parsed.data.quantity != null ? String(parsed.data.quantity) : null;
    if (parsed.data.unit !== void 0) updateData.unit = parsed.data.unit;
    if (parsed.data.category !== void 0) updateData.category = parsed.data.category;
    if (parsed.data.note !== void 0) updateData.note = parsed.data.note;
    const [item] = await db.update(shoppingItems).set(updateData).where(and14(eq17(shoppingItems.id, itemId), eq17(shoppingItems.listId, listId))).returning();
    broadcastToFamily(familyId, "shopping_item_updated", { listId, item });
    res.json(item);
  } catch (error) {
    logger.error("Update shopping item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento del prodotto" } });
  }
});
router8.delete("/:familyId/lists/:listId/items/:itemId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const listId = getParam(req, "listId");
    const itemId = getParam(req, "itemId");
    if (!await verifyListOwnership(listId, familyId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }
    if (!await verifyItemOwnership(itemId, listId)) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa lista" } });
    }
    await db.delete(shoppingItems).where(and14(eq17(shoppingItems.id, itemId), eq17(shoppingItems.listId, listId)));
    broadcastToFamily(familyId, "shopping_item_deleted", { listId, itemId });
    res.json({ message: "Prodotto eliminato" });
  } catch (error) {
    logger.error("Delete shopping item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});
var shopping_default = router8;

// server/routes/chores.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
init_websocket();
import { Router as Router9 } from "express";
import { z as z8 } from "zod";
import { eq as eq18, and as and15, sql as sql6, isNull as isNull4, lt } from "drizzle-orm";
init_block_filter();
init_logger();
var router9 = Router9();
var createChoreSchema = z8.object({
  title: z8.string().min(1, "Il titolo \xE8 obbligatorio"),
  description: z8.string().optional(),
  difficulty: z8.number().int().min(1).max(5).optional(),
  points: z8.number().int().min(1).optional().default(10),
  estimatedMinutes: z8.number().int().min(0).optional(),
  assignedTo: z8.string().optional(),
  dueDate: z8.string().optional(),
  recurrenceRule: z8.string().refine((v) => parseRecurrenceRule(v) !== null, "Regola di ricorrenza non valida").optional()
});
var updateChoreSchema = z8.object({
  title: z8.string().min(1).optional(),
  description: z8.string().optional(),
  difficulty: z8.number().int().min(1).max(5).nullable().optional(),
  points: z8.number().int().min(1).optional(),
  estimatedMinutes: z8.number().int().min(0).nullable().optional(),
  assignedTo: z8.string().nullable().optional(),
  dueDate: z8.string().nullable().optional(),
  recurrenceRule: z8.string().refine((v) => parseRecurrenceRule(v) !== null, "Regola di ricorrenza non valida").nullable().optional(),
  isCompleted: z8.boolean().optional()
}).strict();
var CHORE_EVENT_COLOR = "#8B5CF6";
var COMPLETED_RETENTION_DAYS = 5;
async function isFamilyMemberId(familyId, memberId) {
  const [member] = await db.select({ id: familyMembers.id }).from(familyMembers).where(and15(eq18(familyMembers.id, memberId), eq18(familyMembers.familyId, familyId))).limit(1);
  return !!member;
}
function choreEventFields(chore) {
  const parts = [];
  if (chore.description) parts.push(chore.description);
  if (chore.points) parts.push(`Punti: ${chore.points}`);
  parts.push("Creato automaticamente dalla sezione Faccende");
  return {
    title: `Faccenda: ${chore.title}`,
    description: parts.join("\n"),
    date: chore.dueDate.toISOString().split("T")[0],
    time: null,
    endTime: null,
    allDay: true,
    category: "other",
    color: CHORE_EVENT_COLOR,
    memberId: chore.assignedTo
  };
}
async function createChoreCalendarEvent(chore, userId) {
  if (!chore.dueDate || chore.isCompleted) return chore;
  try {
    const [event] = await db.insert(calendarEvents).values({
      familyId: chore.familyId,
      ...choreEventFields(chore),
      createdBy: userId
    }).returning();
    const [updated] = await db.update(chores).set({ calendarEventId: event.id }).where(and15(
      eq18(chores.id, chore.id),
      isNull4(chores.calendarEventId),
      eq18(chores.isCompleted, false),
      sql6`${chores.dueDate} IS NOT NULL`
    )).returning();
    if (!updated) {
      await db.delete(calendarEvents).where(eq18(calendarEvents.id, event.id));
      const [current] = await db.select().from(chores).where(eq18(chores.id, chore.id)).limit(1);
      return current ?? chore;
    }
    broadcastToFamily(chore.familyId, "event_created", event);
    return updated;
  } catch (error) {
    logger.warn("Chore calendar sync (create) failed", { choreId: chore.id, error: String(error) });
    return chore;
  }
}
async function updateChoreCalendarEvent(chore) {
  if (!chore.calendarEventId || !chore.dueDate) return;
  try {
    const [event] = await db.update(calendarEvents).set({ ...choreEventFields(chore), updatedAt: /* @__PURE__ */ new Date() }).where(and15(eq18(calendarEvents.id, chore.calendarEventId), eq18(calendarEvents.familyId, chore.familyId))).returning();
    if (event) broadcastToFamily(chore.familyId, "event_updated", event);
  } catch (error) {
    logger.warn("Chore calendar sync (update) failed", { choreId: chore.id, error: String(error) });
  }
}
async function deleteChoreCalendarEvent(familyId, choreId, calendarEventId) {
  if (!calendarEventId) return;
  try {
    await db.delete(calendarEvents).where(and15(eq18(calendarEvents.id, calendarEventId), eq18(calendarEvents.familyId, familyId)));
    await db.update(chores).set({ calendarEventId: null }).where(eq18(chores.id, choreId));
    broadcastToFamily(familyId, "event_deleted", { eventId: calendarEventId });
  } catch (error) {
    logger.warn("Chore calendar sync (delete) failed", { choreId, error: String(error) });
  }
}
async function notifyChoreAssignee(familyId, chore, actorUserId) {
  try {
    if (!chore.assignedTo) return;
    const [member] = await db.select({ userId: familyMembers.userId }).from(familyMembers).where(and15(eq18(familyMembers.id, chore.assignedTo), eq18(familyMembers.familyId, familyId))).limit(1);
    if (!member || member.userId === actorUserId) return;
    const blockRelated = await getBlockRelatedUserIds(actorUserId, familyId);
    if (blockRelated.includes(member.userId)) return;
    const due = chore.dueDate ? ` \xB7 scadenza ${chore.dueDate.toISOString().slice(0, 10)}` : "";
    await sendPushToUser(member.userId, {
      title: "Nuova faccenda assegnata",
      body: `${chore.title}${due}`,
      data: { route: "/(tabs)/chores" }
    });
  } catch (error) {
    logger.error("notifyChoreAssignee error", { error: String(error) });
  }
}
router9.get("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    try {
      const cutoff = new Date(Date.now() - COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1e3);
      await db.delete(chores).where(and15(
        eq18(chores.familyId, familyId),
        eq18(chores.isCompleted, true),
        lt(chores.completedAt, cutoff)
      ));
    } catch (cleanupError) {
      logger.error("Completed chores cleanup failed", { familyId, error: String(cleanupError) });
    }
    const blockedIds = await getBlockedUserIds(req.user.userId, familyId);
    const conditions = [eq18(chores.familyId, familyId)];
    const blockFilter = applyBlockedFilter(chores.createdBy, blockedIds);
    if (blockFilter) conditions.push(blockFilter);
    const choresList = await db.select().from(chores).where(and15(...conditions));
    res.json(choresList);
  } catch (error) {
    logger.error("Get chores error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero faccende" } });
  }
});
router9.post("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = createChoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    if (parsed.data.assignedTo && !await isFamilyMemberId(familyId, parsed.data.assignedTo)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "L'assegnatario non appartiene a questa famiglia" }
      });
    }
    const gate = await reserveBaseSlot(req.user.userId, familyId, "chore");
    if (gate.status === "limited") {
      return res.status(429).json(baseLimitBody(gate));
    }
    let [chore] = await db.insert(chores).values({
      familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      difficulty: parsed.data.difficulty ?? null,
      points: parsed.data.points,
      estimatedMinutes: parsed.data.estimatedMinutes ?? null,
      assignedTo: parsed.data.assignedTo,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      recurrenceRule: parsed.data.recurrenceRule,
      createdBy: req.user.userId
    }).returning();
    chore = await createChoreCalendarEvent(chore, req.user.userId);
    broadcastToFamily(familyId, "chore_created", chore);
    void notifyChoreAssignee(familyId, chore, req.user.userId);
    res.status(201).json(chore);
  } catch (error) {
    logger.error("Create chore error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della faccenda" } });
  }
});
router9.put("/:familyId/:choreId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const choreId = getParam(req, "choreId");
    const parsed = updateChoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    if (parsed.data.assignedTo && !await isFamilyMemberId(familyId, parsed.data.assignedTo)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "L'assegnatario non appartiene a questa famiglia" }
      });
    }
    const updateData = { ...parsed.data, updatedAt: /* @__PURE__ */ new Date() };
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    let [chore] = await db.update(chores).set(updateData).where(and15(eq18(chores.id, choreId), eq18(chores.familyId, familyId))).returning();
    if (!chore) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }
    if (chore.isCompleted || !chore.dueDate) {
      await deleteChoreCalendarEvent(familyId, chore.id, chore.calendarEventId);
      chore = { ...chore, calendarEventId: null };
    } else if (chore.calendarEventId) {
      await updateChoreCalendarEvent(chore);
    } else {
      chore = await createChoreCalendarEvent(chore, req.user.userId);
    }
    broadcastToFamily(familyId, "chore_updated", chore);
    if (parsed.data.assignedTo && !chore.isCompleted) {
      void notifyChoreAssignee(familyId, chore, req.user.userId);
    }
    res.json(chore);
  } catch (error) {
    logger.error("Update chore error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});
router9.patch("/:familyId/:choreId/complete", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const choreId = getParam(req, "choreId");
    let [chore] = await db.update(chores).set({
      isCompleted: true,
      completedAt: /* @__PURE__ */ new Date(),
      completedBy: req.user.userId,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and15(
      eq18(chores.id, choreId),
      eq18(chores.familyId, familyId),
      eq18(chores.isCompleted, false)
    )).returning();
    if (!chore) {
      const [existing] = await db.select({ id: chores.id }).from(chores).where(and15(eq18(chores.id, choreId), eq18(chores.familyId, familyId))).limit(1);
      if (!existing) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
      }
      return res.status(400).json({ error: { code: "ALREADY_COMPLETED", message: "Faccenda gi\xE0 completata" } });
    }
    const pointsToAdd = chore.points || 10;
    await deleteChoreCalendarEvent(familyId, choreId, chore.calendarEventId);
    chore = { ...chore, calendarEventId: null };
    if (chore.assignedTo) {
      await db.update(familyMembers).set({
        points: sql6`COALESCE(${familyMembers.points}, 0) + ${pointsToAdd}`
      }).where(and15(
        eq18(familyMembers.id, chore.assignedTo),
        eq18(familyMembers.familyId, familyId)
      ));
    }
    let nextChore = null;
    if (chore.recurrenceRule) {
      const todayIso = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      const dueIso = chore.dueDate ? chore.dueDate.toISOString().slice(0, 10) : null;
      const baseIso = dueIso && dueIso > todayIso ? dueIso : todayIso;
      const nextIso = nextDueDate(chore.recurrenceRule, baseIso);
      if (nextIso) {
        try {
          const [created] = await db.insert(chores).values({
            familyId,
            title: chore.title,
            description: chore.description,
            difficulty: chore.difficulty,
            points: chore.points,
            estimatedMinutes: chore.estimatedMinutes,
            assignedTo: chore.assignedTo,
            dueDate: new Date(nextIso),
            recurrenceRule: chore.recurrenceRule,
            createdBy: chore.createdBy
          }).returning();
          nextChore = await createChoreCalendarEvent(created, req.user.userId);
          broadcastToFamily(familyId, "chore_created", nextChore);
        } catch (error) {
          logger.error("Recurring chore recreation failed", { choreId, error: String(error) });
        }
      }
    }
    broadcastToFamily(familyId, "chore_completed", chore);
    res.json({ ...chore, nextChore });
  } catch (error) {
    logger.error("Complete chore error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel completamento" } });
  }
});
router9.delete("/:familyId/:choreId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const choreId = getParam(req, "choreId");
    const [existing] = await db.select().from(chores).where(and15(eq18(chores.id, choreId), eq18(chores.familyId, familyId))).limit(1);
    if (!existing) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }
    await deleteChoreCalendarEvent(familyId, choreId, existing.calendarEventId);
    await db.delete(chores).where(and15(eq18(chores.id, choreId), eq18(chores.familyId, familyId)));
    broadcastToFamily(familyId, "chore_deleted", { choreId });
    res.json({ message: "Faccenda eliminata" });
  } catch (error) {
    logger.error("Delete chore error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});
var chores_default = router9;

// server/routes/rewards.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
init_websocket();
import { Router as Router10 } from "express";
import { z as z9 } from "zod";
import { eq as eq19, and as and16, desc, sql as sql7 } from "drizzle-orm";
init_block_filter();
init_logger();
var router10 = Router10();
var createRewardSchema = z9.object({
  title: z9.string().trim().min(1, "Il titolo \xE8 obbligatorio").max(200),
  description: z9.string().trim().max(1e3).optional(),
  pointsCost: z9.number().int().min(1, "Il costo deve essere almeno 1 punto").max(1e5)
});
var updateRewardSchema = createRewardSchema.partial();
function canManageRewards(membership) {
  return membership.role === "admin" || membership.role === "adult";
}
router10.get("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const rewardsList = await db.select().from(rewards).where(and16(eq19(rewards.familyId, familyId), eq19(rewards.isActive, true))).orderBy(rewards.pointsCost);
    const redemptions = await db.select({
      id: rewardRedemptions.id,
      rewardTitle: rewardRedemptions.rewardTitle,
      pointsSpent: rewardRedemptions.pointsSpent,
      redeemedAt: rewardRedemptions.redeemedAt,
      memberId: rewardRedemptions.memberId
    }).from(rewardRedemptions).where(eq19(rewardRedemptions.familyId, familyId)).orderBy(desc(rewardRedemptions.redeemedAt)).limit(30);
    res.json({ rewards: rewardsList, redemptions });
  } catch (error) {
    logger.error("Get rewards error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero dei premi" } });
  }
});
router10.post("/:familyId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const membership = req.membership;
    if (!canManageRewards(membership)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Solo admin e adulti possono gestire i premi" } });
    }
    const parsed = createRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const [reward] = await db.insert(rewards).values({
      familyId,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      pointsCost: parsed.data.pointsCost,
      createdBy: req.user.userId
    }).returning();
    broadcastToFamily(familyId, "reward_created", reward);
    res.status(201).json(reward);
  } catch (error) {
    logger.error("Create reward error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione del premio" } });
  }
});
router10.put("/:familyId/:rewardId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const rewardId = getParam(req, "rewardId");
    const membership = req.membership;
    if (!canManageRewards(membership)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Solo admin e adulti possono gestire i premi" } });
    }
    const parsed = updateRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const updateData = {};
    if (parsed.data.title !== void 0) updateData.title = parsed.data.title.trim();
    if (parsed.data.description !== void 0) updateData.description = parsed.data.description?.trim() || null;
    if (parsed.data.pointsCost !== void 0) updateData.pointsCost = parsed.data.pointsCost;
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Nessun dato da aggiornare" } });
    }
    const [reward] = await db.update(rewards).set(updateData).where(and16(eq19(rewards.id, rewardId), eq19(rewards.familyId, familyId), eq19(rewards.isActive, true))).returning();
    if (!reward) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Premio non trovato" } });
    }
    broadcastToFamily(familyId, "reward_updated", reward);
    res.json(reward);
  } catch (error) {
    logger.error("Update reward error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento del premio" } });
  }
});
router10.delete("/:familyId/:rewardId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const rewardId = getParam(req, "rewardId");
    const membership = req.membership;
    if (!canManageRewards(membership)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Solo admin e adulti possono gestire i premi" } });
    }
    const [reward] = await db.update(rewards).set({ isActive: false }).where(and16(eq19(rewards.id, rewardId), eq19(rewards.familyId, familyId), eq19(rewards.isActive, true))).returning();
    if (!reward) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Premio non trovato" } });
    }
    broadcastToFamily(familyId, "reward_deleted", { rewardId });
    res.json({ success: true });
  } catch (error) {
    logger.error("Delete reward error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione del premio" } });
  }
});
router10.post("/:familyId/:rewardId/redeem", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const rewardId = getParam(req, "rewardId");
    const membership = req.membership;
    const userId = req.user.userId;
    const [reward] = await db.select().from(rewards).where(and16(eq19(rewards.id, rewardId), eq19(rewards.familyId, familyId), eq19(rewards.isActive, true))).limit(1);
    if (!reward) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Premio non trovato" } });
    }
    const redemption = await db.transaction(async (tx) => {
      const [updatedMember] = await tx.update(familyMembers).set({ points: sql7`${familyMembers.points} - ${reward.pointsCost}` }).where(and16(
        eq19(familyMembers.id, membership.id),
        eq19(familyMembers.familyId, familyId),
        sql7`COALESCE(${familyMembers.points}, 0) >= ${reward.pointsCost}`
      )).returning();
      if (!updatedMember) return null;
      const [row] = await tx.insert(rewardRedemptions).values({
        familyId,
        rewardId: reward.id,
        memberId: membership.id,
        rewardTitle: reward.title,
        pointsSpent: reward.pointsCost
      }).returning();
      return { redemption: row, remainingPoints: updatedMember.points ?? 0 };
    });
    if (!redemption) {
      return res.status(400).json({
        error: { code: "INSUFFICIENT_POINTS", message: "Punti insufficienti per riscattare questo premio" }
      });
    }
    broadcastToFamily(familyId, "reward_redeemed", {
      redemption: redemption.redemption,
      memberId: membership.id,
      remainingPoints: redemption.remainingPoints
    });
    void (async () => {
      const excluded = new Set(await getBlockRelatedUserIds(userId, familyId));
      excluded.add(userId);
      const [author] = await db.select({ name: users.name }).from(users).where(eq19(users.id, userId)).limit(1);
      await sendPushToFamily(familyId, {
        title: "Premio riscattato! \u{1F389}",
        body: `${author?.name ?? "Un familiare"} ha riscattato "${reward.title}" (${reward.pointsCost} punti)`,
        data: { route: "/rewards" }
      }, { excludeUserIds: excluded });
    })().catch(() => {
    });
    res.status(201).json(redemption);
  } catch (error) {
    logger.error("Redeem reward error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel riscatto del premio" } });
  }
});
var rewards_default = router10;

// server/routes.ts
init_expenses();

// server/routes/ai.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
import { Router as Router12 } from "express";
import multer from "multer";
import crypto4 from "crypto";
import fs2 from "fs";
import path2 from "path";
import sharp from "sharp";
import { eq as eq23, and as and19, gte as gte6, desc as desc3, inArray as inArray3 } from "drizzle-orm";

// server/middleware/ai-guard.ts
init_db();
init_schema();
init_config();
init_entitlements();
import { eq as eq21 } from "drizzle-orm";
async function requireAiEnabled(req, res, next) {
  try {
    const [user] = await db.select({ aiFeaturesEnabled: users.aiFeaturesEnabled }).from(users).where(eq21(users.id, req.user.userId)).limit(1);
    if (!user || !user.aiFeaturesEnabled) {
      return res.status(403).json({
        error: {
          code: "AI_DISABLED",
          message: "Le funzionalit\xE0 AI sono disabilitate. Attivale nelle impostazioni per continuare."
        }
      });
    }
    if (config.aiRequiresPremium) {
      const familyIdParam = req.params.familyId;
      const familyIdBody = req.body?.familyId;
      const familyId = typeof familyIdParam === "string" ? familyIdParam : typeof familyIdBody === "string" ? familyIdBody : void 0;
      const premium = familyId ? await isPremium(familyId) : false;
      if (!premium) {
        return res.status(403).json({
          error: {
            code: "AI_PREMIUM_REQUIRED",
            message: "Le funzionalit\xE0 AI richiedono un abbonamento Premium attivo per questa famiglia."
          }
        });
      }
    }
    next();
  } catch {
    return res.status(500).json({
      error: { code: "SERVER_ERROR", message: "Errore nel controllo preferenze AI" }
    });
  }
}

// server/lib/openai.ts
import OpenAI, { toFile } from "openai";
import { z as z11 } from "zod";

// server/lib/ai-errors.ts
var USER_MESSAGES = {
  AI_NOT_CONFIGURED: "Le funzioni AI non sono al momento disponibili. Riprova pi\xF9 tardi.",
  AI_RATE_LIMITED: "Hai raggiunto il limite giornaliero per questa funzione AI. Riprova domani.",
  AI_USAGE_UNAVAILABLE: "Impossibile verificare il limite di utilizzo AI in questo momento. Riprova pi\xF9 tardi.",
  AI_TIMEOUT: "L'AI ci sta mettendo troppo tempo. Riprova tra poco.",
  AI_BAD_RESPONSE: "L'AI ha restituito una risposta non valida. Riprova.",
  AI_PROVIDER_ERROR: "Servizio AI temporaneamente non disponibile. Riprova tra poco."
};
var HTTP_STATUS = {
  AI_NOT_CONFIGURED: 503,
  AI_RATE_LIMITED: 429,
  AI_USAGE_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_BAD_RESPONSE: 502,
  AI_PROVIDER_ERROR: 502
};
var AiError = class extends Error {
  code;
  httpStatus;
  userMessage;
  constructor(code, internalMessage) {
    super(internalMessage || code);
    this.name = "AiError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.userMessage = USER_MESSAGES[code];
  }
};
function isAiError(err) {
  return err instanceof AiError;
}
function assertAiConfigured() {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new AiError("AI_NOT_CONFIGURED", "AI_INTEGRATIONS_OPENAI_API_KEY non configurata");
  }
}
function mapOpenAiError(error) {
  if (isAiError(error)) return error;
  const err = error;
  const status = typeof err?.status === "number" ? err.status : void 0;
  const name = err?.name || "";
  const code = err?.code || "";
  const type = err?.type || "";
  if (name === "SyntaxError" || name === "ZodError") {
    return new AiError("AI_BAD_RESPONSE", `OpenAI risposta non valida (${name})`);
  }
  if (name === "APITimeoutError" || name === "AbortError" || code === "ETIMEDOUT" || code === "ECONNABORTED" || /timed? ?out/i.test(err?.message || "")) {
    return new AiError("AI_TIMEOUT", `OpenAI timeout (${name || code})`);
  }
  if (status === 429 || code === "rate_limit_exceeded" || code === "insufficient_quota" || type === "insufficient_quota") {
    return new AiError("AI_RATE_LIMITED", `OpenAI rate limit (status ${status}, code ${code})`);
  }
  if (status === 401 || status === 403) {
    return new AiError("AI_NOT_CONFIGURED", `OpenAI auth error (status ${status})`);
  }
  if (name === "APIConnectionError" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return new AiError("AI_PROVIDER_ERROR", `OpenAI connection error (${name || code})`);
  }
  return new AiError("AI_PROVIDER_ERROR", `OpenAI error (status ${status ?? "n/a"})`);
}

// server/lib/openai.ts
var openaiClient = null;
function getOpenAiClient() {
  assertAiConfigured();
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      // baseURL opzionale: impostato solo se realmente configurato
      ...process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {},
      timeout: 6e4,
      maxRetries: 1
    });
  }
  return openaiClient;
}
var suggestionItemSchema = z11.object({
  name: z11.string(),
  category: z11.enum(["food", "household_cleaning", "personal_care", "other"]).catch("food"),
  reason: z11.string()
});
var suggestionsResponseSchema = z11.object({
  items: z11.array(suggestionItemSchema)
}).catch({ items: [] });
async function generateShoppingSuggestions(context) {
  const allForbidden = [
    ...context.recentPurchases,
    ...context.alreadyOnList,
    ...context.completedRecently,
    ...context.recentSuggestions,
    ...context.pantryItems ?? []
  ];
  const forbiddenSet = new Set(allForbidden.map(normalizeItemName).filter((n) => n.length > 0));
  const forbiddenText = forbiddenSet.size > 0 ? `

PRODOTTI VIETATI (NON suggerirli, la famiglia li ha gi\xE0): ${[...forbiddenSet].join(", ")}` : "";
  const randomSeed = Math.floor(Math.random() * 1e5);
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [{
        role: "system",
        content: `Sei un assistente per la lista della spesa al supermercato italiano.

REGOLE TASSATIVE:
- Genera esattamente 12 prodotti TUTTI DIVERSI tra loro.
- Nomi generici senza brand (es. "detersivo piatti" non "Fairy", "dentifricio" non "Colgate").
- INCLUDI un MIX di categorie, dando PRIORIT\xC0 agli alimentari di base di uso quotidiano:
  - Almeno 7 prodotti "food" (alimentari), privilegiando i beni essenziali per una famiglia: latte, pane, pasta, riso, uova, frutta, verdura, carne, pesce, latticini.
  - Almeno 2 prodotti "household_cleaning" (pulizia casa: detersivi, spugne, sacchetti, ecc.)
  - Almeno 1 prodotto "personal_care" (igiene personale: shampoo, dentifricio, sapone, ecc.)
- Le motivazioni devono essere pratiche e concrete (es. "versatile per primi e contorni", "ricco di proteine"), MAI generiche o banali.
- NON suggerire MAI prodotti presenti nella lista dei vietati.
- Rispondi SOLO con JSON nel formato: {"items": [{"name": "...", "category": "food"|"household_cleaning"|"personal_care"|"other", "reason": "..."}]}`
      }, {
        role: "user",
        content: `[seed:${randomSeed}] Famiglia di ${context.familySize} persone. Stagione: ${context.season}.${context.upcomingEvents.length > 0 ? ` Eventi in programma: ${context.upcomingEvents.join(", ")}.` : ""}${forbiddenText}

Genera 12 prodotti da supermercato NUOVI e DIVERSI da quelli vietati.`
      }],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content || '{"items": []}';
    const parsed = suggestionsResponseSchema.parse(JSON.parse(content));
    return parsed;
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
async function optimizeChoreSchedule(context) {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [{
        role: "system",
        content: "Sei un organizzatore equo di faccende domestiche. Bilancia le faccende tra i membri della famiglia."
      }, {
        role: "user",
        content: `Membri famiglia: ${JSON.stringify(context.members)}. Faccende da assegnare: ${JSON.stringify(context.chores)}. Assegna le faccende in modo equo considerando i punti accumulati. Rispondi con JSON: {"assignments": [{"choreId": "id", "memberId": "id", "reason": "motivazione"}]}`
      }],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content || '{"assignments": []}';
    return JSON.parse(content);
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
var singleRecipeSchema = z11.object({
  title: z11.coerce.string(),
  description: z11.coerce.string().catch(""),
  servings: z11.coerce.number().catch(4),
  prepTimeMinutes: z11.coerce.number().catch(15),
  cookTimeMinutes: z11.coerce.number().catch(30),
  steps: z11.array(z11.coerce.string()).catch([]),
  tags: z11.object({
    diet: z11.array(z11.coerce.string()).optional(),
    allergens: z11.array(z11.coerce.string()).optional(),
    cuisine: z11.coerce.string().optional(),
    difficulty: z11.coerce.string().optional()
  }).catch({}),
  ingredients: z11.array(z11.object({
    name: z11.coerce.string(),
    quantity: z11.coerce.string().optional(),
    unit: z11.coerce.string().optional(),
    category: z11.coerce.string().optional(),
    notes: z11.coerce.string().optional()
  }).catchall(z11.unknown())).catch([])
}).catchall(z11.unknown());
function sanitizeKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sanitizeKeys);
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = key.replace(/[\s:]+$/g, "").replace(/^[\s:]+/g, "").trim();
      result[cleanKey] = sanitizeKeys(value);
    }
    return result;
  }
  if (typeof obj === "string") return obj.trim();
  return obj;
}
function parseRecipesResponse(raw) {
  if (!raw || typeof raw !== "object") return [];
  const sanitized = sanitizeKeys(raw);
  const arr = Array.isArray(sanitized.recipes) ? sanitized.recipes : [];
  const results = [];
  for (const item of arr) {
    try {
      const parsed = singleRecipeSchema.parse(item);
      if (parsed.title && (parsed.steps.length > 0 || parsed.ingredients.length > 0)) {
        results.push(parsed);
      }
    } catch (e) {
      console.error("Skipping malformed recipe:", JSON.stringify(item)?.slice(0, 200), e);
    }
  }
  return results;
}
var RECIPES_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "recipes_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        recipes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              servings: { type: "integer" },
              prepTimeMinutes: { type: "integer" },
              cookTimeMinutes: { type: "integer" },
              steps: { type: "array", items: { type: "string" } },
              tags: {
                type: "object",
                additionalProperties: false,
                properties: {
                  diet: { type: "array", items: { type: "string" } },
                  allergens: { type: "array", items: { type: "string" } },
                  cuisine: { type: "string" },
                  difficulty: { type: "string" }
                },
                required: ["diet", "allergens", "cuisine", "difficulty"]
              },
              ingredients: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "string" },
                    unit: { type: "string" },
                    category: { type: "string" }
                  },
                  required: ["name", "quantity", "unit", "category"]
                }
              }
            },
            required: ["title", "description", "servings", "prepTimeMinutes", "cookTimeMinutes", "steps", "tags", "ingredients"]
          }
        }
      },
      required: ["recipes"]
    }
  }
};
var MEAL_PLAN_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "meal_plan_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              date: { type: "string" },
              mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
              title: { type: "string" },
              description: { type: "string" },
              ingredients: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "string" },
                    unit: { type: "string" }
                  },
                  required: ["name", "quantity", "unit"]
                }
              },
              steps: { type: "array", items: { type: "string" } }
            },
            required: ["date", "mealType", "title", "description", "ingredients", "steps"]
          }
        }
      },
      required: ["items"]
    }
  }
};
async function generateRecipeSuggestions(context) {
  const count2 = context.count || 8;
  const randomSeed = Math.floor(Math.random() * 1e5);
  const dietText = context.dietaryPreferences ? `
Dieta: ${Array.isArray(context.dietaryPreferences) ? context.dietaryPreferences.join(", ") : context.dietaryPreferences}.` : "";
  const allergyText = context.allergies ? `
Allergie/intolleranze: ${Array.isArray(context.allergies) ? context.allergies.join(", ") : context.allergies}.` : "";
  const timeText = context.maxTimeMinutes ? `
Tempo massimo di preparazione+cottura: ${context.maxTimeMinutes} minuti.` : "";
  const cuisineText = context.cuisinePreferences?.length ? `
Cucine preferite: ${context.cuisinePreferences.join(", ")}.` : "";
  const excludeText = context.excludedIngredients?.length ? `
Ingredienti da ESCLUDERE: ${context.excludedIngredients.join(", ")}.` : "";
  const lastTitlesText = context.lastRecipeTitles?.length ? `

TITOLI GI\xC0 GENERATI (NON ripeterli, inventa piatti COMPLETAMENTE diversi): ${context.lastRecipeTitles.join(", ")}` : "";
  const pantryText = context.pantryIngredients?.length ? `
INGREDIENTI GI\xC0 IN DISPENSA (dai priorit\xE0 a ricette che li usano, per evitare sprechi): ${context.pantryIngredients.slice(0, 40).join(", ")}.` : "";
  const allCategories = [
    "pasta",
    "risotto",
    "zuppa",
    "insalata",
    "carne al forno",
    "pesce",
    "contorno",
    "piatto unico vegetariano",
    "frittata/torta salata",
    "legumi",
    "pizza/focaccia",
    "secondo di carne in padella",
    "gnocchi",
    "polenta",
    "crostini/bruschetta",
    "stufato"
  ];
  const shuffled = allCategories.sort(() => Math.random() - 0.5);
  const selectedCats = shuffled.slice(0, count2);
  async function fetchRecipeBatch(cats, seed) {
    const n = cats.length;
    const catList = cats.join(", ");
    const sysPrompt = `Genera ${n} ricette italiane JSON.{"recipes":[{"title":"nome","description":"breve","servings":4,"prepTimeMinutes":10,"cookTimeMinutes":20,"steps":["..."],"tags":{"diet":[],"allergens":[],"cuisine":"italiana","difficulty":"facile"},"ingredients":[{"name":"x","quantity":"200","unit":"g","category":"y"}]}]}
Categorie:${catList}. Quantity stringa. INVENTA piatti ORIGINALI e DIVERSI ogni volta.`;
    const userMsg = `${seed} ${context.familySize}pers${dietText}${allergyText}${timeText}${cuisineText}${excludeText}${pantryText}${lastTitlesText}`;
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: userMsg }
      ],
      response_format: RECIPES_RESPONSE_FORMAT,
      max_completion_tokens: 2500
    });
    const content = response.choices[0].message.content || '{"recipes": []}';
    console.log(`AI batch (${n} cats): finish=${response.choices[0].finish_reason}, len=${content.length}`);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Recipe JSON parse error:", content?.slice(0, 300));
      throw mapOpenAiError(e);
    }
    return parseRecipesResponse(parsed);
  }
  assertAiConfigured();
  try {
    const startTime = Date.now();
    const BATCH = 3;
    const batches = [];
    for (let i = 0; i < selectedCats.length; i += BATCH) {
      batches.push(selectedCats.slice(i, i + BATCH));
    }
    const settled = await Promise.allSettled(
      batches.map((cats, idx) => fetchRecipeBatch(cats, randomSeed + idx * 7919))
    );
    const allRecipes = [];
    let firstReason = null;
    for (const s of settled) {
      if (s.status === "fulfilled") {
        allRecipes.push(...s.value);
      } else {
        if (firstReason === null) firstReason = s.reason;
        console.error("Recipe batch failed:", String(s.reason));
      }
    }
    if (allRecipes.length === 0 && firstReason !== null) {
      throw mapOpenAiError(firstReason);
    }
    const elapsed = Date.now() - startTime;
    console.log(`Recipe generation: ${allRecipes.length} recipes in ${elapsed}ms (${batches.length} parallel batches)`);
    const seenTitles = /* @__PURE__ */ new Set();
    const unique2 = allRecipes.filter((r) => {
      const norm = r.title.toLowerCase().trim();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });
    console.log(`Final recipe count: ${unique2.length}`);
    return { recipes: unique2 };
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
async function searchRecipesByQuery(query, context) {
  const randomSeed = Math.floor(Math.random() * 1e5);
  const excludeList = (context.excludeTitles || []).slice(-30);
  const excludeLine = excludeList.length > 0 ? ` Evita di riproporre queste ricette gi\xE0 mostrate: ${excludeList.join(", ")}.` : "";
  assertAiConfigured();
  try {
    const startTime = Date.now();
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [
        {
          role: "system",
          content: `Genera ricette italiane basate sulla richiesta dell'utente. JSON:{"recipes":[{"title":"nome","description":"breve","servings":4,"prepTimeMinutes":10,"cookTimeMinutes":20,"steps":["..."],"tags":{"diet":[],"allergens":[],"cuisine":"italiana","difficulty":"facile"},"ingredients":[{"name":"x","quantity":"200","unit":"g","category":"y"}]}]}
Quantity stringa. Genera esattamente 3 ricette pertinenti alla ricerca. Ogni ricetta DEVE contenere l'ingrediente cercato.${excludeLine}`
        },
        {
          role: "user",
          content: `[s:${randomSeed}] Famiglia ${context.familySize} persone. Cerca: "${query}"`
        }
      ],
      response_format: RECIPES_RESPONSE_FORMAT,
      max_completion_tokens: 2500
    });
    const content = response.choices[0].message.content || '{"recipes": []}';
    const elapsed = Date.now() - startTime;
    console.log(`Recipe search "${query}": ${elapsed}ms, len=${content.length}`);
    const parsed = JSON.parse(content);
    return { recipes: parseRecipesResponse(parsed) };
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
var mealPlanIngredientSchema = z11.object({
  name: z11.coerce.string(),
  quantity: z11.coerce.string().optional(),
  unit: z11.coerce.string().optional()
}).catchall(z11.unknown());
var mealItemSchema = z11.object({
  date: z11.coerce.string(),
  mealType: z11.enum(["breakfast", "lunch", "dinner", "snack"]),
  title: z11.coerce.string(),
  description: z11.coerce.string().optional(),
  ingredients: z11.array(mealPlanIngredientSchema).optional().catch([]),
  steps: z11.array(z11.coerce.string()).optional().catch([])
}).catchall(z11.unknown());
function parseMealItems(raw) {
  if (!raw || typeof raw !== "object") return [];
  const sanitized = sanitizeKeys(raw);
  const arr = Array.isArray(sanitized.items) ? sanitized.items : [];
  const results = [];
  for (const item of arr) {
    try {
      const parsed = mealItemSchema.parse(item);
      if (parsed.title && parsed.date) {
        results.push(parsed);
      }
    } catch {
    }
  }
  return results;
}
async function generateWeeklyMealPlan(context) {
  const mealsPerDay = context.preferences?.mealsPerDay || 3;
  const mealTypes = mealsPerDay >= 4 ? ["breakfast", "lunch", "dinner", "snack"] : mealsPerDay >= 3 ? ["breakfast", "lunch", "dinner"] : ["lunch", "dinner"];
  const variant = context.planVariant || 1;
  const variantHint = variant === 1 ? "Crea un piano equilibrato e classico con piatti tradizionali italiani." : "Crea un piano creativo e diverso con piatti pi\xF9 originali e meno convenzionali.";
  const rawNotes = typeof context.preferences?.notes === "string" ? context.preferences.notes.trim().slice(0, 600) : "";
  const prefText = context.preferences ? `${context.preferences.diet ? ` Dieta: ${context.preferences.diet}.` : ""}${context.preferences.allergies ? ` Allergie: ${context.preferences.allergies}.` : ""}${context.preferences.maxTimeMinutes ? ` Tempo max preparazione: ${context.preferences.maxTimeMinutes} min.` : ""}${rawNotes ? ` Preferenze della famiglia (dettate a voce, seguile con attenzione): ${rawNotes}.` : ""}` : "";
  const dates = [];
  const start = new Date(context.weekStartDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  const CHUNK = 1;
  const chunks = [];
  for (let i = 0; i < dates.length; i += CHUNK) {
    chunks.push(dates.slice(i, i + CHUNK));
  }
  const mealOrder = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
  async function fetchChunk(chunkDates, excludeTitles) {
    const excludeRule = excludeTitles.length ? `
- VARIET\xC0 OBBLIGATORIA: questi piatti sono GI\xC0 stati pianificati in altri giorni della settimana, quindi NON riproporli e NON proporne di simili: ${excludeTitles.join("; ")}. Scegli piatti chiaramente DIVERSI per ogni pasto.` : "";
    const sysPrompt = `Sei un nutrizionista italiano. Genera i pasti SOLO per questi giorni: ${chunkDates.join(", ")}.
REGOLE:
- Per ogni giorno genera esattamente ${mealsPerDay} pasti: ${mealTypes.join(", ")}.
- Ogni item ha: date (una YYYY-MM-DD tra quelle indicate), mealType (${mealTypes.join("|")}), title (nome piatto in italiano), description (breve), ingredients (array), steps (array).
- Ogni ingrediente ha: name (italiano), quantity (stringa, es. "200"), unit (es. "g", "ml", "pezzi").
- steps \xE8 la RICETTA passo-passo: da 3 a 6 passaggi brevi e chiari in italiano per preparare il piatto (ogni passaggio \xE8 una stringa, senza numerazione iniziale).
- IMPORTANTE: ogni piatto DEVE essere adatto al suo tipo di pasto secondo le abitudini italiane:
  - breakfast (colazione): SOLO colazione italiana tipica, dolce e leggera. Es. cappuccino e cornetto, latte e biscotti, fette biscottate con marmellata, yogurt con cereali e frutta, pane con marmellata o miele, crostata, ciambellone, pancake, porridge, spremuta con plumcake. MAI piatti salati come pasta, carne, pesce, verdure cotte o bruschette salate.
  - lunch (pranzo): pasto principale completo (es. primo di pasta/riso o piatto unico con contorno).
  - dinner (cena): pasto pi\xF9 leggero del pranzo (es. secondo di carne/pesce/uova/legumi con verdure, zuppe, minestre).
  - snack (spuntino): piccolo e leggero (es. frutta, yogurt, frutta secca, una merenda).
- Includi tutti gli ingredienti necessari. Non ripetere lo stesso piatto nello stesso giorno.${excludeRule}
- ${variantHint}
- Rispondi SOLO con JSON: {"items":[{"date":"YYYY-MM-DD","mealType":"...","title":"...","description":"...","ingredients":[{"name":"...","quantity":"...","unit":"..."}],"steps":["passaggio 1","passaggio 2","passaggio 3"]}]}`;
    const userMsg = `Famiglia di ${context.familySize} persone.${prefText}`;
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: userMsg }
      ],
      response_format: MEAL_PLAN_RESPONSE_FORMAT,
      max_completion_tokens: 4e3
    });
    const content = response.choices[0].message.content || '{"items":[]}';
    const parsed = JSON.parse(content);
    return parseMealItems(parsed);
  }
  assertAiConfigured();
  const validDates = new Set(dates);
  const aiStartTime = Date.now();
  const allItems = [];
  const usedTitles = [];
  let failedChunks = 0;
  let firstReason = null;
  for (const chunkDates of chunks) {
    try {
      const items = await fetchChunk(chunkDates, usedTitles);
      allItems.push(...items);
      for (const it of items) {
        if (it.title) usedTitles.push(it.title);
      }
      if (context.onProgress) {
        const dayItems = items.filter((it) => validDates.has(it.date)).sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (mealOrder[a.mealType] ?? 99) - (mealOrder[b.mealType] ?? 99);
        });
        if (dayItems.length) {
          try {
            context.onProgress(dayItems);
          } catch {
          }
        }
      }
    } catch (reason) {
      failedChunks++;
      if (firstReason === null) firstReason = reason;
      console.error("Meal plan chunk failed:", String(reason));
    }
  }
  const filtered = allItems.filter((it) => validDates.has(it.date));
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (mealOrder[a.mealType] ?? 99) - (mealOrder[b.mealType] ?? 99);
  });
  const aiDurationMs = Date.now() - aiStartTime;
  console.log(JSON.stringify({ tag: "AI_MEAL_PLAN_CALL", variant, aiDurationMs, chunks: chunks.length, failedChunks, itemsCount: filtered.length }));
  if (filtered.length === 0 && firstReason !== null) {
    throw mapOpenAiError(firstReason);
  }
  return { title: "Piano Settimanale", items: filtered };
}
async function generateFamilyInsights(context) {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [{
        role: "system",
        content: "Sei un consulente familiare. Fornisci insight utili basati sui dati."
      }, {
        role: "user",
        content: `Dati settimanali famiglia: ${context.events} eventi, ${context.completedChores} faccende completate, ${context.pendingChores} in sospeso. Top contributor: ${context.topContributor} con ${context.weeklyPoints} punti. Genera 3 insight motivanti. Rispondi con JSON: {"insights": [{"title": "titolo", "description": "descrizione", "type": "achievement|suggestion|reminder"}]}`
      }],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content || '{"insights": []}';
    return JSON.parse(content);
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
async function generateBudgetInsights(context) {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [{
        role: "system",
        content: "Sei un consulente finanziario familiare italiano. Analizzi le spese e dai consigli pratici e concreti per risparmiare, in tono amichevole. Rispondi SEMPRE in italiano."
      }, {
        role: "user",
        content: `Spese famiglia mese ${context.month}: totale ${context.total.toFixed(2)}\u20AC. Per categoria: ${context.categories.map((c) => `${c.category} ${c.total.toFixed(2)}\u20AC (${c.count} spese)`).join(", ") || "nessuna spesa"}. Tetti budget: ${context.budgets.map((b) => `${b.category} ${b.monthlyLimit.toFixed(2)}\u20AC`).join(", ") || "nessuno"}. Trend ultimi mesi: ${context.trend.map((t) => `${t.month}: ${t.total.toFixed(2)}\u20AC`).join(", ")}. Analizza le abitudini di spesa e genera 3-4 consigli concreti per risparmiare, basati sui dati reali (categorie pi\xF9 pesanti, superamenti o rischi di sforare i tetti, andamento del trend). Rispondi con JSON: {"insights": [{"title": "titolo breve", "description": "consiglio pratico (max 2 frasi)", "type": "warning|suggestion|achievement"}]}`
      }],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content || '{"insights": []}';
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) {
      throw new AiError("AI_BAD_RESPONSE", "budget-insights: nessun insight generato");
    }
    return parsed;
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
async function transcribeAudio(input) {
  assertAiConfigured();
  try {
    const file = await toFile(input.buffer, input.filename, { type: input.mimeType });
    const response = await getOpenAiClient().audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "it"
    });
    const text2 = (response.text || "").trim();
    return { text: text2 };
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
async function generateRecipeImage(input) {
  assertAiConfigured();
  try {
    const details = input.description ? ` ${input.description}` : "";
    const prompt = `Fotografia food professionale del piatto italiano "${input.title}".${details} Piatto ben impiattato su un tavolo, luce naturale, inquadratura dall'alto leggermente angolata, sfondo semplice e pulito, aspetto appetitoso e realistico. Nessun testo, nessuna scritta, nessuna persona.`;
    const response = await getOpenAiClient().images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "low"
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("Nessuna immagine generata");
    }
    return Buffer.from(b64, "base64");
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
var parsedEventSchema = z11.object({
  title: z11.string().catch(""),
  location: z11.string().nullable().catch(null),
  description: z11.string().nullable().catch(null),
  date: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  time: z11.string().regex(/^\d{2}:\d{2}$/).nullable().catch(null),
  endTime: z11.string().regex(/^\d{2}:\d{2}$/).nullable().catch(null),
  repeat: z11.enum(["daily", "weekly", "monthly"]).nullable().catch(null),
  weekdays: z11.array(z11.number().int().min(1).max(7)).catch([]),
  monthDays: z11.array(z11.number().int().min(1).max(31)).catch([]),
  assigneeName: z11.string().nullable().catch(null)
});
async function parseEventFromText(input) {
  assertAiConfigured();
  const memberList = (input.memberNames ?? []).slice(0, 20).map((n) => n.slice(0, 60));
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [{
        role: "system",
        content: `Estrai i dati di un evento calendario da una frase in italiano.

REGOLE:
- Oggi \xE8 ${input.todayIso} (${input.weekdayName}), fuso orario Europe/Rome. Risolvi date relative ("domani", "venerd\xEC", "il 15") in date assolute FUTURE (mai nel passato).
- "title": titolo breve e naturale dell'evento (es. "Cena con Marco"), senza data/ora/luogo.
- "location": il luogo se indicato (es. "da Luigi", "in piscina" \u2192 "Luigi", "Piscina"), altrimenti null.
- "description": eventuali dettagli extra non coperti dagli altri campi, altrimenti null.
- "date": data in formato YYYY-MM-DD, null se non deducibile.
- "time": ora di inizio HH:MM (24h), null se non indicata.
- "endTime": ora di fine HH:MM (24h), null se non indicata.
- "repeat": frequenza di ripetizione se l'evento \xE8 ricorrente: "daily" (ogni giorno o solo alcuni giorni della settimana, es. "tutti i giorni", "ogni marted\xEC e gioved\xEC"), "weekly" (una volta a settimana in uno o pi\xF9 giorni, es. "ogni settimana il luned\xEC"), "monthly" (in giorni fissi del mese, es. "il 1\xB0 e il 15 di ogni mese"). null se l'evento non si ripete.
- "weekdays": con repeat "daily" o "weekly", i giorni della settimana come numeri ISO (1=luned\xEC, 2=marted\xEC, 3=mercoled\xEC, 4=gioved\xEC, 5=venerd\xEC, 6=sabato, 7=domenica), es. "ogni marted\xEC e gioved\xEC" \u2192 [2,4]. Altrimenti [].
- "monthDays": con repeat "monthly", i giorni del mese (1-31), es. "il 1\xB0 e il 15" \u2192 [1,15]. Altrimenti [].
- Se l'utente dice "ogni <giorno>" (es. "ogni marted\xEC e gioved\xEC") usa repeat "weekly" con i weekdays indicati.
- Con "repeat", "date" \xE8 la PRIMA occorrenza futura coerente con la regola (es. il prossimo marted\xEC).
${memberList.length > 0 ? `- "assigneeName": se il testo dice a chi \xE8 assegnato/di chi \xE8 l'evento (es. "per Marco", "assegnalo a Anna", "porta Luca a calcio"), scegli il nome ESATTO pi\xF9 vicino da questa lista: ${JSON.stringify(memberList)}. null se non indicato o nessun nome corrisponde. Un nome citato solo come compagnia (es. "cena CON Marco") non \xE8 un assegnatario a meno che non sia nella lista e il contesto lo suggerisca.` : '- "assigneeName": sempre null.'}
- Rispondi SOLO con JSON: {"title": "...", "location": ..., "description": ..., "date": ..., "time": ..., "endTime": ..., "repeat": ..., "weekdays": [...], "monthDays": [...], "assigneeName": ...}`
      }, {
        role: "user",
        content: input.text
      }],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content || "{}";
    const parsed = parsedEventSchema.parse(JSON.parse(content));
    const hasUsefulField = parsed.title.trim().length > 0 || parsed.location || parsed.description || parsed.date || parsed.time || parsed.endTime || parsed.repeat || parsed.assigneeName;
    if (!hasUsefulField) {
      throw new AiError("AI_BAD_RESPONSE", "parse-event: nessun campo estratto dal testo");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapOpenAiError(error);
  }
}
var parsedChoreSchema = z11.object({
  title: z11.string().catch(""),
  description: z11.string().nullable().catch(null),
  points: z11.number().int().min(1).max(100).nullable().catch(null),
  difficulty: z11.number().int().min(1).max(5).nullable().catch(null),
  estimatedMinutes: z11.number().int().min(1).max(600).nullable().catch(null),
  dueDate: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  repeat: z11.enum(["daily", "weekly", "monthly"]).nullable().catch(null),
  weekdays: z11.array(z11.number().int().min(1).max(7)).catch([]),
  monthDays: z11.array(z11.number().int().min(1).max(31)).catch([]),
  assigneeName: z11.string().nullable().catch(null)
});
async function parseChoreFromText(input) {
  assertAiConfigured();
  const memberList = (input.memberNames ?? []).slice(0, 20).map((n) => n.slice(0, 60));
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [{
        role: "system",
        content: `Estrai i dati di una faccenda domestica da una frase in italiano.

REGOLE:
- Oggi \xE8 ${input.todayIso} (${input.weekdayName}), fuso orario Europe/Rome. Risolvi date relative ("domani", "venerd\xEC") in date assolute FUTURE (mai nel passato).
- "title": titolo breve e naturale della faccenda (es. "Buttare la spazzatura"), senza punti/giorni/assegnatario.
- "description": eventuali dettagli extra non coperti dagli altri campi, altrimenti null.
- "points": i punti se indicati (es. "vale 15 punti" \u2192 15), numero intero 1-100, altrimenti null.
- "difficulty": difficolt\xE0 1-5 solo se indicata esplicitamente (es. "difficolt\xE0 4", "molto difficile" \u2192 5, "facilissima" \u2192 1), altrimenti null.
- "estimatedMinutes": durata stimata in minuti se indicata (es. "ci vuole mezz'ora" \u2192 30), altrimenti null.
- "dueDate": data di scadenza YYYY-MM-DD se indicata una scadenza singola, null se non deducibile o se la faccenda \xE8 ricorrente.
- "repeat": frequenza se la faccenda \xE8 ricorrente: "daily" (ogni giorno o alcuni giorni della settimana), "weekly" (una volta a settimana in uno o pi\xF9 giorni, es. "ogni marted\xEC e gioved\xEC"), "monthly" (giorni fissi del mese, es. "il 1\xB0 e il 15 di ogni mese"). null se non si ripete.
- "weekdays": con repeat "daily" o "weekly", i giorni della settimana come numeri ISO (1=luned\xEC ... 7=domenica), es. "ogni marted\xEC e gioved\xEC" \u2192 [2,4]. Altrimenti [].
- "monthDays": con repeat "monthly", i giorni del mese (1-31), es. "il 1\xB0 e il 15" \u2192 [1,15]. Altrimenti [].
- Se l'utente dice "ogni <giorno>" usa repeat "weekly" con i weekdays indicati.
${memberList.length > 0 ? `- "assigneeName": se il testo dice a chi \xE8 assegnata la faccenda (es. "per Marco", "tocca a Anna", "assegnala a Luca"), scegli il nome ESATTO pi\xF9 vicino da questa lista: ${JSON.stringify(memberList)}. null se non indicato o nessun nome corrisponde.` : '- "assigneeName": sempre null.'}
- Rispondi SOLO con JSON: {"title": "...", "description": ..., "points": ..., "difficulty": ..., "estimatedMinutes": ..., "dueDate": ..., "repeat": ..., "weekdays": [...], "monthDays": [...], "assigneeName": ...}`
      }, {
        role: "user",
        content: input.text
      }],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content || "{}";
    const parsed = parsedChoreSchema.parse(JSON.parse(content));
    const hasUsefulField = parsed.title.trim().length > 0 || parsed.description || parsed.points || parsed.difficulty || parsed.estimatedMinutes || parsed.dueDate || parsed.repeat || parsed.assigneeName;
    if (!hasUsefulField) {
      throw new AiError("AI_BAD_RESPONSE", "parse-chore: nessun campo estratto dal testo");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapOpenAiError(error);
  }
}
var parsedExpenseSchema = z11.object({
  amount: z11.number().positive().max(1e6).nullable().catch(null),
  category: z11.enum(["alimentari", "trasporti", "svago", "salute", "casa", "abbigliamento", "istruzione", "altro"]).nullable().catch(null),
  description: z11.string().nullable().catch(null)
});
async function parseExpenseFromText(text2) {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      messages: [{
        role: "system",
        content: `Estrai una spesa familiare da una frase in italiano.

REGOLE:
- "amount": importo in euro come numero (es. "50 euro", "24,50\u20AC" \u2192 50, 24.5). null se non indicato.
- "category": UNA tra: "alimentari" (spesa, supermercato, cibo), "trasporti" (benzina, carburante, treno, bus, autostrada, parcheggio, auto), "svago" (cinema, ristorante, pizza fuori, giochi, sport), "salute" (farmacia, medico, dentista), "casa" (mobili, riparazioni, giardino, detersivi), "abbigliamento" (vestiti, scarpe), "istruzione" (scuola, libri, corsi), "altro" (tutto il resto). null se non deducibile.
- "description": descrizione breve e naturale della spesa (es. "Benzina"), senza importo. null se non c'\xE8 nulla di utile.
- Rispondi SOLO con JSON: {"amount": ..., "category": ..., "description": ...}`
      }, {
        role: "user",
        content: text2
      }],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0].message.content || "{}";
    const parsed = parsedExpenseSchema.parse(JSON.parse(content));
    if (parsed.amount === null && parsed.category === null) {
      throw new AiError("AI_BAD_RESPONSE", "parse-expense: nessun campo estratto dal testo");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapOpenAiError(error);
  }
}

// server/routes/ai.ts
init_logger();
init_schema();

// server/lib/ai-usage.ts
init_db();
init_schema();
init_logger();
import { and as and18, eq as eq22, gte as gte5, sql as sql9 } from "drizzle-orm";
init_entitlements();
var PLAN_LIMITS = {
  free: {
    "shopping-suggestions": { max: 2, window: "day" },
    "recipe-search": { max: 2, window: "day" },
    "recipe-suggestions": { max: 1, window: "day" },
    "weekly-meal-plan": { max: 1, window: "week" },
    insights: { max: 1, window: "week" },
    "chore-optimization": { max: 1, window: "day" },
    "voice-transcription": { max: 3, window: "day" },
    "recipe-image": { max: 10, window: "day" },
    "event-parse": { max: 3, window: "day" },
    "expense-parse": { max: 3, window: "day" },
    "chore-parse": { max: 3, window: "day" },
    "budget-insights": { max: 1, window: "week" }
  },
  premium: {
    "shopping-suggestions": { max: 15, window: "day" },
    "recipe-search": { max: 25, window: "day" },
    "recipe-suggestions": { max: 15, window: "day" },
    "weekly-meal-plan": { max: 8, window: "day" },
    insights: { max: 10, window: "day" },
    "chore-optimization": { max: 15, window: "day" },
    "voice-transcription": { max: 35, window: "day" },
    "recipe-image": { max: 55, window: "day" },
    "event-parse": { max: 40, window: "day" },
    "expense-parse": { max: 40, window: "day" },
    "chore-parse": { max: 40, window: "day" },
    "budget-insights": { max: 10, window: "day" }
  }
};
var AI_DAILY_LIMITS = {
  "shopping-suggestions": PLAN_LIMITS.premium["shopping-suggestions"].max,
  "recipe-search": PLAN_LIMITS.premium["recipe-search"].max,
  "recipe-suggestions": PLAN_LIMITS.premium["recipe-suggestions"].max,
  "weekly-meal-plan": PLAN_LIMITS.premium["weekly-meal-plan"].max,
  insights: PLAN_LIMITS.premium.insights.max,
  "chore-optimization": PLAN_LIMITS.premium["chore-optimization"].max,
  "voice-transcription": PLAN_LIMITS.premium["voice-transcription"].max,
  "recipe-image": PLAN_LIMITS.premium["recipe-image"].max,
  "event-parse": PLAN_LIMITS.premium["event-parse"].max,
  "expense-parse": PLAN_LIMITS.premium["expense-parse"].max,
  "chore-parse": PLAN_LIMITS.premium["chore-parse"].max,
  "budget-insights": PLAN_LIMITS.premium["budget-insights"].max
};
function startOfToday2() {
  const d = /* @__PURE__ */ new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeek() {
  const d = /* @__PURE__ */ new Date();
  d.setHours(0, 0, 0, 0);
  const dayFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayFromMonday);
  return d;
}
function windowStart(window) {
  return window === "week" ? startOfWeek() : startOfToday2();
}
function lockKey2(familyId, feature) {
  return `ai_usage:${familyId}:${feature}`;
}
var dbStore = {
  async reserve(userId, familyId, feature, max, since, window) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql9`SELECT pg_advisory_xact_lock(hashtext(${lockKey2(familyId, feature)}))`);
        const [row] = await tx.select({ count: sql9`count(*)::int` }).from(aiUsage).where(
          and18(
            eq22(aiUsage.familyId, familyId),
            eq22(aiUsage.feature, feature),
            gte5(aiUsage.createdAt, since)
          )
        );
        const used = row?.count ?? 0;
        if (used >= max) {
          return { status: "limited", used, max, window };
        }
        const [inserted] = await tx.insert(aiUsage).values({ userId, familyId, feature, status: "started" }).returning({ id: aiUsage.id });
        return { status: "ok", usageId: inserted.id, used: used + 1 };
      });
    } catch (err) {
      logger.error("reserveAiSlot failed", { feature, error: String(err) });
      return { status: "unavailable" };
    }
  },
  async finalize(usageId, success) {
    try {
      await db.update(aiUsage).set({ status: success ? "succeeded" : "failed", updatedAt: /* @__PURE__ */ new Date() }).where(eq22(aiUsage.id, usageId));
    } catch (err) {
      logger.error("finalizeAiUsage failed", { usageId, success, error: String(err) });
    }
  }
};
var store2 = dbStore;
async function resolveFeatureLimit(familyId, feature) {
  const plan = await getPlanForFamily(familyId);
  return PLAN_LIMITS[plan][feature];
}
async function isFamilyAdmin(userId, familyId) {
  try {
    const [m] = await db.select({ role: familyMembers.role }).from(familyMembers).where(and18(eq22(familyMembers.userId, userId), eq22(familyMembers.familyId, familyId))).limit(1);
    return m?.role === "admin";
  } catch (err) {
    logger.error("isFamilyAdmin check failed", { userId, familyId, error: String(err) });
    return false;
  }
}
async function reserveAiSlot(userId, familyId, feature) {
  assertAiConfigured();
  const { max, window } = await resolveFeatureLimit(familyId, feature);
  const admin = await isFamilyAdmin(userId, familyId);
  const effectiveMax = admin ? Number.MAX_SAFE_INTEGER : max;
  return store2.reserve(userId, familyId, feature, effectiveMax, windowStart(window), window);
}
async function finalizeAiUsage(usageId, success) {
  return store2.finalize(usageId, success);
}
async function withAiUsage(ctx, fn) {
  const reservation = await reserveAiSlot(ctx.userId, ctx.familyId, ctx.feature);
  if (reservation.status === "limited") {
    return { outcome: "limited", used: reservation.used, max: reservation.max, window: reservation.window };
  }
  if (reservation.status === "unavailable") {
    return { outcome: "unavailable" };
  }
  const usageId = reservation.usageId;
  try {
    const value = await fn();
    await finalizeAiUsage(usageId, true);
    return { outcome: "ok", value };
  } catch (err) {
    await finalizeAiUsage(usageId, false);
    throw err;
  }
}

// server/lib/ai-policy.ts
var MEAL_PLAN_MAX_VARIANTS = 1;
function resolveMealPlanVariants(raw) {
  const requested = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 1;
  if (requested < 1) return 1;
  return Math.min(requested, MEAL_PLAN_MAX_VARIANTS);
}

// server/routes/ai.ts
var router12 = Router12();
function sendAiError(res, error, fallbackMsg) {
  if (isAiError(error)) {
    return res.status(error.httpStatus).json({ error: { code: error.code, message: error.userMessage } });
  }
  return res.status(500).json({ error: { code: "AI_ERROR", message: fallbackMsg } });
}
function sendRateLimited(res, max, window = "day") {
  const periodo = window === "week" ? "settimanale" : "giornaliero";
  const quando = window === "week" ? "Riprova la prossima settimana o passa a Premium." : "Riprova domani o passa a Premium.";
  return res.status(429).json({
    error: {
      code: "AI_RATE_LIMITED",
      message: `Hai raggiunto il limite ${periodo} (${max}) per questa funzione AI. ${quando}`
    }
  });
}
function sendUsageUnavailable(res) {
  return res.status(503).json({
    error: {
      code: "AI_USAGE_UNAVAILABLE",
      message: "Impossibile verificare il limite di utilizzo AI in questo momento. Riprova pi\xF9 tardi."
    }
  });
}
function getCurrentSeason() {
  const month = (/* @__PURE__ */ new Date()).getMonth();
  if (month >= 2 && month <= 4) return "primavera";
  if (month >= 5 && month <= 7) return "estate";
  if (month >= 8 && month <= 10) return "autunno";
  return "inverno";
}
var FALLBACK_POOL = [
  { name: "detersivo piatti", category: "household_cleaning", reason: "Essenziale per lavare le stoviglie" },
  { name: "detersivo lavatrice", category: "household_cleaning", reason: "Per il bucato settimanale" },
  { name: "ammorbidente", category: "household_cleaning", reason: "Rende i tessuti pi\xF9 morbidi" },
  { name: "candeggina", category: "household_cleaning", reason: "Utile per igienizzare superfici" },
  { name: "sgrassatore", category: "household_cleaning", reason: "Per pulire cucina e piani cottura" },
  { name: "panni microfibra", category: "household_cleaning", reason: "Ideali per spolverare senza residui" },
  { name: "spugne cucina", category: "household_cleaning", reason: "Da sostituire regolarmente per igiene" },
  { name: "sacchetti immondizia", category: "household_cleaning", reason: "Indispensabili per la raccolta rifiuti" },
  { name: "spray vetri", category: "household_cleaning", reason: "Per specchi e finestre senza aloni" },
  { name: "shampoo", category: "personal_care", reason: "Per la cura quotidiana dei capelli" },
  { name: "bagnoschiuma", category: "personal_care", reason: "Per la doccia di tutta la famiglia" },
  { name: "dentifricio", category: "personal_care", reason: "Per l'igiene orale quotidiana" },
  { name: "spazzolini da denti", category: "personal_care", reason: "Da sostituire ogni 3 mesi" },
  { name: "filo interdentale", category: "personal_care", reason: "Complemento allo spazzolino" },
  { name: "deodorante", category: "personal_care", reason: "Per la freschezza quotidiana" },
  { name: "sapone mani", category: "personal_care", reason: "Per l'igiene delle mani" },
  { name: "crema idratante", category: "personal_care", reason: "Per proteggere la pelle" },
  { name: "carta igienica", category: "personal_care", reason: "Bene di prima necessit\xE0" },
  { name: "fazzoletti", category: "personal_care", reason: "Sempre utili in casa e fuori" },
  { name: "latte fresco", category: "food", reason: "Per colazione e ricette" },
  { name: "uova", category: "food", reason: "Versatili per tanti piatti" },
  { name: "pasta", category: "food", reason: "Base della cucina italiana" },
  { name: "riso", category: "food", reason: "Alternativa leggera alla pasta" },
  { name: "lenticchie", category: "food", reason: "Ricche di proteine vegetali" },
  { name: "olio extravergine", category: "food", reason: "Condimento essenziale" },
  { name: "mele", category: "food", reason: "Frutta pratica come spuntino" },
  { name: "zucchine", category: "food", reason: "Verdura leggera e versatile" },
  { name: "yogurt bianco", category: "food", reason: "Ottimo per colazione e merenda" },
  { name: "pane integrale", category: "food", reason: "Ricco di fibre" },
  { name: "caff\xE8", category: "food", reason: "Indispensabile per la mattina" },
  { name: "pomodori pelati", category: "food", reason: "Base per sughi e condimenti" },
  { name: "tonno in scatola", category: "food", reason: "Pratico e ricco di proteine" },
  { name: "burro", category: "food", reason: "Utile per cucinare e condire" },
  { name: "parmigiano reggiano", category: "food", reason: "Per insaporire primi e secondi" },
  { name: "spinaci freschi", category: "food", reason: "Verdura ricca di ferro" }
];
router12.get("/:familyId/shopping-suggestions", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const userId = req.user.userId;
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const thirtyDaysAgo = /* @__PURE__ */ new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fourteenDaysAgo = /* @__PURE__ */ new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const recentPurchasesRows = await db.select().from(shoppingHistory).where(and19(eq23(shoppingHistory.familyId, familyId), gte6(shoppingHistory.purchasedAt, thirtyDaysAgo))).orderBy(desc3(shoppingHistory.purchasedAt)).limit(50);
    const recentPurchases = recentPurchasesRows.map((h) => h.itemName);
    const familyLists = await db.select({ id: shoppingLists.id }).from(shoppingLists).where(eq23(shoppingLists.familyId, familyId));
    let alreadyOnList = [];
    let completedRecently = [];
    if (familyLists.length > 0) {
      const listIds = familyLists.map((l) => l.id);
      const allItems = await db.select({
        name: shoppingItems.name,
        isChecked: shoppingItems.isChecked,
        checkedAt: shoppingItems.checkedAt,
        createdAt: shoppingItems.createdAt
      }).from(shoppingItems).where(inArray3(shoppingItems.listId, listIds));
      alreadyOnList = allItems.filter((i) => !i.isChecked).map((i) => i.name);
      completedRecently = allItems.filter((i) => {
        if (!i.isChecked) return false;
        const refDate = i.checkedAt || i.createdAt;
        return refDate >= thirtyDaysAgo;
      }).map((i) => i.name);
    }
    const recentInsights = await db.select().from(aiInsights).where(and19(
      eq23(aiInsights.familyId, familyId),
      eq23(aiInsights.type, "shopping_suggestions"),
      gte6(aiInsights.createdAt, fourteenDaysAgo)
    )).orderBy(desc3(aiInsights.createdAt)).limit(10);
    const recentSuggestions = [];
    for (const ins of recentInsights) {
      const data = ins.actionData;
      if (data?.items && Array.isArray(data.items)) {
        for (const name of data.items) {
          if (typeof name === "string") recentSuggestions.push(name);
        }
      }
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const upcomingEvents = await db.select().from(calendarEvents).where(and19(eq23(calendarEvents.familyId, familyId), gte6(calendarEvents.date, today))).limit(10);
    const pantryRows = await db.select({ name: pantryItems.name }).from(pantryItems).where(eq23(pantryItems.familyId, familyId)).limit(200);
    const pantryNames = pantryRows.map((p) => p.name);
    let aiResult = { items: [] };
    const reservation = await reserveAiSlot(userId, familyId, "shopping-suggestions");
    if (reservation.status === "limited") {
      return sendRateLimited(res, reservation.max, reservation.window);
    }
    if (reservation.status === "ok") {
      const usageId = reservation.usageId;
      try {
        aiResult = await generateShoppingSuggestions({
          familySize: members.length || 1,
          season: getCurrentSeason(),
          upcomingEvents: upcomingEvents.map((e) => e.title),
          recentPurchases,
          alreadyOnList,
          completedRecently,
          recentSuggestions,
          pantryItems: pantryNames
        });
        await finalizeAiUsage(usageId, true);
      } catch (aiErr) {
        await finalizeAiUsage(usageId, false);
        if (isAiError(aiErr) && aiErr.code === "AI_NOT_CONFIGURED") {
          return sendAiError(res, aiErr, "Errore nella generazione suggerimenti");
        }
        logger.error("Shopping AI failed, using fallback pool", { error: String(aiErr) });
      }
    } else {
      logger.warn("Shopping: quota non verificabile, uso solo fallback locale (nessuna chiamata OpenAI)");
    }
    const alreadyOnListSet = new Set(alreadyOnList.map(normalizeItemName).filter((n) => n.length > 0));
    const completedRecentlySet = new Set(completedRecently.map(normalizeItemName).filter((n) => n.length > 0));
    const recentPurchasesSet = new Set(recentPurchases.map(normalizeItemName).filter((n) => n.length > 0));
    const recentSuggestionsSet = new Set(recentSuggestions.map(normalizeItemName).filter((n) => n.length > 0));
    const pantrySet = new Set(pantryNames.map(normalizeItemName).filter((n) => n.length > 0));
    const totalFromAI = aiResult.items.length;
    const seenNames = /* @__PURE__ */ new Set();
    const uniqueItems = [];
    let droppedDuplicates = 0;
    for (const item of aiResult.items) {
      const norm = normalizeItemName(item.name);
      if (!norm || seenNames.has(norm)) {
        if (norm && seenNames.has(norm)) droppedDuplicates++;
        continue;
      }
      seenNames.add(norm);
      uniqueItems.push({ ...item, source: "ai" });
    }
    const uniqueAfterNormalize = uniqueItems.length;
    let droppedAlreadyOnList = 0;
    let droppedCompletedRecently = 0;
    let droppedRecentPurchases = 0;
    let droppedRecentSuggestions = 0;
    const filtered = [];
    for (const item of uniqueItems) {
      const norm = normalizeItemName(item.name);
      if (alreadyOnListSet.has(norm)) {
        droppedAlreadyOnList++;
        continue;
      }
      if (completedRecentlySet.has(norm)) {
        droppedCompletedRecently++;
        continue;
      }
      if (recentPurchasesSet.has(norm)) {
        droppedRecentPurchases++;
        continue;
      }
      if (recentSuggestionsSet.has(norm)) {
        droppedRecentSuggestions++;
        continue;
      }
      if (pantrySet.has(norm)) {
        continue;
      }
      filtered.push(item);
    }
    const keptAfterFilters = filtered.length;
    const allForbiddenSet = /* @__PURE__ */ new Set();
    for (const s of [alreadyOnListSet, completedRecentlySet, recentPurchasesSet, recentSuggestionsSet, pantrySet]) {
      for (const v of s) allForbiddenSet.add(v);
    }
    const householdAI = filtered.filter((i) => i.category === "household_cleaning");
    const personalAI = filtered.filter((i) => i.category === "personal_care");
    const otherAI = filtered.filter((i) => i.category !== "household_cleaning" && i.category !== "personal_care");
    const finalItems = [];
    const usedNorms = /* @__PURE__ */ new Set();
    const addItem = (item) => {
      const norm = normalizeItemName(item.name);
      if (usedNorms.has(norm) || allForbiddenSet.has(norm)) return false;
      usedNorms.add(norm);
      allForbiddenSet.add(norm);
      finalItems.push(item);
      return true;
    };
    let selectedFromAI = 0;
    let selectedFromFallback = 0;
    let fallbackUsedForHouseholdMin = 0;
    let fallbackUsedForPersonalMin = 0;
    for (const item of householdAI) {
      if (finalItems.filter((i) => i.category === "household_cleaning").length >= 2) break;
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }
    const householdCount1 = finalItems.filter((i) => i.category === "household_cleaning").length;
    if (householdCount1 < 2) {
      const pool2 = [...FALLBACK_POOL].filter((fb) => fb.category === "household_cleaning").sort(() => Math.random() - 0.5);
      for (const fb of pool2) {
        if (finalItems.filter((i) => i.category === "household_cleaning").length >= 2) break;
        if (finalItems.length >= 10) break;
        if (addItem({ ...fb, source: "fallback" })) {
          selectedFromFallback++;
          fallbackUsedForHouseholdMin++;
        }
      }
    }
    for (const item of personalAI) {
      if (finalItems.filter((i) => i.category === "personal_care").length >= 1) break;
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }
    const personalCount1 = finalItems.filter((i) => i.category === "personal_care").length;
    if (personalCount1 < 1) {
      const pool2 = [...FALLBACK_POOL].filter((fb) => fb.category === "personal_care").sort(() => Math.random() - 0.5);
      for (const fb of pool2) {
        if (finalItems.filter((i) => i.category === "personal_care").length >= 1) break;
        if (finalItems.length >= 10) break;
        if (addItem({ ...fb, source: "fallback" })) {
          selectedFromFallback++;
          fallbackUsedForPersonalMin++;
        }
      }
    }
    for (const item of otherAI) {
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }
    for (const item of householdAI) {
      if (finalItems.length >= 10) break;
      addItem(item) && selectedFromAI++;
    }
    for (const item of personalAI) {
      if (finalItems.length >= 10) break;
      addItem(item) && selectedFromAI++;
    }
    if (finalItems.length < 10) {
      const shuffled = [...FALLBACK_POOL].sort(() => Math.random() - 0.5);
      for (const fb of shuffled) {
        if (finalItems.length >= 10) break;
        if (addItem({ ...fb, source: "fallback" })) {
          selectedFromFallback++;
        }
      }
    }
    const householdCount = finalItems.filter((i) => i.category === "household_cleaning").length;
    const personalCount = finalItems.filter((i) => i.category === "personal_care").length;
    const finalCount = finalItems.length;
    console.log(JSON.stringify({
      tag: "AI_SHOPPING_SUGGESTIONS",
      familyId,
      totalFromAI,
      uniqueAfterNormalize,
      droppedDuplicates,
      droppedAlreadyOnList,
      droppedCompletedRecently,
      droppedRecentPurchases,
      droppedRecentSuggestions,
      keptAfterFilters,
      selectedFromAI,
      selectedFromFallback,
      fallbackUsedForHouseholdMin,
      fallbackUsedForPersonalMin,
      finalCount,
      categoryCounts: { household_cleaning: householdCount, personal_care: personalCount, food: finalCount - householdCount - personalCount }
    }));
    const responseItems = finalItems.map(({ source, ...rest }) => rest);
    try {
      await db.insert(aiInsights).values({
        familyId,
        type: "shopping_suggestions",
        title: "Shopping suggestions history",
        description: "internal",
        dismissed: true,
        actionData: {
          items: responseItems.map((i) => i.name),
          categoriesCount: { household_cleaning: householdCount, personal_care: personalCount, food: finalCount - householdCount - personalCount },
          generatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    } catch (persistErr) {
      logger.error("Failed to persist shopping suggestions history", { error: String(persistErr) });
    }
    res.json({ items: responseItems });
  } catch (error) {
    logger.error("Shopping suggestions error", { error: String(error) });
    sendAiError(res, error, "Errore nella generazione suggerimenti");
  }
});
router12.get("/:familyId/chore-optimization", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const pendingChores = await db.select().from(chores).where(and19(eq23(chores.familyId, familyId), eq23(chores.isCompleted, false)));
    if (pendingChores.length === 0) {
      return res.json({ assignments: [], message: "Nessuna faccenda da assegnare" });
    }
    const run = await withAiUsage(
      { userId, familyId, feature: "chore-optimization" },
      () => optimizeChoreSchedule({
        members: members.map((m) => ({ id: m.id, name: m.nickname || "Membro", points: m.points || 0 })),
        chores: pendingChores.map((c) => ({ id: c.id, title: c.title, estimatedMinutes: c.estimatedMinutes || 30 }))
      })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    res.json(run.value);
  } catch (error) {
    logger.error("Chore optimization error", { error: String(error) });
    sendAiError(res, error, "Errore nell'ottimizzazione");
  }
});
router12.post("/:familyId/budget-insights", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const month = typeof req.body?.month === "string" && /^\d{4}-\d{2}$/.test(req.body.month) ? req.body.month : (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const { getBudgetSummary: getBudgetSummary2 } = await Promise.resolve().then(() => (init_expenses(), expenses_exports));
    const summary = await getBudgetSummary2(familyId, month);
    if (!summary) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Mese non valido" } });
    }
    if (summary.total <= 0) {
      return res.json({ insights: [], message: "Nessuna spesa registrata questo mese: aggiungi qualche spesa per ricevere consigli." });
    }
    const run = await withAiUsage(
      { userId, familyId, feature: "budget-insights" },
      () => generateBudgetInsights({
        month: summary.month,
        total: summary.total,
        categories: Object.entries(summary.categories).map(([category, v]) => ({ category, total: v.total, count: v.count })),
        budgets: summary.budgets,
        trend: summary.trend
      })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    res.json(run.value);
  } catch (error) {
    logger.error("Budget insights error", { error: String(error) });
    sendAiError(res, error, "Errore nell'analisi del budget");
  }
});
router12.get("/:familyId/insights", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const savedInsights = await db.select().from(aiInsights).where(and19(eq23(aiInsights.familyId, familyId), eq23(aiInsights.dismissed, false))).orderBy(desc3(aiInsights.createdAt)).limit(5);
    res.json(savedInsights);
  } catch (error) {
    logger.error("Get insights error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero insights" } });
  }
});
router12.post("/:familyId/insights/generate", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const sevenDaysAgo = /* @__PURE__ */ new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgo = sevenDaysAgo.toISOString().split("T")[0];
    const events = await db.select().from(calendarEvents).where(and19(eq23(calendarEvents.familyId, familyId), gte6(calendarEvents.date, weekAgo)));
    const completedChores = await db.select().from(chores).where(and19(eq23(chores.familyId, familyId), eq23(chores.isCompleted, true), gte6(chores.completedAt, sevenDaysAgo)));
    const pendingChores = await db.select().from(chores).where(and19(eq23(chores.familyId, familyId), eq23(chores.isCompleted, false)));
    const topMember = members.reduce((top, m) => (m.points || 0) > (top.points || 0) ? m : top, members[0]);
    const run = await withAiUsage(
      { userId, familyId, feature: "insights" },
      () => generateFamilyInsights({
        events: events.length,
        completedChores: completedChores.length,
        pendingChores: pendingChores.length,
        topContributor: topMember?.nickname || "Nessuno",
        weeklyPoints: completedChores.reduce((sum, c) => sum + (c.points || 0), 0)
      })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    const insights = run.value;
    const savedInsights = [];
    for (const insight of insights.insights || []) {
      const [saved] = await db.insert(aiInsights).values({
        familyId,
        type: insight.type || "suggestion",
        title: insight.title,
        description: insight.description
      }).returning();
      savedInsights.push(saved);
    }
    res.json(savedInsights);
  } catch (error) {
    logger.error("Generate insights error", { error: String(error) });
    sendAiError(res, error, "Errore nella generazione insights");
  }
});
router12.patch("/:familyId/insights/:insightId/dismiss", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const insightId = getParam(req, "insightId");
    await db.update(aiInsights).set({ dismissed: true }).where(eq23(aiInsights.id, insightId));
    res.json({ message: "Insight nascosto" });
  } catch (error) {
    logger.error("Dismiss insight error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore" } });
  }
});
router12.post("/:familyId/recipe-suggestions", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const { dietaryPreferences, allergies, maxTimeMinutes, cuisinePreferences, excludedIngredients, count: count2, excludeTitles } = req.body || {};
    const existingRecipes = await db.select({ title: recipes.title }).from(recipes).where(eq23(recipes.familyId, familyId)).orderBy(desc3(recipes.createdAt)).limit(50);
    const dbTitles = existingRecipes.map((r) => r.title);
    const extraTitles = Array.isArray(excludeTitles) ? excludeTitles : [];
    const lastRecipeTitles = [.../* @__PURE__ */ new Set([...dbTitles, ...extraTitles])];
    const pantryRows = await db.select({ name: pantryItems.name }).from(pantryItems).where(eq23(pantryItems.familyId, familyId)).limit(60);
    const pantryIngredients = pantryRows.map((p) => p.name);
    const run = await withAiUsage(
      { userId, familyId, feature: "recipe-suggestions" },
      () => generateRecipeSuggestions({
        familySize: members.length || 1,
        dietaryPreferences,
        allergies,
        maxTimeMinutes: maxTimeMinutes || null,
        cuisinePreferences: cuisinePreferences || null,
        excludedIngredients: excludedIngredients || null,
        lastRecipeTitles,
        count: Math.min(count2 || 8, 20),
        pantryIngredients
      })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    const result = run.value;
    const seenTitles = /* @__PURE__ */ new Set();
    const dedupedRecipes = result.recipes.filter((r) => {
      const norm = r.title.toLowerCase().trim();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });
    res.json({ recipes: dedupedRecipes, generatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (error) {
    logger.error("Recipe suggestions error", { error: String(error) });
    sendAiError(res, error, "Errore nella generazione ricette");
  }
});
router12.post("/:familyId/weekly-meal-plan", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const startTime = Date.now();
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const { weekStartDate, preferences } = req.body || {};
    const variants = resolveMealPlanVariants((req.body || {}).variants);
    if (!weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "weekStartDate \xE8 obbligatorio (YYYY-MM-DD)" } });
    }
    const context = {
      familySize: members.length || 1,
      weekStartDate,
      preferences
    };
    const run = await withAiUsage(
      { userId, familyId, feature: "weekly-meal-plan" },
      () => generateWeeklyMealPlan({ ...context, planVariant: 1 })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    const plan = run.value;
    plan.title = plan.title || "Piano Settimanale";
    const resultPlans = [{ ...plan, weekStartDate }];
    const durationMs = Date.now() - startTime;
    console.log(JSON.stringify({
      tag: "AI_MEAL_PLAN",
      familyId,
      variants,
      durationMs,
      plans: resultPlans.map((p) => ({ title: p.title, itemsCount: p.items?.length || 0 }))
    }));
    res.json({ plans: resultPlans });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error("Weekly meal plan error", { error: String(error), durationMs });
    sendAiError(res, error, "Errore nella generazione del piano pasti");
  }
});
router12.post("/:familyId/weekly-meal-plan/stream", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const startTime = Date.now();
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  const { weekStartDate, preferences, planVariant: rawPlanVariant } = req.body || {};
  const planVariant = rawPlanVariant === 2 ? 2 : 1;
  if (!weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "weekStartDate \xE8 obbligatorio (YYYY-MM-DD)" } });
  }
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
  });
  let usageId = null;
  let usageFinalized = false;
  const finalizeUsageOnce = async (success) => {
    if (usageId && !usageFinalized) {
      usageFinalized = true;
      await finalizeAiUsage(usageId, success);
    }
  };
  try {
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const reservation = await reserveAiSlot(userId, familyId, "weekly-meal-plan");
    if (reservation.status === "limited") return sendRateLimited(res, reservation.max, reservation.window);
    if (reservation.status === "unavailable") return sendUsageUnavailable(res);
    usageId = reservation.usageId;
    if (clientClosed) return;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const plan = await generateWeeklyMealPlan({
      familySize: members.length || 1,
      weekStartDate,
      preferences,
      planVariant,
      onProgress: (items) => {
        if (clientClosed) return;
        res.write(JSON.stringify({ type: "items", items }) + "\n");
      }
    });
    await finalizeUsageOnce(true);
    if (clientClosed) return;
    const durationMs = Date.now() - startTime;
    console.log(JSON.stringify({
      tag: "AI_MEAL_PLAN_STREAM",
      familyId,
      durationMs,
      itemsCount: plan.items.length
    }));
    res.write(JSON.stringify({
      type: "done",
      title: plan.title || "Piano Settimanale",
      weekStartDate,
      itemsCount: plan.items.length
    }) + "\n");
    res.end();
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error("Weekly meal plan stream error", { error: String(error), durationMs });
    if (clientClosed) return;
    if (!res.headersSent) {
      sendAiError(res, error, "Errore nella generazione del piano pasti");
    } else {
      const message = isAiError(error) ? error.userMessage : "Errore nella generazione del piano pasti";
      try {
        res.write(JSON.stringify({ type: "error", message }) + "\n");
      } catch {
      }
      res.end();
    }
  } finally {
    await finalizeUsageOnce(false);
  }
});
router12.post("/:familyId/recipe-search", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const { query, excludeTitles } = req.body || {};
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Inserisci almeno 2 caratteri per la ricerca" } });
    }
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const extraTitles = Array.isArray(excludeTitles) ? excludeTitles.filter((t) => typeof t === "string") : [];
    const run = await withAiUsage(
      { userId, familyId, feature: "recipe-search" },
      () => searchRecipesByQuery(query.trim(), {
        familySize: members.length || 1,
        excludeTitles: extraTitles
      })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    const result = run.value;
    const excludeSet = new Set(extraTitles.map((t) => t.toLowerCase().trim()));
    const seenTitles = /* @__PURE__ */ new Set();
    const dedupedRecipes = result.recipes.filter((r) => {
      const norm = r.title.toLowerCase().trim();
      if (excludeSet.has(norm) || seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });
    res.json({ recipes: dedupedRecipes, query: query.trim() });
  } catch (error) {
    logger.error("Recipe search error", { error: String(error) });
    sendAiError(res, error, "Errore nella ricerca ricette");
  }
});
var AUDIO_ALLOWED_MIMES = /* @__PURE__ */ new Set([
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg"
]);
var audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  // 10MB (~10 min di voce compressa)
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || "").split(";")[0].trim().toLowerCase();
    if (AUDIO_ALLOWED_MIMES.has(mime)) return cb(null, true);
    cb(new Error("UNSUPPORTED_AUDIO_TYPE"));
  }
});
function looksLikeAudio(buf) {
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") return true;
  if (buf.toString("ascii", 4, 8) === "ftyp") return true;
  if (buf[0] === 26 && buf[1] === 69 && buf[2] === 223 && buf[3] === 163) return true;
  if (buf.toString("ascii", 0, 4) === "OggS") return true;
  if (buf.toString("ascii", 0, 3) === "ID3") return true;
  if (buf[0] === 255 && (buf[1] & 224) === 224) return true;
  return false;
}
function audioExtension(mime) {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    default:
      return "m4a";
  }
}
router12.post("/:familyId/transcribe", authenticate, requireAiEnabled, requireFamilyMember(), (req, res) => {
  audioUpload.single("audio")(req, res, async (uploadErr) => {
    const familyId = getParam(req, "familyId");
    const userId = req.user.userId;
    try {
      if (uploadErr) {
        const msg = uploadErr instanceof Error && uploadErr.message === "UNSUPPORTED_AUDIO_TYPE" ? "Formato audio non supportato" : "File audio troppo grande o non valido (max 10MB)";
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: msg } });
      }
      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Nessun file audio ricevuto" } });
      }
      if (!looksLikeAudio(file.buffer)) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Il file ricevuto non sembra un audio valido" } });
      }
      const mime = (file.mimetype || "").split(";")[0].trim().toLowerCase();
      const run = await withAiUsage(
        { userId, familyId, feature: "voice-transcription" },
        () => transcribeAudio({
          buffer: file.buffer,
          filename: `voice.${audioExtension(mime)}`,
          mimeType: mime
        })
      );
      if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
      if (run.outcome === "unavailable") return sendUsageUnavailable(res);
      res.json({ text: run.value.text });
    } catch (error) {
      logger.error("Voice transcription error", { error: String(error) });
      sendAiError(res, error, "Errore nella trascrizione vocale");
    }
  });
});
router12.post("/:familyId/parse-event", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const text2 = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text2) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Descrivi l'evento in una frase" } });
    }
    if (text2.length > 500) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Descrizione troppo lunga (max 500 caratteri)" } });
    }
    const todayIso = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    const weekdayName = (/* @__PURE__ */ new Date()).toLocaleDateString("it-IT", { weekday: "long", timeZone: "Europe/Rome" });
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const memberNames = members.map((m) => m.nickname).filter((n) => !!n);
    const run = await withAiUsage(
      { userId, familyId, feature: "event-parse" },
      () => parseEventFromText({ text: text2, todayIso, weekdayName, memberNames })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    const parsed = run.value;
    let assigneeMemberId = null;
    if (parsed.assigneeName) {
      const target = parsed.assigneeName.trim().toLowerCase();
      const match = members.find((m) => (m.nickname || "").trim().toLowerCase() === target);
      if (match) assigneeMemberId = match.id;
    }
    res.json({ ...parsed, assigneeMemberId });
  } catch (error) {
    logger.error("Event parse error", { error: String(error) });
    sendAiError(res, error, "Errore nella compilazione automatica");
  }
});
router12.post("/:familyId/parse-chore", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const text2 = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text2) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Descrivi la faccenda in una frase" } });
    }
    if (text2.length > 500) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Descrizione troppo lunga (max 500 caratteri)" } });
    }
    const todayIso = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    const weekdayName = (/* @__PURE__ */ new Date()).toLocaleDateString("it-IT", { weekday: "long", timeZone: "Europe/Rome" });
    const members = await db.select().from(familyMembers).where(eq23(familyMembers.familyId, familyId));
    const memberNames = members.map((m) => m.nickname).filter((n) => !!n);
    const run = await withAiUsage(
      { userId, familyId, feature: "chore-parse" },
      () => parseChoreFromText({ text: text2, todayIso, weekdayName, memberNames })
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    const parsed = run.value;
    let assigneeMemberId = null;
    if (parsed.assigneeName) {
      const target = parsed.assigneeName.trim().toLowerCase();
      const match = members.find((m) => (m.nickname || "").trim().toLowerCase() === target);
      if (match) assigneeMemberId = match.id;
    }
    res.json({ ...parsed, assigneeMemberId });
  } catch (error) {
    logger.error("Chore parse error", { error: String(error) });
    sendAiError(res, error, "Errore nella compilazione automatica");
  }
});
router12.post("/:familyId/parse-expense", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const text2 = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text2) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Descrivi la spesa in una frase" } });
    }
    if (text2.length > 300) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Descrizione troppo lunga (max 300 caratteri)" } });
    }
    const run = await withAiUsage(
      { userId, familyId, feature: "expense-parse" },
      () => parseExpenseFromText(text2)
    );
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    res.json(run.value);
  } catch (error) {
    logger.error("Expense parse error", { error: String(error) });
    sendAiError(res, error, "Errore nella compilazione automatica della spesa");
  }
});
var recipeImagesDir = path2.resolve("uploads", "recipe-images");
if (!fs2.existsSync(recipeImagesDir)) {
  fs2.mkdirSync(recipeImagesDir, { recursive: true });
}
function recipeImageCacheKey(title) {
  const normalized = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return crypto4.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
var inFlightRecipeImages = /* @__PURE__ */ new Map();
router12.post("/:familyId/recipe-image", authenticate, requireAiEnabled, requireFamilyMember(), async (req, res) => {
  const familyId = getParam(req, "familyId");
  const userId = req.user.userId;
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 300) : void 0;
    if (title.length < 2 || title.length > 200) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Titolo ricetta non valido" } });
    }
    const key = recipeImageCacheKey(title);
    const fileName = `${key}.webp`;
    const filePath = path2.join(recipeImagesDir, fileName);
    const url = `/uploads/recipe-images/${fileName}`;
    if (fs2.existsSync(filePath)) {
      return res.json({ url, cached: true });
    }
    let task = inFlightRecipeImages.get(key);
    const isLeader = !task;
    if (!task) {
      task = (async () => {
        const run2 = await withAiUsage(
          { userId, familyId, feature: "recipe-image" },
          () => generateRecipeImage({ title, description })
        );
        if (run2.outcome === "ok") {
          const optimized = await sharp(run2.value).resize(512, 512, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
          const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
          await fs2.promises.writeFile(tmpPath, optimized);
          await fs2.promises.rename(tmpPath, filePath);
        }
        return run2;
      })();
      inFlightRecipeImages.set(key, task);
      task.catch(() => void 0).finally(() => inFlightRecipeImages.delete(key));
    }
    const run = await task;
    if (run.outcome === "limited") return sendRateLimited(res, run.max, run.window);
    if (run.outcome === "unavailable") return sendUsageUnavailable(res);
    res.json({ url, cached: !isLeader });
  } catch (error) {
    logger.error("Recipe image generation error", { error: String(error), familyId });
    sendAiError(res, error, "Errore nella generazione dell'immagine");
  }
});
var ai_default = router12;

// server/routes/payments.ts
init_auth();
init_family();
init_config();
init_logger();
import { Router as Router13 } from "express";
import { z as z12 } from "zod";
var router13 = Router13();
function requirePayments(_req, res, next) {
  if (!config.premiumPaymentsEnabled) {
    return res.status(503).json({
      error: { code: "PAYMENTS_DISABLED", message: "I pagamenti Premium non sono attivi" }
    });
  }
  next();
}
router13.get("/status", (_req, res) => {
  res.json({
    paymentsEnabled: config.premiumPaymentsEnabled,
    plans: [
      { name: "Premium Mensile", price: "\u20AC4,99/mese", interval: "month" },
      { name: "Premium Annuale", price: "\u20AC39,99/anno", interval: "year", badge: "Risparmia 33%" }
    ],
    features: [
      "Suggerimenti AI",
      "Membri Illimitati",
      "Sincronizzazione Real-time",
      "Statistiche Avanzate",
      "Temi Personalizzati",
      "Supporto Prioritario"
    ]
  });
});
router13.get("/publishable-key", requirePayments, async (_req, res) => {
  try {
    const { getStripePublishableKey: getStripePublishableKey2 } = await Promise.resolve().then(() => (init_stripeClient(), stripeClient_exports));
    const publishableKey = await getStripePublishableKey2();
    res.json({ publishableKey });
  } catch (error) {
    logger.error("Error getting publishable key", { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero della chiave Stripe" } });
  }
});
router13.get("/products", requirePayments, async (_req, res) => {
  try {
    const { stripeService: stripeService2 } = await Promise.resolve().then(() => (init_stripeService(), stripeService_exports));
    const products = await stripeService2.listProducts();
    res.json({ data: products });
  } catch (error) {
    logger.error("Error listing products", { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dei prodotti" } });
  }
});
router13.get("/products-with-prices", requirePayments, async (_req, res) => {
  try {
    const { stripeService: stripeService2 } = await Promise.resolve().then(() => (init_stripeService(), stripeService_exports));
    const rows = await stripeService2.listProductsWithPrices();
    if (rows.length > 0 && "prices" in rows[0]) {
      res.json({ data: rows.map((row) => ({
        id: row.product_id,
        name: row.product_name,
        description: row.product_description,
        active: row.product_active,
        metadata: row.product_metadata,
        prices: row.prices.map((price) => ({
          id: price.price_id,
          unit_amount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
          active: price.price_active
        }))
      })) });
      return;
    }
    const productsMap = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          active: row.product_active,
          metadata: row.product_metadata,
          prices: []
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
          active: row.price_active
        });
      }
    }
    res.json({ data: Array.from(productsMap.values()) });
  } catch (error) {
    logger.error("Error listing products with prices", { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dei prodotti" } });
  }
});
router13.get("/prices", requirePayments, async (_req, res) => {
  try {
    const { stripeService: stripeService2 } = await Promise.resolve().then(() => (init_stripeService(), stripeService_exports));
    const prices = await stripeService2.listPrices();
    res.json({ data: prices });
  } catch (error) {
    logger.error("Error listing prices", { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dei prezzi" } });
  }
});
router13.use(authenticate);
router13.get("/subscription/:familyId", requirePayments, requireFamilyMember(), async (req, res) => {
  try {
    const { stripeService: stripeService2 } = await Promise.resolve().then(() => (init_stripeService(), stripeService_exports));
    const familyId = req.params.familyId;
    const family = await stripeService2.getFamily(familyId);
    if (!family?.stripeSubscriptionId) {
      return res.json({ subscription: null, status: family?.subscriptionStatus || "free" });
    }
    const subscription = await stripeService2.getSubscription(family.stripeSubscriptionId);
    res.json({
      subscription,
      status: family.subscriptionStatus || "free"
    });
  } catch (error) {
    logger.error("Error getting subscription", { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dell'abbonamento" } });
  }
});
var checkoutSchema = z12.object({
  plan: z12.enum(["monthly", "yearly"]),
  familyId: z12.string().min(1, "familyId \xE8 obbligatorio")
});
router13.post("/checkout", requirePayments, requireFamilyAdmin("familyId"), async (req, res) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { stripeService: stripeService2, PaymentConfigError: PaymentConfigError2 } = await Promise.resolve().then(() => (init_stripeService(), stripeService_exports));
    const { plan, familyId } = parsed.data;
    const family = await stripeService2.getFamily(familyId);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }
    let priceId;
    try {
      priceId = await stripeService2.getPriceIdForPlan(plan);
    } catch (error) {
      if (error instanceof PaymentConfigError2 && error.code === "INVALID_PLAN") {
        return res.status(400).json({ error: { code: "INVALID_PLAN", message: error.message } });
      }
      logger.error("Error resolving price for plan", { error: String(error) });
      return res.status(503).json({ error: { code: "PRICE_UNAVAILABLE", message: "Configurazione prezzi non disponibile" } });
    }
    let customerId = family.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService2.createCustomer(req.user.email, familyId, family.name);
      await stripeService2.updateFamilyStripeInfo(familyId, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }
    const baseUrl = config.getBaseUrl(req);
    const session = await stripeService2.createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${baseUrl}/checkout/success`,
      cancelUrl: `${baseUrl}/checkout/cancel`,
      familyId,
      userId: req.user.userId
    });
    res.json({ url: session.url });
  } catch (error) {
    logger.error("Error creating checkout session", { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nella creazione della sessione di pagamento" } });
  }
});
var portalSchema = z12.object({
  familyId: z12.string().min(1, "familyId \xE8 obbligatorio")
});
router13.post("/portal", requirePayments, requireFamilyAdmin("familyId"), async (req, res) => {
  try {
    const parsed = portalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { stripeService: stripeService2 } = await Promise.resolve().then(() => (init_stripeService(), stripeService_exports));
    const { familyId } = parsed.data;
    const family = await stripeService2.getFamily(familyId);
    if (!family?.stripeCustomerId) {
      return res.status(400).json({ error: { code: "NO_SUBSCRIPTION", message: "Nessun abbonamento attivo per questa famiglia" } });
    }
    const baseUrl = config.getBaseUrl(req);
    const session = await stripeService2.createCustomerPortalSession(
      family.stripeCustomerId,
      `${baseUrl}/premium`
    );
    res.json({ url: session.url });
  } catch (error) {
    logger.error("Error creating portal session", { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nella creazione del portale di gestione" } });
  }
});
var payments_default = router13;

// server/routes/purchases.ts
init_family();
init_config();
init_logger();
import { Router as Router14 } from "express";
import { z as z13 } from "zod";

// server/lib/revenuecat-server.ts
import { listCustomerActiveEntitlements } from "@replit/revenuecat-sdk";

// scripts/revenueCatClient.ts
import { createClient } from "@replit/revenuecat-sdk/client";
import { ReplitConnectors } from "@replit/connectors-sdk";
var REVENUECAT_API_BASE_URL = "https://api.revenuecat.com/v2";
var CONNECTOR_NAME = "revenuecat";
var cachedClient = null;
function getUncachableRevenueCatClient() {
  if (cachedClient) return cachedClient;
  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch(CONNECTOR_NAME);
  cachedClient = createClient({
    baseUrl: REVENUECAT_API_BASE_URL,
    fetch: proxyFetch
  });
  return cachedClient;
}

// server/lib/revenuecat-server.ts
init_config();
init_logger();
function isPremiumEntitlementId(entitlementId) {
  const candidates = [
    config.revenuecat.entitlementRcId,
    config.revenuecat.entitlementId,
    "premium"
  ].filter((v) => !!v);
  return candidates.includes(entitlementId);
}
async function getSubscriberEntitlement(familyId) {
  const projectId = config.revenuecat.projectId;
  if (!projectId) {
    throw new Error("REVENUECAT_PROJECT_ID non configurato");
  }
  const client = getUncachableRevenueCatClient();
  const { data, error, response } = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId, customer_id: familyId }
  });
  if (error) {
    if (response?.status === 404) {
      return { active: false, expiresAt: null };
    }
    logger.error("RevenueCat listCustomerActiveEntitlements error", {
      status: response?.status,
      error: JSON.stringify(error)
    });
    throw new Error(`RevenueCat API error (${response?.status ?? "?"})`);
  }
  const items = data?.items ?? [];
  const match = items.find((i) => isPremiumEntitlementId(i.entitlement_id));
  if (!match) {
    return { active: false, expiresAt: null };
  }
  const expiresAt = match.expires_at ? new Date(match.expires_at) : null;
  const active = !expiresAt || expiresAt.getTime() > Date.now();
  return { active, expiresAt };
}

// server/routes/purchases.ts
init_entitlements();
var router14 = Router14();
router14.get("/config", (_req, res) => {
  res.json({
    entitlementId: config.revenuecat.entitlementId,
    projectConfigured: !!config.revenuecat.projectId
  });
});
var syncSchema = z13.object({
  familyId: z13.string().min(1, "familyId \xE8 obbligatorio")
});
router14.post("/sync", requireFamilyMember("familyId"), async (req, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
    });
  }
  const { familyId } = parsed.data;
  const membership = req.membership;
  if (membership?.role !== "admin") {
    return res.status(403).json({
      error: { code: "NOT_ALLOWED", message: "Solo l'amministratore della famiglia pu\xF2 gestire il Premium." }
    });
  }
  try {
    const rc = await getSubscriberEntitlement(familyId);
    const result = await syncEntitlementFromRevenueCat({
      familyId,
      userId: req.user.userId,
      active: rc.active,
      expiresAt: rc.expiresAt
    });
    return res.json({
      premium: result.premium,
      status: result.status,
      expiresAt: result.expiresAt,
      plan: result.premium ? "premium" : "free"
    });
  } catch (error) {
    logger.error("Purchase sync error", { error: String(error) });
    return res.status(502).json({ error: { code: "SYNC_ERROR", message: "Non \xE8 stato possibile sincronizzare lo stato Premium. Riprova tra poco." } });
  }
});
router14.get("/status/:familyId", requireFamilyMember("familyId"), async (req, res) => {
  try {
    const familyId = req.params.familyId;
    const ent = await getEntitlement(familyId);
    const premium = isEntitlementActive(ent);
    return res.json({
      premium,
      plan: premium ? "premium" : "free",
      status: ent?.status ?? null,
      expiresAt: ent?.expiresAt ?? null
    });
  } catch (error) {
    logger.error("Purchase status error", { error: String(error) });
    return res.status(500).json({ error: { code: "PURCHASE_ERROR", message: "Errore nel recupero dello stato Premium" } });
  }
});
async function handleRevenueCatWebhook(req, res) {
  const expected = config.revenuecat.webhookAuthHeader;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      logger.error("RevenueCat webhook rifiutato: REVENUECAT_WEBHOOK_AUTH_HEADER non configurato in produzione");
      return res.status(503).json({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook non configurato" } });
    }
  } else {
    const provided = req.header("authorization") || "";
    if (provided !== expected) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Webhook non autorizzato" } });
    }
  }
  const event = req.body && (req.body.event ?? req.body);
  const familyId = event?.app_user_id || event?.original_app_user_id;
  if (!familyId) {
    logger.error("RevenueCat webhook senza app_user_id", { body: JSON.stringify(req.body)?.slice(0, 500) });
    return res.status(200).json({ ok: true });
  }
  try {
    const rc = await getSubscriberEntitlement(familyId);
    await syncEntitlementFromRevenueCat({
      familyId,
      userId: null,
      active: rc.active,
      expiresAt: rc.expiresAt
    });
  } catch (error) {
    logger.error("RevenueCat webhook sync error", { familyId, error: String(error) });
  }
  return res.status(200).json({ ok: true });
}
var purchases_default = router14;

// server/routes/legal.ts
init_config();
import { Router as Router15 } from "express";
var router15 = Router15();
var LAST_UPDATED = "30 giugno 2026";
var APP_NAME = "FamilySync";
var OWNER = "Marino Pizzuti / FamilySync";
var CONTACT_EMAIL = "assistenza@familysync.it";
function getBaseUrl(req) {
  return config.getBaseUrl(req);
}
function htmlWrapper(title, body) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${APP_NAME}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fafafa;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #FF6B6B, #FF8E8E);
      padding: 48px 24px 32px;
      text-align: center;
    }
    .header h1 {
      color: #fff;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header .subtitle {
      color: rgba(255,255,255,0.85);
      font-size: 14px;
    }
    .content {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 28px 0 12px;
      color: #1a1a2e;
    }
    h2:first-child { margin-top: 0; }
    p, li {
      font-size: 15px;
      color: #333;
      margin-bottom: 10px;
    }
    ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    li { margin-bottom: 6px; }
    a { color: #FF6B6B; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .update-date {
      font-size: 13px;
      color: #888;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 13px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="subtitle">${APP_NAME}</div>
  </div>
  <div class="content">
    ${body}
    <p class="update-date">Ultimo aggiornamento: ${LAST_UPDATED}</p>
  </div>
  <div class="footer">&copy; 2026 ${OWNER}. Tutti i diritti riservati.</div>
</body>
</html>`;
}
router15.get("/privacy", (_req, res) => {
  const body = `
    <h2>1. Titolare del Trattamento</h2>
    <p>Il titolare del trattamento dei dati personali \xE8 <strong>FamilySync</strong>.</p>
    <p>Per qualsiasi domanda o richiesta relativa alla privacy, all'esercizio dei tuoi diritti o al supporto, puoi contattarci all'unico indirizzo email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    <p>Sito di riferimento: <a href="https://familysync.eu" target="_blank">https://familysync.eu</a></p>

    <h2>2. Dati Raccolti</h2>
    <p>${APP_NAME} raccoglie e tratta le seguenti categorie di dati personali, in base alle funzioni che utilizzi:</p>
    <ul>
      <li><strong>Dati di account:</strong> nome, indirizzo email e password (conservata in forma crittografata con hashing, mai in chiaro)</li>
      <li><strong>Verifica e sicurezza account:</strong> token di verifica email (a scadenza temporale) e token di reset password (conservati in forma hashata), stato di verifica</li>
      <li><strong>Dati familiari:</strong> nomi dei membri, ruoli nel gruppo, inviti familiari e relativi token di invito (conservati in forma hashata)</li>
      <li><strong>Eventi calendario:</strong> titoli, date, orari, luoghi e descrizioni degli eventi condivisi</li>
      <li><strong>Liste della spesa:</strong> nomi delle liste, articoli inseriti e relativo storico</li>
      <li><strong>Faccende domestiche:</strong> attivita assegnate, stato di completamento, punti accumulati</li>
      <li><strong>Chat e messaggi:</strong> contenuti dei messaggi scambiati tra i membri della famiglia ed eventuali file/immagini allegati</li>
      <li><strong>Allegati caricati dagli utenti:</strong> immagini e documenti caricati nell'app (ad esempio nelle chat o associati alle bollette)</li>
      <li><strong>Bollette e scadenze:</strong> titoli, categorie, importi, date di scadenza, fornitori, intestatari, responsabili, note, ricevute e allegati</li>
      <li><strong>Ripartizioni e pagamenti:</strong> suddivisione degli importi tra i membri e storico dei pagamenti registrati manualmente</li>
      <li><strong>Notifiche:</strong> preferenze di notifica e, se attive le notifiche push, il token push del dispositivo</li>
      <li><strong>Dati tecnici:</strong> informazioni sul dispositivo, log di accesso e di sistema, indirizzo IP (se raccolto dai log), token di sessione</li>
    </ul>

    <h2>3. Bollette e Scadenze</h2>
    <p>${APP_NAME} consente di registrare bollette e scadenze domestiche, inclusi importi, date di scadenza, fornitori, intestatari, note, allegati e ricevute, oltre alla ripartizione delle spese tra i membri della famiglia e allo storico dei pagamenti.</p>
    <p><strong>Importante:</strong> l'app NON effettua pagamenti reali, NON elabora transazioni verso terzi, NON salva carte di credito, NON salva codici CVV e NON salva coordinate bancarie (IBAN). Lo stato "pagato" e i relativi importi sono registrazioni inserite manualmente dagli utenti a scopo organizzativo.</p>

    <h2>4. Finalita del Trattamento</h2>
    <p>I dati vengono raccolti e utilizzati per le seguenti finalita:</p>
    <ul>
      <li><strong>Erogazione del servizio:</strong> sincronizzazione familiare, gestione di calendario, liste della spesa, faccende, chat, bollette e scadenze</li>
      <li><strong>Comunicazioni di servizio:</strong> invio di email di verifica account, reset password, inviti familiari e comunicazioni essenziali</li>
      <li><strong>Notifiche:</strong> promemoria locali (ad esempio scadenze bollette) ed eventuali notifiche push remote</li>
      <li><strong>Suggerimenti intelligenti:</strong> generazione di consigli tramite intelligenza artificiale (funzionalita opzionale)</li>
      <li><strong>Miglioramento del servizio:</strong> analisi aggregate per migliorare le funzionalita dell'applicazione</li>
      <li><strong>Supporto tecnico e sicurezza:</strong> assistenza, prevenzione abusi e protezione degli account</li>
    </ul>

    <h2>5. Email Transazionali</h2>
    <p>${APP_NAME} invia email transazionali tramite il fornitore <strong>Resend</strong> per le seguenti finalita:</p>
    <ul>
      <li>verifica dell'account;</li>
      <li>inviti familiari;</li>
      <li>reset della password;</li>
      <li>comunicazioni essenziali relative al servizio.</li>
    </ul>
    <p>Le email <strong>non contengono mai la password</strong> dell'utente. I link di verifica e reset hanno una durata limitata nel tempo (vedi sezione Conservazione dei Dati).</p>

    <h2>6. Funzionalita di Intelligenza Artificiale (AI)</h2>
    <p>${APP_NAME} offre funzionalita opzionali basate sull'intelligenza artificiale tramite il fornitore <strong>OpenAI</strong>. L'uso e facoltativo, soggetto al tuo consenso e gestito tramite impostazioni e limiti di utilizzo (quote) dell'app; puo essere attivato o disattivato in qualsiasi momento.</p>
    <p><strong>I dati inviati a OpenAI sono minimizzati.</strong> Quando le funzioni AI sono attive vengono inviati, ad esempio:</p>
    <ul>
      <li><strong>Suggerimenti spesa:</strong> numero di membri (senza nomi), nomi dei prodotti recenti, titoli degli eventi in programma, stagione corrente</li>
      <li><strong>Ottimizzazione faccende:</strong> soprannomi dei membri, punti accumulati, titoli e durata stimata delle faccende</li>
      <li><strong>Insights familiari:</strong> conteggi aggregati (eventi, faccende completate/in sospeso), soprannome del miglior contributore, punti settimanali</li>
    </ul>
    <p><strong>Dati NON inviati a OpenAI:</strong> password, indirizzi email, dati di pagamento, allegati, ricevute, contenuti delle chat, indirizzi fisici o numeri di telefono.</p>
    <p>I dati inviati tramite l'API di OpenAI non vengono utilizzati per l'addestramento dei modelli, salvo diversa configurazione o opt-in esplicito. Il trattamento e regolato anche dalla <a href="https://openai.com/policies/privacy-policy" target="_blank">Privacy Policy di OpenAI</a>.</p>
    <p><strong>Base giuridica:</strong> consenso esplicito dell'utente, revocabile in qualsiasi momento disattivando la funzionalita nelle impostazioni.</p>

    <h2>7. Pagamenti e Abbonamenti Premium</h2>
    <p>Gli eventuali abbonamenti Premium nell'app mobile sono gestiti tramite gli acquisti in-app degli store, con la gestione degli abbonamenti e dei diritti (entitlements) affidata a <strong>RevenueCat</strong>:</p>
    <ul>
      <li><strong>Apple In-App Purchase / StoreKit</strong> su iOS;</li>
      <li><strong>Google Play Billing</strong> su Android;</li>
      <li><strong>RevenueCat</strong> per la gestione di abbonamenti, stato dell'abbonamento ed entitlements.</li>
    </ul>
    <p>I dati di pagamento (carte, ecc.) sono trattati direttamente da Apple o Google secondo le rispettive policy; ${APP_NAME} non ha accesso ai dati completi della tua carta.</p>

    <h2>8. Notifiche</h2>
    <ul>
      <li><strong>Notifiche locali:</strong> programmate direttamente sul dispositivo (ad esempio i promemoria per le scadenze delle bollette); non richiedono l'invio dei contenuti a server esterni.</li>
      <li><strong>Notifiche push remote:</strong> se attivate, possono utilizzare un token push del dispositivo e i servizi di notifica di Expo/Apple/Google per recapitare gli avvisi.</li>
    </ul>

    <h2>9. Condivisione con Terze Parti e Fornitori</h2>
    <p>I dati possono essere trattati dai seguenti fornitori, esclusivamente per le finalita indicate:</p>
    <ul>
      <li><strong>Replit:</strong> hosting e deploy dell'applicazione e del backend</li>
      <li><strong>Neon / PostgreSQL:</strong> database in cui sono archiviati i dati</li>
      <li><strong>Resend:</strong> invio di email transazionali</li>
      <li><strong>OpenAI:</strong> generazione di suggerimenti AI (solo dati minimizzati, funzione opzionale)</li>
      <li><strong>RevenueCat, Apple, Google:</strong> gestione di abbonamenti e acquisti in-app</li>
      <li><strong>Servizi di notifica push</strong> (Expo/Apple/Google): recapito delle notifiche push, se attive</li>
    </ul>
    <p>Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalita di marketing.</p>

    <h2>10. Trasferimenti Extra-UE</h2>
    <p>Alcuni fornitori (ad esempio OpenAI, Resend, RevenueCat, Apple, Google o Replit) possono trattare i dati su infrastrutture situate al di fuori dello Spazio Economico Europeo (SEE). In tali casi, i trasferimenti avvengono adottando garanzie adeguate ove applicabile (ad esempio le Clausole Contrattuali Standard della Commissione Europea o meccanismi equivalenti).</p>

    <h2>11. Conservazione dei Dati</h2>
    <ul>
      <li>I dati dell'account sono conservati fino alla cancellazione dell'account</li>
      <li>I dati familiari (calendario, liste, faccende, chat, bollette, allegati, ricevute) sono conservati fino alla cancellazione della famiglia o dell'account</li>
      <li>I token di reset password scadono dopo <strong>1 ora</strong></li>
      <li>I token di verifica email scadono dopo <strong>6 ore</strong></li>
      <li>I token di invito familiare scadono dopo <strong>72 ore</strong>; gli inviti scaduti o gia utilizzati non sono piu validi</li>
      <li>Le sessioni / refresh token scadono dopo <strong>7 giorni</strong></li>
      <li>I log di sistema sono conservati per il tempo necessario, fino a un massimo di 12 mesi</li>
    </ul>

    <h2>12. Sicurezza</h2>
    <ul>
      <li>Crittografia delle password con algoritmo bcrypt</li>
      <li>Comunicazioni protette tramite protocollo HTTPS/TLS</li>
      <li>Autenticazione basata su token JWT con scadenza temporale</li>
      <li>Rate limiting per prevenire abusi delle API</li>
      <li>Headers di sicurezza HTTP (Helmet)</li>
    </ul>

    <h2>13. Diritti dell'Utente</h2>
    <p>In conformita con la normativa vigente (incluso il GDPR), hai il diritto di:</p>
    <ul>
      <li><strong>Accesso:</strong> richiedere una copia dei tuoi dati personali</li>
      <li><strong>Rettifica:</strong> correggere dati inesatti o incompleti</li>
      <li><strong>Cancellazione:</strong> richiedere la cancellazione dei tuoi dati</li>
      <li><strong>Portabilita:</strong> ricevere i tuoi dati in formato strutturato e leggibile</li>
      <li><strong>Opposizione:</strong> opporti al trattamento in determinate circostanze</li>
      <li><strong>Limitazione:</strong> chiedere la limitazione del trattamento dei tuoi dati</li>
      <li><strong>Revoca del consenso:</strong> revocare in qualsiasi momento i consensi prestati (ad esempio per le funzioni AI), senza pregiudicare la liceita del trattamento precedente</li>
      <li><strong>Reclamo:</strong> proporre reclamo al Garante per la protezione dei dati personali</li>
    </ul>
    <p>Per esercitare questi diritti, scrivi a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

    <h2>14. Cancellazione dell'Account</h2>
    <p>Puoi eliminare il tuo account in autonomia e in qualsiasi momento direttamente dall'app, nella scheda <strong>Famiglia</strong> &rarr; <strong>Elimina account</strong>, confermando con la tua password. In alternativa puoi richiedere la cancellazione scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    <p>Con l'eliminazione, il tuo profilo personale viene reso anonimo e le tue informazioni di contatto vengono rimosse. Se sei l'unico membro di una famiglia, quella famiglia e tutti i suoi dati (calendario, liste, faccende, chat, allegati, bollette e ricevute) vengono eliminati. I contenuti condivisi in famiglie con altri membri possono restare visibili agli altri, ma in forma anonima (autore mostrato come "Utente eliminato").</p>
    <p>L'eliminazione e definitiva e irreversibile. Alcuni dati possono essere conservati per il tempo necessario ad adempiere a obblighi di legge. L'eliminazione dell'account non annulla automaticamente eventuali abbonamenti Premium, che vanno gestiti dallo store (Apple o Google). Maggiori dettagli sono disponibili alla pagina dedicata all'<a href="${getBaseUrl(_req)}/legal/delete-account">eliminazione dell'account</a>.</p>

    <h2>15. Minori</h2>
    <p>${APP_NAME} e un'applicazione per il coordinamento familiare. L'utilizzo da parte di minori di 14 anni e consentito esclusivamente sotto la supervisione e con il consenso di un genitore o tutore legale che sia gia membro della famiglia nell'applicazione.</p>
    <p>Non raccogliamo consapevolmente dati personali di minori di 14 anni senza il consenso verificabile di un genitore o tutore. Se veniamo a conoscenza di aver raccolto dati di un minore senza il consenso appropriato, provvederemo alla loro cancellazione tempestiva.</p>

    <h2>16. Modifiche alla Privacy Policy</h2>
    <p>Ci riserviamo il diritto di aggiornare questa Privacy Policy in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione della nuova Privacy Policy.</p>

    <h2>17. Contatti</h2>
    <p>Per qualsiasi domanda o richiesta relativa a questa Privacy Policy, puoi contattarci all'unico indirizzo:</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(htmlWrapper("Privacy Policy", body));
});
router15.get("/terms", (_req, res) => {
  const body = `
    <h2>1. Accettazione dei Termini</h2>
    <p>Utilizzando ${APP_NAME}, accetti di essere vincolato dai presenti Termini d'Uso. Se non accetti questi termini, ti preghiamo di non utilizzare l'applicazione.</p>

    <h2>2. Descrizione del Servizio</h2>
    <p>${APP_NAME} \xE8 un'applicazione per il coordinamento familiare che consente ai membri di una famiglia di:</p>
    <ul>
      <li>Gestire un calendario condiviso</li>
      <li>Creare e condividere liste della spesa</li>
      <li>Organizzare e assegnare faccende domestiche con un sistema di punti</li>
      <li>Tenere traccia delle bollette e delle scadenze domestiche, con possibilit\xE0 di allegare documenti</li>
      <li>Pianificare ricette e menu settimanali</li>
      <li>Comunicare tramite una chat interna con messaggi, immagini e allegati</li>
      <li>Ricevere suggerimenti basati sull'intelligenza artificiale, ove disponibili</li>
      <li>Sincronizzare le informazioni in tempo reale tra i dispositivi</li>
    </ul>

    <h2>3. Account e Registrazione</h2>
    <ul>
      <li>Per utilizzare ${APP_NAME} \xE8 necessario creare un account fornendo un indirizzo email valido, un nome e una password</li>
      <li>Sei responsabile della riservatezza delle tue credenziali di accesso</li>
      <li>Le informazioni fornite durante la registrazione devono essere accurate e aggiornate</li>
    </ul>

    <h2>4. Minori</h2>
    <ul>
      <li>Per creare un account occorre avere almeno 14 anni</li>
      <li>I minori di 14 anni possono utilizzare l'app solo sotto la supervisione e con il consenso di un genitore o tutore legale</li>
      <li>${APP_NAME} \xE8 pensata per il coordinamento familiare e non \xE8 un servizio autonomo destinato principalmente ai bambini</li>
    </ul>

    <h2>5. Gruppi Familiari</h2>
    <ul>
      <li>L'utente che crea un gruppo familiare ne diventa automaticamente l'amministratore</li>
      <li>Gli amministratori possono invitare nuovi membri, rimuovere membri esistenti e gestire le impostazioni del gruppo</li>
      <li>I contenuti inseriti all'interno di un gruppo familiare (eventi, liste, faccende) sono visibili a tutti i membri del gruppo</li>
      <li>L'uscita da un gruppo familiare non comporta la cancellazione dei contenuti precedentemente condivisi</li>
    </ul>

    <h2>6. Responsabilit\xE0 dei Contenuti (UGC)</h2>
    <p>L'utente \xE8 l'unico responsabile dei contenuti inseriti nell'applicazione (contenuti generati dagli utenti, "UGC"), inclusi ma non limitati a:</p>
    <ul>
      <li>Nomi degli eventi e relative descrizioni</li>
      <li>Articoli nelle liste della spesa</li>
      <li>Descrizioni delle faccende domestiche</li>
      <li>Messaggi, immagini e allegati inviati nella chat</li>
      <li>Bollette, importi e documenti allegati</li>
      <li>Ricette e piani pasti</li>
      <li>Informazioni del profilo e del gruppo familiare</li>
    </ul>
    <p>I contenuti non devono essere illegali, offensivi, diffamatori o in violazione dei diritti di terzi.</p>
    <p>${APP_NAME} non effettua un monitoraggio preventivo dei contenuti generati dagli utenti, ma si riserva il diritto di rimuovere contenuti che violino i presenti Termini a seguito di segnalazione o controllo.</p>
    <p><strong>Licenza limitata sui contenuti:</strong> l'utente mantiene la piena titolarit\xE0 dei propri contenuti. Caricando contenuti, l'utente concede a ${APP_NAME} una licenza limitata, non esclusiva, gratuita e revocabile, valida per la sola durata dell'utilizzo del servizio e al solo scopo di erogare le funzionalit\xE0 dell'app (ad esempio archiviazione, sincronizzazione tra dispositivi e condivisione con gli altri membri della famiglia). Questa licenza non attribuisce a ${APP_NAME} alcun diritto di utilizzare i contenuti per finalit\xE0 diverse e cessa al momento della rimozione dei contenuti o dell'eliminazione dell'account, salvo i contenuti gi\xE0 condivisi con altri membri o gli obblighi di conservazione previsti dalla legge.</p>

    <h2>7. Chat e Allegati</h2>
    <p>L'app include una chat interna che consente ai membri della stessa famiglia di scambiarsi messaggi di testo, immagini e file allegati.</p>
    <ul>
      <li>I messaggi e gli allegati sono visibili a tutti i membri del gruppo familiare</li>
      <li>L'utente \xE8 responsabile dei contenuti che invia e non deve caricare materiale illegale, offensivo o in violazione di diritti altrui</li>
      <li>Sono ammessi solo i tipi di file consentiti dall'app, in particolare immagini e PDF, entro i limiti di dimensione previsti</li>
      <li>I messaggi degli utenti bloccati non vengono mostrati al membro che ha effettuato il blocco</li>
      <li>I file allegati vengono conservati sui nostri server per consentire la visualizzazione. Se l'utente \xE8 l'unico membro di una famiglia e la famiglia viene eliminata, vengono rimossi anche gli allegati fisici collegati, come immagini della chat, documenti delle bollette e avatar. Se invece la famiglia continua a esistere con altri membri, i contenuti e gli allegati gi\xE0 condivisi possono restare disponibili agli altri membri in forma associata a "Utente eliminato"</li>
    </ul>

    <h2>8. Gestione Bollette e Scadenze</h2>
    <p>${APP_NAME} offre uno strumento per annotare bollette, importi e scadenze domestiche e per allegare documenti relativi.</p>
    <ul>
      <li><strong>${APP_NAME} NON elabora pagamenti reali:</strong> la funzione bollette ha finalit\xE0 esclusivamente organizzativa e di promemoria. L'app non esegue, non gestisce e non intermedia alcun pagamento verso fornitori o terzi</li>
      <li>L'app <strong>non richiede e non deve essere utilizzata per inserire dati di pagamento sensibili</strong> come numeri di carta di credito, codici CVV, coordinate bancarie complete o IBAN. Si invita l'utente a non inserire tali dati nei campi di testo o negli allegati</li>
      <li>Gli importi e le scadenze inseriti sono semplici annotazioni a cura dell'utente: ${APP_NAME} non ne garantisce l'esattezza e non \xE8 responsabile di mancati pagamenti, more o penali</li>
      <li>L'utente resta l'unico responsabile del pagamento effettivo delle proprie bollette presso i rispettivi fornitori</li>
      <li>I promemoria e le notifiche hanno funzione di supporto e potrebbero non essere sempre ricevuti, ad esempio per impostazioni del dispositivo, assenza di rete, limitazioni del sistema operativo o disattivazione delle notifiche</li>
    </ul>

    <h2>9. Funzionalit\xE0 di Intelligenza Artificiale</h2>
    <p>${APP_NAME} offre funzionalit\xE0 basate sull'intelligenza artificiale (ad esempio suggerimenti per la spesa, ottimizzazione delle faccende e proposte di ricette o piani pasti).</p>
    <ul>
      <li>Le funzionalit\xE0 AI sono <strong>disponibili secondo le impostazioni dell'app</strong>, con un interruttore dedicato per attivarle o disattivarle in qualsiasi momento, e nei limiti previsti dal piano Free o Premium</li>
      <li>Per fornire i suggerimenti, alcuni dati pertinenti possono essere inviati a fornitori terzi di servizi AI; non vengono inviati pi\xF9 dati del necessario</li>
      <li>I contenuti generati dall'AI hanno <strong>natura puramente indicativa e possono essere imprecisi, incompleti o non aggiornati</strong>. Non costituiscono consulenza medica, nutrizionale, legale o finanziaria</li>
      <li>L'utente \xE8 tenuto a verificare in autonomia i suggerimenti prima di utilizzarli: ${APP_NAME} non \xE8 responsabile delle decisioni assunte sulla base dei contenuti generati dall'AI</li>
      <li>L'uso dell'AI pu\xF2 essere soggetto a limiti di utilizzo (quota) differenziati tra piano Free e Premium</li>
    </ul>

    <h2>10. Segnalazione e Moderazione Contenuti</h2>
    <p>Per garantire un ambiente sicuro e rispettoso per tutte le famiglie, ${APP_NAME} offre strumenti di segnalazione e moderazione:</p>
    <ul>
      <li><strong>Segnalazione contenuti:</strong> ogni membro della famiglia pu\xF2 segnalare contenuti (eventi, articoli spesa, faccende, messaggi chat) o utenti che ritiene inappropriati, offensivi o in violazione dei Termini</li>
      <li><strong>Categorie di segnalazione:</strong> spam, molestie, odio, contenuti sessuali, violenza, altro</li>
      <li><strong>Gestione segnalazioni:</strong> le segnalazioni vengono esaminate dagli amministratori del gruppo familiare, che possono prendere provvedimenti (azione o archiviazione)</li>
      <li><strong>Blocco utenti:</strong> ogni membro pu\xF2 bloccare un altro membro all'interno della propria famiglia. I contenuti degli utenti bloccati non saranno pi\xF9 visibili al membro che ha effettuato il blocco</li>
      <li><strong>Sblocco:</strong> \xE8 possibile sbloccare un utente in qualsiasi momento dalle impostazioni</li>
      <li>Per segnalazioni che richiedono assistenza puoi scrivere a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></li>
    </ul>
    <p>L'abuso del sistema di segnalazione (segnalazioni false o ripetute in malafede) pu\xF2 comportare la sospensione dell'account.</p>

    <h2>11. Uso Corretto</h2>
    <p>L'utente si impegna a:</p>
    <ul>
      <li>Utilizzare l'applicazione esclusivamente per le finalit\xE0 previste di coordinamento familiare</li>
      <li>Non tentare di accedere ad account o dati di altri utenti senza autorizzazione</li>
      <li>Non utilizzare sistemi automatizzati (bot, scraper) per interagire con il servizio</li>
      <li>Non tentare di compromettere la sicurezza o la stabilit\xE0 dell'applicazione</li>
      <li>Rispettare le leggi applicabili durante l'utilizzo del servizio</li>
    </ul>

    <h2>12. Divieti</h2>
    <p>\xC8 espressamente vietato:</p>
    <ul>
      <li>Creare account falsi o multipli per finalit\xE0 abusive</li>
      <li>Utilizzare il servizio per attivit\xE0 commerciali non autorizzate</li>
      <li>Distribuire malware o contenuti dannosi attraverso l'applicazione</li>
      <li>Tentare di effettuare ingegneria inversa del software</li>
      <li>Interferire con il funzionamento dell'applicazione o dei suoi server</li>
    </ul>

    <h2>13. Piani Free e Premium e Abbonamenti</h2>
    <p>${APP_NAME} \xE8 disponibile in un piano <strong>Free</strong> gratuito e in un piano <strong>Premium</strong> a pagamento, attivabile tramite abbonamento.</p>
    <ul>
      <li><strong>Piano Free:</strong> consente l'utilizzo delle funzionalit\xE0 di base, con alcuni limiti (ad esempio quota di utilizzo delle funzionalit\xE0 AI)</li>
      <li><strong>Piano Premium:</strong> sblocca funzionalit\xE0 aggiuntive e limiti pi\xF9 ampi. Prezzi e durata dell'abbonamento sono indicati all'interno dell'app al momento dell'acquisto</li>
      <li><strong>Acquisti su mobile:</strong> gli abbonamenti Premium sulle app mobili vengono gestiti tramite i sistemi di pagamento degli store ufficiali, ovvero <strong>Apple App Store (StoreKit)</strong> su iOS e <strong>Google Play Billing</strong> su Android, con il supporto tecnico del fornitore <strong>RevenueCat</strong> per la gestione degli abbonamenti</li>
      <li>L'addebito, il rinnovo automatico e la gestione o cancellazione dell'abbonamento avvengono tramite l'account dello store (Apple o Google). Per disdire occorre agire nelle impostazioni del proprio account store; la disinstallazione dell'app non annulla l'abbonamento</li>
      <li>I rimborsi sono soggetti alle politiche dello store di riferimento (Apple o Google)</li>
      <li>Alcune funzionalit\xE0 Premium possono essere disponibili solo dopo l'attivazione del servizio di abbonamento</li>
    </ul>

    <h2>14. Sospensione e Chiusura Account</h2>
    <p>Ci riserviamo il diritto di:</p>
    <ul>
      <li>Sospendere temporaneamente o chiudere definitivamente un account in caso di violazione dei presenti Termini</li>
      <li>Rimuovere contenuti che violino le nostre politiche o le leggi applicabili</li>
      <li>Interrompere il servizio con un preavviso ragionevole</li>
    </ul>
    <p>L'utente pu\xF2 eliminare il proprio account in qualsiasi momento direttamente dall'app (scheda <strong>Famiglia</strong> &rarr; <strong>Elimina account</strong>), anche se l'indirizzo email non \xE8 ancora stato verificato, oppure contattandoci all'indirizzo <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. L'eliminazione \xE8 definitiva: comporta l'anonimizzazione del profilo e, se l'utente \xE8 l'unico membro di una famiglia, la cancellazione della famiglia e dei relativi contenuti, inclusi i file fisici allegati (immagini della chat, documenti delle bollette e avatar). I contenuti gi\xE0 condivisi con una famiglia che continua a esistere con altri membri possono restare visibili in forma anonima. L'eliminazione dell'account non annulla eventuali abbonamenti Premium, che vanno gestiti separatamente dallo store (Apple o Google).</p>

    <h2>15. Limitazioni di Responsabilit\xE0</h2>
    <p>Nei limiti consentiti dalla legge applicabile:</p>
    <ul>
      <li>Il servizio viene fornito "cos\xEC com'\xE8" e "come disponibile", senza garanzie di alcun tipo, espresse o implicite</li>
      <li>Non garantiamo che il servizio sia sempre disponibile, privo di errori o sicuro al 100%</li>
      <li>Non siamo responsabili per eventuali perdite di dati dovute a malfunzionamenti tecnici, salvo dolo o colpa grave</li>
      <li>La nostra responsabilit\xE0 massima \xE8 limitata all'importo pagato dall'utente per il servizio nei 12 mesi precedenti l'evento</li>
    </ul>
    <p>Nessuna disposizione dei presenti Termini esclude o limita la responsabilit\xE0 nei casi in cui ci\xF2 non sia consentito dalla legge, inclusi i diritti inderogabili riconosciuti ai consumatori.</p>

    <h2>16. Propriet\xE0 Intellettuale</h2>
    <p>Tutti i diritti di propriet\xE0 intellettuale relativi a ${APP_NAME}, inclusi design, codice, marchi e contenuti originali, sono di propriet\xE0 esclusiva di ${OWNER}. L'utente non acquisisce alcun diritto di propriet\xE0 intellettuale sull'applicazione. Restano salvi i diritti dell'utente sui propri contenuti (UGC) e la licenza limitata descritta alla sezione 6.</p>

    <h2>17. Legge Applicabile e Foro Competente</h2>
    <p>I presenti Termini d'Uso sono regolati dalla legge italiana. Per qualsiasi controversia derivante dall'utilizzo del servizio, sar\xE0 competente il Foro del luogo di residenza del consumatore, in conformit\xE0 con il Codice del Consumo italiano.</p>

    <h2>18. Modifiche ai Termini</h2>
    <p>Ci riserviamo il diritto di modificare i presenti Termini d'Uso in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione dei nuovi Termini.</p>

    <h2>19. Contatti</h2>
    <p>Per qualsiasi domanda o segnalazione relativa ai presenti Termini d'Uso:</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(htmlWrapper("Termini d'Uso", body));
});
router15.get("/delete-account", (_req, res) => {
  const body = `
    <h2>Come eliminare il tuo account ${APP_NAME}</h2>
    <p>Questa pagina spiega come eliminare il tuo account ${APP_NAME} e quali dati vengono rimossi. L'eliminazione e <strong>definitiva e irreversibile</strong>.</p>

    <h2>1. Eliminazione direttamente dall'app (consigliato)</h2>
    <p>Puoi eliminare il tuo account in autonomia, in qualsiasi momento, direttamente dall'applicazione:</p>
    <ul>
      <li>Apri l'app e accedi al tuo account</li>
      <li>Vai nella scheda <strong>Famiglia</strong></li>
      <li>Scorri fino in fondo e tocca <strong>Elimina account</strong></li>
      <li>Inserisci la tua password e digita <strong>ELIMINA</strong> per confermare</li>
    </ul>
    <p>Al termine verrai disconnesso automaticamente da tutti i dispositivi.</p>

    <h2>2. Eliminazione tramite richiesta via email</h2>
    <p>Se non riesci ad accedere all'app, puoi richiedere l'eliminazione scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> dall'indirizzo email associato al tuo account. Daremo seguito alla richiesta nei tempi previsti dalla normativa applicabile.</p>

    <h2>3. Quali dati vengono eliminati</h2>
    <ul>
      <li>Il tuo profilo personale viene reso anonimo e le tue informazioni di contatto (email, nome, foto) vengono rimosse</li>
      <li>Se sei l'unico membro di una famiglia, quella famiglia e tutti i suoi dati vengono eliminati: calendario, liste della spesa, faccende, chat e allegati, bollette, scadenze e ricevute</li>
      <li>I token di accesso, i token di verifica/reset e i token push del dispositivo vengono eliminati</li>
      <li>Eventuali blocchi e inviti collegati al tuo account vengono rimossi</li>
    </ul>

    <h2>4. Quali dati possono essere conservati</h2>
    <ul>
      <li>I contenuti che hai condiviso in famiglie con altri membri (ad esempio eventi o messaggi) possono restare visibili agli altri membri, ma senza il tuo nome (autore mostrato come "Utente eliminato")</li>
      <li>Alcuni dati possono essere conservati per il tempo necessario ad adempiere a obblighi di legge, contabili o di sicurezza, e i log di sistema fino a un massimo di 12 mesi</li>
    </ul>

    <h2>5. Abbonamenti Premium</h2>
    <p>L'eliminazione dell'account <strong>non annulla automaticamente</strong> un eventuale abbonamento Premium. Gli abbonamenti sono gestiti dallo store. Per non essere piu addebitato, annulla l'abbonamento dalle impostazioni del tuo account:</p>
    <ul>
      <li><strong>iOS:</strong> Impostazioni &rarr; il tuo nome &rarr; Abbonamenti</li>
      <li><strong>Android:</strong> Google Play Store &rarr; Pagamenti e abbonamenti &rarr; Abbonamenti</li>
    </ul>

    <h2>6. Tempi</h2>
    <p>L'eliminazione effettuata dall'app e immediata. Le richieste via email vengono evase nei tempi previsti dalla normativa applicabile.</p>

    <h2>7. Contatti</h2>
    <p>Per qualsiasi domanda relativa all'eliminazione del tuo account, scrivi a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(htmlWrapper("Eliminazione Account", body));
});
var legal_default = router15;

// server/routes/help.ts
import { Router as Router16 } from "express";
import * as fs3 from "fs";
import * as path3 from "path";
var router16 = Router16();
var APP_NAME2 = "FamilySync";
var DEVELOPER = "FamilySync Team";
function markdownToHtml(md) {
  let html = md;
  html = html.replace(/^---$/gm, "");
  html = html.replace(/^> (.+)$/gm, (_, text2) => `<div class="tip"><strong>Nota:</strong> ${formatInline(text2)}</div>`);
  html = html.replace(/^#{3}\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^#{2}\s+(.+)$/gm, (_, title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9àèìòùé\s-]/g, "").replace(/\s+/g, "-").replace(/^[\d]+-/, "").trim();
    return `<h2 id="${id}">${title}</h2>`;
  });
  html = html.replace(/^#{1}\s+(.+)$/gm, "");
  html = html.replace(/\| (.+) \|/g, (match) => {
    return match;
  });
  const lines = html.split("\n");
  const output = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;
  let inCheckList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      if (!inTable) {
        if (inList) {
          output.push("</ul>");
          inList = false;
        }
        if (inCheckList) {
          output.push("</ul>");
          inCheckList = false;
        }
        inTable = true;
        tableHeaderDone = false;
        output.push("<table>");
      }
      if (line.replace(/[|\s-]/g, "") === "") {
        tableHeaderDone = true;
        continue;
      }
      const cells = line.split("|").filter((c) => c.trim() !== "");
      const tag = !tableHeaderDone ? "th" : "td";
      const row = cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("");
      output.push(`<tr>${row}</tr>`);
      if (!tableHeaderDone) tableHeaderDone = true;
      continue;
    } else if (inTable) {
      output.push("</table>");
      inTable = false;
    }
    if (line.startsWith("- [ ]") || line.startsWith("- [x]")) {
      if (!inCheckList) {
        if (inList) {
          output.push("</ul>");
          inList = false;
        }
        inCheckList = true;
        output.push('<ul class="checklist">');
      }
      const checked = line.startsWith("- [x]");
      const text2 = line.replace(/^- \[.\]\s*/, "");
      const formatted = formatInline(text2);
      output.push(`<li><input type="checkbox" disabled ${checked ? "checked" : ""}> ${formatted}</li>`);
      continue;
    } else if (inCheckList && !line.startsWith("- ")) {
      output.push("</ul>");
      inCheckList = false;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        inList = true;
        output.push("<ul>");
      }
      const text2 = line.replace(/^-\s+/, "");
      const formatted = formatInline(text2);
      output.push(`<li>${formatted}</li>`);
      continue;
    } else if (inList && line !== "" && !line.startsWith("  - ")) {
      output.push("</ul>");
      inList = false;
    }
    if (line.startsWith("  - ")) {
      if (!inList) {
        inList = true;
        output.push("<ul>");
      }
      const text2 = line.replace(/^\s+-\s+/, "");
      const formatted = formatInline(text2);
      output.push(`<li style="margin-left:16px">${formatted}</li>`);
      continue;
    }
    if (line.startsWith("<")) {
      output.push(line);
      continue;
    }
    if (line.match(/^\d+\.\s+/)) {
      const text2 = line.replace(/^\d+\.\s+/, "");
      const formatted = formatInline(text2);
      output.push(`<p>${formatted}</p>`);
      continue;
    }
    if (line === "") {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      const text2 = line.replace(/^\*|\*$/g, "");
      output.push(`<p class="update-date">${formatInline(text2)}</p>`);
      continue;
    }
    output.push(`<p>${formatInline(line)}</p>`);
  }
  if (inList) output.push("</ul>");
  if (inCheckList) output.push("</ul>");
  if (inTable) output.push("</table>");
  return output.join("\n");
}
function formatInline(text2) {
  text2 = text2.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text2 = text2.replace(/\[([^\]]+)\]\(#[^)]+\)/g, "$1");
  return text2;
}
function extractFaqJsonLd(md) {
  const faqStart = md.indexOf("## 18. Domande Frequenti (FAQ)");
  if (faqStart === -1) return null;
  const faqSection = md.slice(faqStart);
  const pairs = [];
  const lines = faqSection.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const questionMatch = line.match(/^\*\*(.+\?)\*\*$/);
    if (questionMatch) {
      const question = questionMatch[1].trim();
      const answerLines = [];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (next === "" || next === "---" || next.match(/^\*\*(.+)\*\*$/)) break;
        if (next !== "") answerLines.push(next);
        i++;
      }
      const answer = answerLines.join(" ").trim();
      if (question && answer) {
        pairs.push({ question, answer });
      }
      continue;
    }
    i++;
  }
  if (pairs.length === 0) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": pairs.map((p) => ({
      "@type": "Question",
      "name": p.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": p.answer
      }
    }))
  };
  return JSON.stringify(schema, null, 2);
}
function htmlWrapper2(title, body, faqJsonLd) {
  const ldScript = faqJsonLd ? `
  <script type="application/ld+json">
${faqJsonLd}
  </script>` : "";
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${APP_NAME2}</title>${ldScript}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fafafa;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #4A90D9, #67B8F0);
      padding: 48px 24px 32px;
      text-align: center;
    }
    .header h1 {
      color: #fff;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header .subtitle {
      color: rgba(255,255,255,0.85);
      font-size: 14px;
    }
    .content {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 32px 0 12px;
      color: #1a1a2e;
      padding-bottom: 8px;
      border-bottom: 2px solid #4A90D9;
    }
    h3 {
      font-size: 17px;
      font-weight: 600;
      margin: 20px 0 8px;
      color: #333;
    }
    p, li {
      font-size: 15px;
      color: #333;
      margin-bottom: 10px;
    }
    ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    li { margin-bottom: 6px; }
    a { color: #4A90D9; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { color: #1a1a2e; }
    .tip {
      background: #E8F4FD;
      border-left: 4px solid #4A90D9;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
      font-size: 14px;
    }
    .tip strong { color: #4A90D9; }
    .update-date {
      font-size: 13px;
      color: #888;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 13px;
      color: #888;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #eee;
      font-size: 14px;
    }
    th {
      background: #4A90D9;
      color: #fff;
      font-weight: 600;
    }
    .checklist {
      list-style: none;
      padding-left: 4px;
    }
    .checklist li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
    }
    .checklist input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #4A90D9;
    }
    figure {
      margin: 20px 0;
      text-align: center;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
      border: 1px solid #eee;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    figcaption {
      font-size: 13px;
      color: #888;
      margin-top: 8px;
    }
    @media (max-width: 480px) {
      .header { padding: 40px 16px 24px; }
      .content { padding: 24px 16px 48px; }
      h2 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="subtitle">${APP_NAME2}</div>
  </div>
  <div class="content">
    ${body}
  </div>
  <div class="footer">&copy; 2026 ${DEVELOPER}. Tutti i diritti riservati.</div>
</body>
</html>`;
}
router16.get("/user-guide", (_req, res) => {
  try {
    const mdPath = path3.resolve(process.cwd(), "docs", "guida-utente.md");
    const mdContent = fs3.readFileSync(mdPath, "utf-8");
    const bodyHtml = markdownToHtml(mdContent);
    const faqJsonLd = extractFaqJsonLd(mdContent);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.send(htmlWrapper2("Guida Utente", bodyHtml, faqJsonLd));
  } catch (err) {
    res.status(500).send("Errore nel caricamento della guida utente.");
  }
});
var help_default = router16;

// server/routes/moderation.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
init_logger();
init_websocket();
import { Router as Router17 } from "express";
import { z as z14 } from "zod";
import { eq as eq25, and as and20, desc as desc4 } from "drizzle-orm";
var router17 = Router17();
var createReportSchema = z14.object({
  familyId: z14.string().uuid(),
  targetType: z14.enum(["calendar_event", "shopping_item", "chore", "user"]),
  targetId: z14.string().uuid(),
  reasonCategory: z14.enum(["spam", "harassment", "hate", "sexual", "violence", "other"]),
  reasonText: z14.string().max(500).optional()
});
var createBlockSchema = z14.object({
  familyId: z14.string().uuid(),
  blockedUserId: z14.string().uuid()
});
router17.post("/report", authenticate, async (req, res) => {
  try {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { familyId, targetType, targetId, reasonCategory, reasonText } = parsed.data;
    const [membership] = await db.select().from(familyMembers).where(and20(eq25(familyMembers.userId, req.user.userId), eq25(familyMembers.familyId, familyId))).limit(1);
    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" }
      });
    }
    if (targetType === "calendar_event") {
      const [evt] = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(and20(eq25(calendarEvents.id, targetId), eq25(calendarEvents.familyId, familyId))).limit(1);
      if (!evt) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Evento non trovato in questa famiglia" } });
      }
    } else if (targetType === "shopping_item") {
      const itemWithList = await db.select({ itemId: shoppingItems.id }).from(shoppingItems).innerJoin(shoppingLists, eq25(shoppingItems.listId, shoppingLists.id)).where(and20(eq25(shoppingItems.id, targetId), eq25(shoppingLists.familyId, familyId))).limit(1);
      if (itemWithList.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa famiglia" } });
      }
    } else if (targetType === "chore") {
      const [ch] = await db.select({ id: chores.id }).from(chores).where(and20(eq25(chores.id, targetId), eq25(chores.familyId, familyId))).limit(1);
      if (!ch) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata in questa famiglia" } });
      }
    } else if (targetType === "user") {
      const [targetMember] = await db.select({ id: familyMembers.id }).from(familyMembers).where(and20(eq25(familyMembers.userId, targetId), eq25(familyMembers.familyId, familyId))).limit(1);
      if (!targetMember) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Utente non trovato in questa famiglia" } });
      }
    }
    const [report] = await db.insert(reports).values({
      familyId,
      reporterUserId: req.user.userId,
      targetType,
      targetId,
      reasonCategory,
      reasonText: reasonText || null
    }).returning();
    res.status(201).json(report);
  } catch (error) {
    logger.error("Create report error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della segnalazione" } });
  }
});
router17.get("/reports/:familyId", authenticate, requireFamilyAdmin(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const statusFilter = getQuery(req, "status");
    const conditions = [eq25(reports.familyId, familyId)];
    if (statusFilter) {
      conditions.push(eq25(reports.status, statusFilter));
    }
    const reportsList = await db.select().from(reports).where(and20(...conditions)).orderBy(desc4(reports.createdAt));
    const enriched = await Promise.all(
      reportsList.map(async (r) => {
        const [reporter] = await db.select({ name: users.name }).from(users).where(eq25(users.id, r.reporterUserId)).limit(1);
        return { ...r, reporterName: reporter?.name || "Sconosciuto" };
      })
    );
    res.json(enriched);
  } catch (error) {
    logger.error("Get reports error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero segnalazioni" } });
  }
});
router17.patch("/reports/:familyId/:reportId", authenticate, requireFamilyAdmin(), async (req, res) => {
  try {
    const reportId = getParam(req, "reportId");
    const { status } = req.body;
    if (!["actioned", "dismissed"].includes(status)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Stato non valido. Usa 'actioned' o 'dismissed'" }
      });
    }
    const [updated] = await db.update(reports).set({ status, updatedAt: /* @__PURE__ */ new Date() }).where(eq25(reports.id, reportId)).returning();
    if (!updated) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Segnalazione non trovata" } });
    }
    res.json(updated);
  } catch (error) {
    logger.error("Update report error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});
router17.post("/block", authenticate, async (req, res) => {
  try {
    const parsed = createBlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { familyId, blockedUserId } = parsed.data;
    if (blockedUserId === req.user.userId) {
      return res.status(400).json({
        error: { code: "CANNOT_BLOCK_SELF", message: "Non puoi bloccare te stesso" }
      });
    }
    const [membership] = await db.select().from(familyMembers).where(and20(eq25(familyMembers.userId, req.user.userId), eq25(familyMembers.familyId, familyId))).limit(1);
    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" }
      });
    }
    const [block] = await db.insert(blocks).values({
      familyId,
      blockerUserId: req.user.userId,
      blockedUserId
    }).onConflictDoNothing().returning();
    if (!block) {
      return res.json({ message: "Utente gi\xE0 bloccato" });
    }
    invalidateBlockCache(familyId, req.user.userId);
    invalidateBlockCache(familyId, blockedUserId);
    res.status(201).json(block);
  } catch (error) {
    logger.error("Create block error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel blocco utente" } });
  }
});
router17.delete("/block/:familyId/:blockedUserId", authenticate, async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const blockedUserId = getParam(req, "blockedUserId");
    await db.delete(blocks).where(
      and20(
        eq25(blocks.familyId, familyId),
        eq25(blocks.blockerUserId, req.user.userId),
        eq25(blocks.blockedUserId, blockedUserId)
      )
    );
    invalidateBlockCache(familyId, req.user.userId);
    invalidateBlockCache(familyId, blockedUserId);
    res.json({ message: "Utente sbloccato" });
  } catch (error) {
    logger.error("Delete block error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nello sblocco utente" } });
  }
});
router17.get("/blocks/:familyId", authenticate, async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const [membership] = await db.select().from(familyMembers).where(and20(eq25(familyMembers.userId, req.user.userId), eq25(familyMembers.familyId, familyId))).limit(1);
    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" }
      });
    }
    const userBlocks = await db.select().from(blocks).where(and20(eq25(blocks.familyId, familyId), eq25(blocks.blockerUserId, req.user.userId)));
    const enriched = await Promise.all(
      userBlocks.map(async (b) => {
        const [blockedUser] = await db.select({ name: users.name }).from(users).where(eq25(users.id, b.blockedUserId)).limit(1);
        return {
          id: b.id,
          blockedUserId: b.blockedUserId,
          blockedUserName: blockedUser?.name || "Sconosciuto",
          createdAt: b.createdAt
        };
      })
    );
    res.json(enriched);
  } catch (error) {
    logger.error("Get blocks error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero utenti bloccati" } });
  }
});
router17.patch("/preferences", authenticate, async (req, res) => {
  try {
    const { aiFeaturesEnabled } = req.body;
    if (typeof aiFeaturesEnabled !== "boolean") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "aiFeaturesEnabled deve essere un booleano" }
      });
    }
    const [updated] = await db.update(users).set({ aiFeaturesEnabled, updatedAt: /* @__PURE__ */ new Date() }).where(eq25(users.id, req.user.userId)).returning({
      id: users.id,
      aiFeaturesEnabled: users.aiFeaturesEnabled
    });
    res.json(updated);
  } catch (error) {
    logger.error("Update preferences error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento preferenze" } });
  }
});
router17.get("/preferences", authenticate, async (req, res) => {
  try {
    const [user] = await db.select({ aiFeaturesEnabled: users.aiFeaturesEnabled }).from(users).where(eq25(users.id, req.user.userId)).limit(1);
    res.json({ aiFeaturesEnabled: user?.aiFeaturesEnabled ?? true });
  } catch (error) {
    logger.error("Get preferences error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero preferenze" } });
  }
});
var moderation_default = router17;

// server/routes/recipes.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
init_logger();
init_websocket();
import { Router as Router18 } from "express";
import { z as z15 } from "zod";
import { eq as eq26, and as and21, desc as desc5 } from "drizzle-orm";

// server/lib/shopping-quantity.ts
var UNIT_MAX_LEN = 10;
function toShoppingQuantity(rawQuantity, rawUnit) {
  let quantity = null;
  let unit = rawUnit ? String(rawUnit).trim() : null;
  if (rawQuantity !== null && rawQuantity !== void 0 && String(rawQuantity).trim() !== "") {
    const text2 = String(rawQuantity).trim().replace(",", ".");
    const match = text2.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
    if (match && Number.isFinite(Number(match[1]))) {
      quantity = match[1];
      if (!unit && match[2]) unit = match[2].trim();
    } else if (!unit) {
      unit = text2;
    }
  }
  if (unit) {
    unit = unit.slice(0, UNIT_MAX_LEN);
    if (unit.length === 0) unit = null;
  }
  return { quantity, unit };
}

// server/routes/recipes.ts
var UNIT_LABELS = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  pcs: "pz",
  tbsp: "cucchiai",
  tsp: "cucchiaini",
  cup: "tazza",
  pinch: "pizzico",
  to_taste: "q.b."
};
var router18 = Router18();
var createRecipeSchema = z15.object({
  title: z15.string().min(1),
  description: z15.string().optional(),
  servings: z15.number().int().positive().optional(),
  prepTimeMinutes: z15.number().int().nonnegative().optional(),
  cookTimeMinutes: z15.number().int().nonnegative().optional(),
  steps: z15.array(z15.string()),
  tags: z15.object({
    diet: z15.array(z15.string()).optional(),
    allergens: z15.array(z15.string()).optional(),
    cuisine: z15.string().optional(),
    difficulty: z15.string().optional()
  }).optional(),
  source: z15.enum(["ai", "manual"]).default("manual"),
  ingredients: z15.array(z15.object({
    name: z15.string().min(1),
    quantity: z15.union([z15.number(), z15.string(), z15.null()]).optional(),
    unit: z15.enum(["g", "kg", "ml", "l", "pcs", "tbsp", "tsp", "cup", "pinch", "to_taste"]).optional().nullable(),
    notes: z15.string().optional(),
    category: z15.string().optional()
  }))
});
router18.post("/:familyId/recipes", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = createRecipeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { ingredients, ...recipeData } = parsed.data;
    const [recipe] = await db.insert(recipes).values({
      familyId,
      createdByUserId: req.user.userId,
      title: recipeData.title,
      description: recipeData.description,
      servings: recipeData.servings,
      prepTimeMinutes: recipeData.prepTimeMinutes,
      cookTimeMinutes: recipeData.cookTimeMinutes,
      steps: recipeData.steps,
      tags: recipeData.tags,
      source: recipeData.source
    }).returning();
    const insertedIngredients = [];
    for (const ing of ingredients) {
      const rawQty = ing.quantity;
      const parsedQty = typeof rawQty === "number" ? rawQty : typeof rawQty === "string" ? parseFloat(rawQty) : null;
      const qty = parsedQty !== null && !isNaN(parsedQty) ? parsedQty : null;
      const [inserted] = await db.insert(recipeIngredients).values({
        recipeId: recipe.id,
        name: ing.name,
        quantity: qty === null ? null : String(qty),
        unit: ing.unit || (qty === null ? "to_taste" : null),
        notes: qty === null && typeof rawQty === "string" && rawQty !== "" ? rawQty : ing.notes || null,
        category: ing.category,
        normalizedName: ing.name.toLowerCase().trim()
      }).returning();
      insertedIngredients.push(inserted);
    }
    res.status(201).json({ ...recipe, ingredients: insertedIngredients });
  } catch (error) {
    logger.error("Errore creazione ricetta", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della ricetta" } });
  }
});
var bulkRecipeSchema = z15.object({
  familyId: z15.string().uuid(),
  recipes: z15.array(z15.object({
    title: z15.string().min(1),
    description: z15.string().optional(),
    servings: z15.number().int().positive().optional(),
    prepTimeMinutes: z15.number().int().nonnegative().optional(),
    cookTimeMinutes: z15.number().int().nonnegative().optional(),
    steps: z15.array(z15.string()).min(1),
    tags: z15.object({
      diet: z15.array(z15.string()).optional(),
      allergens: z15.array(z15.string()).optional(),
      cuisine: z15.string().optional(),
      difficulty: z15.string().optional()
    }).optional(),
    imageUrl: z15.string().max(500).optional(),
    ingredients: z15.array(z15.object({
      name: z15.string().min(1),
      quantity: z15.union([z15.number(), z15.string(), z15.null()]).optional(),
      unit: z15.string().optional().nullable(),
      notes: z15.string().optional(),
      category: z15.string().optional()
    })).min(1)
  })).min(1).max(20)
});
var VALID_UNITS3 = new Set(ingredientUnitEnum.enumValues);
function isIngredientUnit(u) {
  return VALID_UNITS3.has(u);
}
var UNIT_MAP2 = {
  grammi: "g",
  grammo: "g",
  gr: "g",
  chilogrammi: "kg",
  chilogrammo: "kg",
  millilitri: "ml",
  millilitro: "ml",
  litri: "l",
  litro: "l",
  pezzi: "pcs",
  pezzo: "pcs",
  pz: "pcs",
  spicchi: "pcs",
  spicchio: "pcs",
  fette: "pcs",
  fetta: "pcs",
  foglie: "pcs",
  foglia: "pcs",
  rametti: "pcs",
  rametto: "pcs",
  mazzi: "pcs",
  mazzo: "pcs",
  cucchiai: "tbsp",
  cucchiaio: "tbsp",
  cucchiaini: "tsp",
  cucchiaino: "tsp",
  tazza: "cup",
  tazze: "cup",
  bicchiere: "cup",
  bicchieri: "cup",
  pizzico: "pinch",
  pizzichi: "pinch",
  "q.b.": "to_taste",
  qb: "to_taste",
  "quanto basta": "to_taste"
};
function sanitizeUnit(unit) {
  if (!unit) return null;
  const lower = unit.toLowerCase().trim();
  if (isIngredientUnit(lower)) return lower;
  if (UNIT_MAP2[lower]) return UNIT_MAP2[lower];
  return "pcs";
}
router18.post("/bulk", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const parsed = bulkRecipeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { familyId, recipes: recipesToSave } = parsed.data;
    const createdIds = [];
    for (const recipeData of recipesToSave) {
      const { ingredients, ...rest } = recipeData;
      const safeImageUrl = rest.imageUrl && /^\/uploads\/recipe-images\/[A-Za-z0-9_-]+\.(png|webp)$/.test(rest.imageUrl) ? rest.imageUrl : null;
      const [recipe] = await db.insert(recipes).values({
        familyId,
        createdByUserId: req.user.userId,
        title: rest.title,
        description: rest.description,
        servings: rest.servings,
        prepTimeMinutes: rest.prepTimeMinutes,
        cookTimeMinutes: rest.cookTimeMinutes,
        steps: rest.steps,
        tags: rest.tags,
        imageUrl: safeImageUrl,
        source: "ai"
      }).returning();
      for (const ing of ingredients) {
        const rawQty = ing.quantity;
        const parsedQty = typeof rawQty === "number" ? rawQty : typeof rawQty === "string" ? parseFloat(rawQty) : null;
        const qty = parsedQty !== null && !isNaN(parsedQty) ? parsedQty : null;
        const safeUnit = sanitizeUnit(ing.unit) || (qty === null ? "to_taste" : null);
        await db.insert(recipeIngredients).values({
          recipeId: recipe.id,
          name: ing.name,
          quantity: qty === null ? null : String(qty),
          unit: safeUnit,
          notes: qty === null && typeof rawQty === "string" && rawQty !== "" ? rawQty : ing.notes || null,
          category: ing.category,
          normalizedName: ing.name.toLowerCase().trim()
        });
      }
      createdIds.push(recipe.id);
    }
    res.status(201).json({ recipeIds: createdIds, count: createdIds.length });
  } catch (error) {
    logger.error("Errore bulk creazione ricette", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel salvataggio delle ricette" } });
  }
});
router18.get("/:familyId/recipes", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const result = await db.select().from(recipes).where(eq26(recipes.familyId, familyId)).orderBy(desc5(recipes.createdAt));
    res.json(result);
  } catch (error) {
    logger.error("Errore recupero ricette", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero delle ricette" } });
  }
});
router18.get("/:familyId/recipes/:recipeId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const recipeId = getParam(req, "recipeId");
    const [recipe] = await db.select().from(recipes).where(and21(eq26(recipes.id, recipeId), eq26(recipes.familyId, familyId))).limit(1);
    if (!recipe) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ricetta non trovata" } });
    }
    const ingredients = await db.select().from(recipeIngredients).where(eq26(recipeIngredients.recipeId, recipeId));
    res.json({ ...recipe, ingredients });
  } catch (error) {
    logger.error("Errore recupero ricetta", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero della ricetta" } });
  }
});
router18.delete("/:familyId/recipes/:recipeId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const recipeId = getParam(req, "recipeId");
    const [recipe] = await db.select().from(recipes).where(and21(eq26(recipes.id, recipeId), eq26(recipes.familyId, familyId))).limit(1);
    if (!recipe) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ricetta non trovata" } });
    }
    await db.delete(recipes).where(and21(eq26(recipes.id, recipeId), eq26(recipes.familyId, familyId)));
    res.json({ message: "Ricetta eliminata con successo" });
  } catch (error) {
    logger.error("Errore eliminazione ricetta", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione della ricetta" } });
  }
});
var toShoppingListSchema = z15.object({
  listId: z15.string().uuid().optional().nullable()
});
router18.post("/:familyId/recipes/:recipeId/to-shopping-list", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const recipeId = getParam(req, "recipeId");
    const parsed = toShoppingListSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Dati non validi" } });
    }
    const [recipe] = await db.select().from(recipes).where(and21(eq26(recipes.id, recipeId), eq26(recipes.familyId, familyId))).limit(1);
    if (!recipe) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ricetta non trovata" } });
    }
    const ingredients = await db.select().from(recipeIngredients).where(eq26(recipeIngredients.recipeId, recipeId));
    const unique2 = /* @__PURE__ */ new Map();
    for (const ing of ingredients) {
      const key = normalizeItemName(ing.name) || ing.normalizedName;
      if (!unique2.has(key)) {
        const unitLabel = ing.unit ? UNIT_LABELS[ing.unit] ?? ing.unit : null;
        unique2.set(key, {
          name: ing.name,
          ...toShoppingQuantity(ing.quantity, unitLabel)
        });
      }
    }
    if (unique2.size === 0) {
      return res.status(400).json({ error: { code: "NO_INGREDIENTS", message: "La ricetta non ha ingredienti" } });
    }
    const slot = await reserveBaseSlot(req.user.userId, familyId, "shopping-item");
    if (slot.status === "limited") {
      return res.status(429).json(baseLimitBody(slot));
    }
    let listId = parsed.data.listId ?? null;
    let listName;
    if (listId) {
      const [list] = await db.select().from(shoppingLists).where(and21(eq26(shoppingLists.id, listId), eq26(shoppingLists.familyId, familyId))).limit(1);
      if (!list) {
        return res.status(404).json({ error: { code: "LIST_NOT_FOUND", message: "Lista della spesa non trovata" } });
      }
      listName = list.name;
      const existingItems = await db.select({ name: shoppingItems.name, isChecked: shoppingItems.isChecked }).from(shoppingItems).where(eq26(shoppingItems.listId, listId));
      const existingNorm = new Set(
        existingItems.filter((i) => !i.isChecked).map((i) => normalizeItemName(i.name)).filter((n) => n.length > 0)
      );
      for (const norm of Array.from(unique2.keys())) {
        if (existingNorm.has(norm)) unique2.delete(norm);
      }
      if (unique2.size === 0) {
        return res.status(200).json({ shoppingListId: listId, listName, ingredientCount: 0, alreadyPresent: true });
      }
    } else {
      const [newList] = await db.insert(shoppingLists).values({
        familyId,
        name: `Spesa per ${recipe.title}`.slice(0, 255),
        icon: "restaurant",
        createdBy: req.user.userId
      }).returning();
      listId = newList.id;
      listName = newList.name;
    }
    await db.insert(shoppingItems).values(
      Array.from(unique2.values()).map((ing) => ({
        listId,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: "food",
        createdBy: req.user.userId
      }))
    );
    broadcastToFamily(familyId, "shopping:updated", {});
    logger.info("Recipe converted to shopping list", { recipeId, listId, ingredientCount: unique2.size });
    res.status(201).json({ shoppingListId: listId, listName, ingredientCount: unique2.size });
  } catch (error) {
    logger.error("Convert recipe to shopping list error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'invio alla lista della spesa" } });
  }
});
var recipes_default = router18;

// server/routes/meal-plans.ts
init_http_params();
init_db();
init_schema();
init_auth();
init_family();
init_logger();
init_websocket();
import { Router as Router19 } from "express";
import { z as z16 } from "zod";
import { eq as eq27, and as and22, desc as desc6, inArray as inArray4 } from "drizzle-orm";

// server/lib/db-errors.ts
function isUniqueViolation(err) {
  if (!err) return false;
  const code = err?.code;
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /unique|duplicate|23505/i.test(message);
}

// server/routes/meal-plans.ts
var router19 = Router19();
var createMealPlanSchema = z16.object({
  weekStartDate: z16.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z16.string().optional(),
  preferences: z16.object({
    diet: z16.string().optional(),
    allergies: z16.string().optional(),
    maxTimeMinutes: z16.number().optional(),
    mealsPerDay: z16.number().optional()
  }).optional(),
  items: z16.array(z16.object({
    date: z16.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealType: z16.enum(["breakfast", "lunch", "dinner", "snack"]),
    recipeId: z16.string().uuid().optional().nullable(),
    titleOverride: z16.string().optional().nullable(),
    servings: z16.number().int().positive().optional(),
    notes: z16.string().optional(),
    ingredients: z16.array(z16.object({
      name: z16.string(),
      quantity: z16.string().optional(),
      unit: z16.string().optional()
    })).optional().nullable()
  }))
});
router19.post("/:familyId/meal-plans", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = createMealPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const { items, ...planData } = parsed.data;
    const [existing] = await db.select({ id: mealPlans.id }).from(mealPlans).where(and22(eq27(mealPlans.familyId, familyId), eq27(mealPlans.weekStartDate, planData.weekStartDate))).limit(1);
    if (existing) {
      return res.status(409).json({
        error: {
          code: "PLAN_EXISTS",
          message: "Esiste gi\xE0 un piano pasti per questa settimana. Eliminalo prima di crearne uno nuovo.",
          planId: existing.id
        }
      });
    }
    let plan;
    try {
      [plan] = await db.insert(mealPlans).values({
        familyId,
        createdByUserId: req.user.userId,
        weekStartDate: planData.weekStartDate,
        title: planData.title,
        preferences: planData.preferences
      }).returning();
    } catch (insertErr) {
      if (isUniqueViolation(insertErr)) {
        return res.status(409).json({
          error: { code: "PLAN_EXISTS", message: "Esiste gi\xE0 un piano pasti per questa settimana." }
        });
      }
      throw insertErr;
    }
    let insertedItems = [];
    if (items.length > 0) {
      insertedItems = await db.insert(mealPlanItems).values(
        items.map((item) => ({
          mealPlanId: plan.id,
          date: item.date,
          mealType: item.mealType,
          recipeId: item.recipeId ?? null,
          titleOverride: item.titleOverride ?? null,
          servings: item.servings,
          notes: item.notes,
          ingredients: item.ingredients ?? null
        }))
      ).returning();
    }
    res.status(201).json({ ...plan, items: insertedItems });
  } catch (error) {
    logger.error("Create meal plan error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione del piano pasti" } });
  }
});
router19.get("/:familyId/meal-plans", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const plans = await db.select().from(mealPlans).where(eq27(mealPlans.familyId, familyId)).orderBy(desc6(mealPlans.weekStartDate));
    res.json(plans);
  } catch (error) {
    logger.error("List meal plans error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero dei piani pasti" } });
  }
});
router19.get("/:familyId/meal-plans/:planId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const planId = getParam(req, "planId");
    const [plan] = await db.select().from(mealPlans).where(and22(eq27(mealPlans.id, planId), eq27(mealPlans.familyId, familyId))).limit(1);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }
    const items = await db.select().from(mealPlanItems).where(eq27(mealPlanItems.mealPlanId, planId));
    const recipeIds = items.map((item) => item.recipeId).filter((id) => !!id);
    let recipesMap = {};
    if (recipeIds.length > 0) {
      const recipeRows = await db.select({ id: recipes.id, title: recipes.title }).from(recipes).where(inArray4(recipes.id, recipeIds));
      recipesMap = Object.fromEntries(recipeRows.map((r) => [r.id, r.title]));
    }
    const itemsWithRecipes = items.map((item) => ({
      ...item,
      recipeTitle: item.recipeId ? recipesMap[item.recipeId] ?? null : null
    }));
    res.json({ ...plan, items: itemsWithRecipes });
  } catch (error) {
    logger.error("Get meal plan error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero del piano pasti" } });
  }
});
router19.delete("/:familyId/meal-plans/:planId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const planId = getParam(req, "planId");
    const [plan] = await db.select().from(mealPlans).where(and22(eq27(mealPlans.id, planId), eq27(mealPlans.familyId, familyId))).limit(1);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }
    await db.delete(mealPlans).where(and22(eq27(mealPlans.id, planId), eq27(mealPlans.familyId, familyId)));
    res.json({ message: "Piano pasti eliminato" });
  } catch (error) {
    logger.error("Delete meal plan error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione del piano pasti" } });
  }
});
var mealPlanItemSchema = z16.object({
  date: z16.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z16.enum(["breakfast", "lunch", "dinner", "snack"]),
  recipeId: z16.string().uuid().optional().nullable(),
  titleOverride: z16.string().max(200).optional().nullable(),
  servings: z16.number().int().positive().optional().nullable(),
  notes: z16.string().max(500).optional().nullable(),
  ingredients: z16.array(z16.object({
    name: z16.string(),
    quantity: z16.string().optional(),
    unit: z16.string().optional()
  })).optional().nullable()
});
async function findPlan(familyId, planId) {
  const [plan] = await db.select().from(mealPlans).where(and22(eq27(mealPlans.id, planId), eq27(mealPlans.familyId, familyId))).limit(1);
  return plan;
}
async function recipeBelongsToFamily(familyId, recipeId) {
  const [r] = await db.select({ id: recipes.id }).from(recipes).where(and22(eq27(recipes.id, recipeId), eq27(recipes.familyId, familyId))).limit(1);
  return !!r;
}
router19.put("/:familyId/meal-plans/:planId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const planId = getParam(req, "planId");
    const parsed = z16.object({ title: z16.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Dati non validi" } });
    }
    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }
    const [updated] = await db.update(mealPlans).set({ title: parsed.data.title }).where(and22(eq27(mealPlans.id, planId), eq27(mealPlans.familyId, familyId))).returning();
    broadcastToFamily(familyId, "meal_plan_updated", { planId });
    res.json(updated);
  } catch (error) {
    logger.error("Update meal plan error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento del piano pasti" } });
  }
});
router19.post("/:familyId/meal-plans/:planId/items", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const planId = getParam(req, "planId");
    const parsed = mealPlanItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }
    if (!parsed.data.recipeId && !parsed.data.titleOverride?.trim()) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Indica una ricetta o il nome del pasto" } });
    }
    if (parsed.data.recipeId && !await recipeBelongsToFamily(familyId, parsed.data.recipeId)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Ricetta non trovata" } });
    }
    const [item] = await db.insert(mealPlanItems).values({
      mealPlanId: planId,
      date: parsed.data.date,
      mealType: parsed.data.mealType,
      recipeId: parsed.data.recipeId ?? null,
      titleOverride: parsed.data.titleOverride?.trim() || null,
      servings: parsed.data.servings ?? void 0,
      notes: parsed.data.notes ?? void 0,
      ingredients: parsed.data.ingredients ?? null
    }).returning();
    broadcastToFamily(familyId, "meal_plan_updated", { planId });
    res.status(201).json(item);
  } catch (error) {
    logger.error("Add meal plan item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiunta del pasto" } });
  }
});
router19.put("/:familyId/meal-plans/:planId/items/:itemId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const planId = getParam(req, "planId");
    const itemId = getParam(req, "itemId");
    const parsed = mealPlanItemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }
    const [existingItem] = await db.select().from(mealPlanItems).where(and22(eq27(mealPlanItems.id, itemId), eq27(mealPlanItems.mealPlanId, planId))).limit(1);
    if (!existingItem) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Pasto non trovato" } });
    }
    if (parsed.data.recipeId && !await recipeBelongsToFamily(familyId, parsed.data.recipeId)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Ricetta non trovata" } });
    }
    const nextRecipeId = parsed.data.recipeId !== void 0 ? parsed.data.recipeId : existingItem.recipeId;
    const nextTitle = parsed.data.titleOverride !== void 0 ? parsed.data.titleOverride : existingItem.titleOverride;
    if (!nextRecipeId && !nextTitle?.trim()) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Indica una ricetta o il nome del pasto" } });
    }
    const updates = {};
    if (parsed.data.date !== void 0) updates.date = parsed.data.date;
    if (parsed.data.mealType !== void 0) updates.mealType = parsed.data.mealType;
    if (parsed.data.recipeId !== void 0) updates.recipeId = parsed.data.recipeId;
    if (parsed.data.titleOverride !== void 0) updates.titleOverride = parsed.data.titleOverride?.trim() || null;
    if (parsed.data.servings !== void 0) updates.servings = parsed.data.servings;
    if (parsed.data.notes !== void 0) updates.notes = parsed.data.notes;
    if (parsed.data.ingredients !== void 0) updates.ingredients = parsed.data.ingredients;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Nessuna modifica indicata" } });
    }
    const [updated] = await db.update(mealPlanItems).set(updates).where(and22(eq27(mealPlanItems.id, itemId), eq27(mealPlanItems.mealPlanId, planId))).returning();
    broadcastToFamily(familyId, "meal_plan_updated", { planId });
    res.json(updated);
  } catch (error) {
    logger.error("Update meal plan item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella modifica del pasto" } });
  }
});
router19.delete("/:familyId/meal-plans/:planId/items/:itemId", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const planId = getParam(req, "planId");
    const itemId = getParam(req, "itemId");
    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }
    const [existingItem] = await db.select({ id: mealPlanItems.id }).from(mealPlanItems).where(and22(eq27(mealPlanItems.id, itemId), eq27(mealPlanItems.mealPlanId, planId))).limit(1);
    if (!existingItem) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Pasto non trovato" } });
    }
    await db.delete(mealPlanItems).where(and22(eq27(mealPlanItems.id, itemId), eq27(mealPlanItems.mealPlanId, planId)));
    broadcastToFamily(familyId, "meal_plan_updated", { planId });
    res.json({ message: "Pasto rimosso" });
  } catch (error) {
    logger.error("Delete meal plan item error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione del pasto" } });
  }
});
router19.post("/:familyId/meal-plans/:planId/to-shopping-list", authenticate, requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const planId = getParam(req, "planId");
    const [plan] = await db.select().from(mealPlans).where(and22(eq27(mealPlans.id, planId), eq27(mealPlans.familyId, familyId))).limit(1);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }
    const items = await db.select().from(mealPlanItems).where(eq27(mealPlanItems.mealPlanId, planId));
    const uniqueIngredients = /* @__PURE__ */ new Map();
    for (const item of items) {
      const inlineIngredients = item.ingredients;
      if (inlineIngredients && Array.isArray(inlineIngredients)) {
        for (const ing of inlineIngredients) {
          if (!ing.name) continue;
          const norm = normalizeItemName(ing.name);
          if (!norm) continue;
          if (!uniqueIngredients.has(norm)) {
            uniqueIngredients.set(norm, {
              name: ing.name,
              ...toShoppingQuantity(ing.quantity ?? null, ing.unit ?? null),
              category: "food"
            });
          }
        }
      }
    }
    const recipeIds = items.map((item) => item.recipeId).filter((id) => !!id);
    if (recipeIds.length > 0) {
      const recipeIngs = await db.select().from(recipeIngredients).where(inArray4(recipeIngredients.recipeId, recipeIds));
      for (const ing of recipeIngs) {
        if (!uniqueIngredients.has(ing.normalizedName)) {
          uniqueIngredients.set(ing.normalizedName, {
            name: ing.name,
            ...toShoppingQuantity(ing.quantity, ing.unit),
            category: ing.category
          });
        }
      }
    }
    if (uniqueIngredients.size === 0) {
      return res.status(400).json({ error: { code: "NO_INGREDIENTS", message: "Nessun ingrediente trovato nel piano pasti" } });
    }
    const slot = await reserveBaseSlot(req.user.userId, familyId, "shopping-item");
    if (slot.status === "limited") {
      return res.status(429).json(baseLimitBody(slot));
    }
    const listName = `Spesa per ${plan.title || "Piano " + plan.weekStartDate}`;
    const [shoppingList] = await db.insert(shoppingLists).values({
      familyId,
      name: listName,
      icon: "restaurant",
      createdBy: req.user.userId
    }).returning();
    const shoppingItemValues = Array.from(uniqueIngredients.values()).map((ing) => ({
      listId: shoppingList.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category ?? "food",
      createdBy: req.user.userId
    }));
    await db.insert(shoppingItems).values(shoppingItemValues);
    broadcastToFamily(familyId, "shopping:updated", {});
    logger.info("Meal plan converted to shopping list", { planId, ingredientCount: uniqueIngredients.size });
    res.status(201).json({ shoppingListId: shoppingList.id, ingredientCount: uniqueIngredients.size });
  } catch (error) {
    logger.error("Convert meal plan to shopping list error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella conversione in lista della spesa" } });
  }
});
var meal_plans_default = router19;

// server/routes/chat.ts
init_db();
init_schema();
init_block_filter();
init_websocket();
import { Router as Router20 } from "express";
import multer2 from "multer";
import path4 from "path";
import crypto5 from "crypto";
import fs4 from "fs";
import { eq as eq28, and as and23, desc as desc7, lt as lt3 } from "drizzle-orm";
init_logger();
var router20 = Router20();
function getUploadBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    const proto2 = req.headers["x-forwarded-proto"] || req.protocol || "https";
    return `${proto2}://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}
function withAbsoluteFileUrl(msg, req) {
  if (msg.fileUrl) {
    const base = getUploadBaseUrl(req);
    return { ...msg, fileUrlAbs: new URL(msg.fileUrl, base).toString() };
  }
  return msg;
}
var localDiskStorage = {
  async save(file, req) {
    const relativeUrl = `/uploads/${file.filename}`;
    return {
      url: relativeUrl,
      mime: file.mimetype,
      size: file.size,
      filename: file.originalname
    };
  }
};
function getChatStorage() {
  return localDiskStorage;
}
var chatFileStorage = getChatStorage();
var uploadWarningLogged = false;
if (process.env.NODE_ENV === "production" && !process.env.STORAGE_MODE) {
  logger.warn("UPLOAD_STORAGE_WARNING", {
    tag: "UPLOAD_STORAGE_WARNING",
    msg: "Using local disk uploads in production is fragile. Consider S3/R2/Supabase by setting STORAGE_MODE env var."
  });
  uploadWarningLogged = true;
}
var uploadsDir2 = path4.resolve("uploads");
if (!fs4.existsSync(uploadsDir2)) {
  fs4.mkdirSync(uploadsDir2, { recursive: true });
}
var MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf"
};
var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
function isAllowedUploadMime(mimetype) {
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, mimetype);
}
function resolveUploadExtension(mimetype) {
  return MIME_EXTENSIONS[mimetype] ?? "";
}
function buildStoredFilename(mimetype, randomName) {
  return `${randomName}${resolveUploadExtension(mimetype)}`;
}
function resolveSafeUploadPath2(fileUrl, baseDir = uploadsDir2) {
  const filePath = path4.resolve(fileUrl.replace(/^\//, ""));
  if (filePath.startsWith(baseDir + path4.sep)) {
    return filePath;
  }
  return null;
}
var MAGIC_VERIFIED_MIMES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf"
]);
function verifyMagicBytes(buffer, mimetype) {
  if (!MAGIC_VERIFIED_MIMES.has(mimetype)) {
    return true;
  }
  switch (mimetype) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    case "image/png":
      return buffer.length >= 8 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71 && buffer[4] === 13 && buffer[5] === 10 && buffer[6] === 26 && buffer[7] === 10;
    case "image/gif":
      return buffer.length >= 6 && buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 56 && (buffer[4] === 55 || buffer[4] === 57) && buffer[5] === 97;
    case "image/webp":
      return buffer.length >= 12 && buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80;
    case "application/pdf":
      return buffer.length >= 5 && buffer[0] === 37 && buffer[1] === 80 && buffer[2] === 68 && buffer[3] === 70 && buffer[4] === 45;
    default:
      return false;
  }
}
function readMagicBytes(filePath, length = 12) {
  const buffer = Buffer.alloc(length);
  const fd = fs4.openSync(filePath, "r");
  try {
    const bytesRead = fs4.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs4.closeSync(fd);
  }
}
var storage = multer2.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir2);
  },
  filename: (_req, file, cb) => {
    const name = crypto5.randomBytes(16).toString("hex");
    cb(null, buildStoredFilename(file.mimetype, name));
  }
});
var upload = multer2({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUploadMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato"));
    }
  }
});
function handleUploadError(err, _req, res, next) {
  if (!err) {
    return next();
  }
  if (err instanceof multer2.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File troppo grande (max 10MB)" });
    }
    return res.status(400).json({ error: "Errore nel caricamento del file" });
  }
  return res.status(415).json({ error: "Tipo di file non supportato" });
}
async function verifyFamilyMembership(userId, familyId) {
  const [membership] = await db.select().from(familyMembers).where(and23(eq28(familyMembers.userId, userId), eq28(familyMembers.familyId, familyId))).limit(1);
  return membership;
}
async function requireFamilyMembership(req, res, next) {
  try {
    const userId = req.user.userId;
    const familyId = req.params.familyId;
    const membership = await verifyFamilyMembership(userId, familyId);
    if (!membership) {
      return res.status(403).json({ error: "Non fai parte di questa famiglia" });
    }
    next();
  } catch (error) {
    logger.error("Errore verifica membership chat", { error: String(error) });
    res.status(500).json({ error: "Errore nella verifica di appartenenza" });
  }
}
router20.get("/:familyId/messages", async (req, res) => {
  try {
    const userId = req.user.userId;
    const familyId = req.params.familyId;
    const cursor = req.query.cursor;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const membership = await verifyFamilyMembership(userId, familyId);
    if (!membership) {
      return res.status(403).json({ error: "Non fai parte di questa famiglia" });
    }
    const blockedIds = await getBlockRelatedUserIds(userId, familyId);
    const blockFilter = applyBlockedFilter(chatMessages.userId, blockedIds);
    const conditions = [eq28(chatMessages.familyId, familyId)];
    if (cursor) {
      conditions.push(lt3(chatMessages.createdAt, new Date(cursor)));
    }
    if (blockFilter) {
      conditions.push(blockFilter);
    }
    const messages = await db.select({
      id: chatMessages.id,
      familyId: chatMessages.familyId,
      userId: chatMessages.userId,
      messageType: chatMessages.messageType,
      content: chatMessages.content,
      fileUrl: chatMessages.fileUrl,
      fileName: chatMessages.fileName,
      fileMimeType: chatMessages.fileMimeType,
      fileSize: chatMessages.fileSize,
      createdAt: chatMessages.createdAt,
      userName: users.name,
      userAvatar: users.avatarUrl
    }).from(chatMessages).innerJoin(users, eq28(chatMessages.userId, users.id)).where(and23(...conditions)).orderBy(desc7(chatMessages.createdAt)).limit(limit + 1);
    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;
    const enriched = result.map((m) => withAbsoluteFileUrl(m, req));
    res.json({
      messages: enriched,
      hasMore,
      nextCursor: hasMore ? result[result.length - 1].createdAt.toISOString() : null
    });
  } catch (error) {
    logger.error("Errore GET messaggi chat", { error: String(error) });
    res.status(500).json({ error: "Errore nel recupero dei messaggi" });
  }
});
router20.post("/:familyId/messages", async (req, res) => {
  try {
    const userId = req.user.userId;
    const familyId = req.params.familyId;
    const { content } = req.body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "Il messaggio non pu\xF2 essere vuoto" });
    }
    if (content.length > 2e3) {
      return res.status(400).json({ error: "Messaggio troppo lungo (max 2000 caratteri)" });
    }
    const membership = await verifyFamilyMembership(userId, familyId);
    if (!membership) {
      return res.status(403).json({ error: "Non fai parte di questa famiglia" });
    }
    const gate = await reserveBaseSlot(userId, familyId, "chat-message");
    if (gate.status === "limited") {
      return res.status(429).json(baseLimitBody(gate));
    }
    const [user] = await db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq28(users.id, userId)).limit(1);
    const [message] = await db.insert(chatMessages).values({
      familyId,
      userId,
      messageType: "text",
      content: content.trim()
    }).returning();
    const fullMessage = {
      ...message,
      userName: user.name,
      userAvatar: user.avatarUrl
    };
    const enrichedMessage = withAbsoluteFileUrl(fullMessage, req);
    await broadcastChatMessageToFamily(familyId, userId, "chat:new_message", enrichedMessage);
    void (async () => {
      const excluded = new Set(await getBlockRelatedUserIds(userId, familyId));
      excluded.add(userId);
      const preview = content.trim().length > 120 ? content.trim().slice(0, 117) + "..." : content.trim();
      await sendPushToFamily(familyId, {
        title: `Nuovo messaggio da ${user.name}`,
        body: preview,
        data: { route: "/(tabs)/chat" }
      }, { excludeUserIds: excluded });
    })().catch(() => {
    });
    res.status(201).json(enrichedMessage);
  } catch (error) {
    logger.error("Errore POST messaggio chat", { error: String(error) });
    res.status(500).json({ error: "Errore nell'invio del messaggio" });
  }
});
router20.post("/:familyId/upload", requireFamilyMembership, upload.single("file"), handleUploadError, async (req, res) => {
  try {
    const userId = req.user.userId;
    const familyId = req.params.familyId;
    const caption = req.body.caption;
    if (!req.file) {
      return res.status(400).json({ error: "Nessun file caricato" });
    }
    const magic = readMagicBytes(req.file.path);
    if (!verifyMagicBytes(magic, req.file.mimetype)) {
      const spoofedPath = req.file.path;
      fs4.unlink(spoofedPath, (unlinkErr) => {
        if (unlinkErr) {
          logger.warn("Chat upload: impossibile cancellare file spoofato", {
            path: spoofedPath,
            error: String(unlinkErr)
          });
        }
      });
      return res.status(415).json({ error: "Il contenuto del file non corrisponde al tipo dichiarato" });
    }
    const gate = await reserveBaseSlot(userId, familyId, "chat-message");
    if (gate.status === "limited") {
      if (req.file) fs4.unlink(req.file.path, () => {
      });
      return res.status(429).json(baseLimitBody(gate));
    }
    const [user] = await db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq28(users.id, userId)).limit(1);
    if (process.env.NODE_ENV === "production" && !process.env.STORAGE_MODE && !uploadWarningLogged) {
      logger.warn("UPLOAD_STORAGE_WARNING", {
        tag: "UPLOAD_STORAGE_WARNING",
        msg: "Using local disk uploads in production is fragile. Consider S3/R2/Supabase by setting STORAGE_MODE env var."
      });
      uploadWarningLogged = true;
    }
    const stored = await chatFileStorage.save(req.file, req);
    const isImage = stored.mime.startsWith("image/");
    const [message] = await db.insert(chatMessages).values({
      familyId,
      userId,
      messageType: isImage ? "image" : "file",
      content: caption?.trim() || null,
      fileUrl: stored.url,
      fileName: stored.filename,
      fileMimeType: stored.mime,
      fileSize: stored.size
    }).returning();
    const fullMessage = {
      ...message,
      userName: user.name,
      userAvatar: user.avatarUrl
    };
    const enrichedUpload = withAbsoluteFileUrl(fullMessage, req);
    await broadcastChatMessageToFamily(familyId, userId, "chat:new_message", enrichedUpload);
    void (async () => {
      const excluded = new Set(await getBlockRelatedUserIds(userId, familyId));
      excluded.add(userId);
      await sendPushToFamily(familyId, {
        title: `Nuovo messaggio da ${user.name}`,
        body: isImage ? "\u{1F4F7} Ha inviato una foto" : "\u{1F4CE} Ha inviato un file",
        data: { route: "/(tabs)/chat" }
      }, { excludeUserIds: excluded });
    })().catch(() => {
    });
    res.status(201).json(enrichedUpload);
  } catch (error) {
    logger.error("Errore POST upload chat", { error: String(error) });
    if (req.file) {
      fs4.unlink(req.file.path, () => {
      });
    }
    res.status(500).json({ error: "Errore nel caricamento del file" });
  }
});
router20.delete("/:familyId/messages/:messageId", async (req, res) => {
  try {
    const userId = req.user.userId;
    const familyId = req.params.familyId;
    const messageId = req.params.messageId;
    const [message] = await db.select().from(chatMessages).where(and23(eq28(chatMessages.id, messageId), eq28(chatMessages.familyId, familyId))).limit(1);
    if (!message) {
      return res.status(404).json({ error: "Messaggio non trovato" });
    }
    if (message.userId !== userId) {
      return res.status(403).json({ error: "Puoi eliminare solo i tuoi messaggi" });
    }
    if (message.fileUrl) {
      const safePath = resolveSafeUploadPath2(message.fileUrl);
      if (safePath) {
        fs4.unlink(safePath, () => {
        });
      } else {
        logger.warn("Chat delete: file path fuori da uploadsDir, skip unlink", {
          messageId,
          fileUrl: message.fileUrl
        });
      }
    }
    await db.delete(chatMessages).where(eq28(chatMessages.id, messageId));
    await broadcastChatMessageToFamily(familyId, message.userId, "chat:message_deleted", { messageId });
    res.json({ success: true });
  } catch (error) {
    logger.error("Errore DELETE messaggio chat", { error: String(error) });
    res.status(500).json({ error: "Errore nell'eliminazione del messaggio" });
  }
});
var chat_default = router20;

// server/routes/notifications.ts
init_db();
init_schema();
init_auth();
init_logger();
import { Router as Router21 } from "express";
import { z as z17 } from "zod";
import { eq as eq29, and as and24 } from "drizzle-orm";
var router21 = Router21();
var registerSchema = z17.object({
  token: z17.string().min(1, "Token mancante"),
  platform: z17.string().optional()
});
router21.post("/register", authenticate, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi" }
      });
    }
    const { token, platform } = parsed.data;
    const userId = req.user.userId;
    await db.insert(pushTokens).values({ userId, token, platform }).onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId, platform, updatedAt: /* @__PURE__ */ new Date() }
    });
    res.status(201).json({ message: "Token registrato" });
  } catch (error) {
    logger.error("Register push token error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella registrazione del token" } });
  }
});
router21.post("/unregister", authenticate, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi" }
      });
    }
    await db.delete(pushTokens).where(and24(eq29(pushTokens.token, parsed.data.token), eq29(pushTokens.userId, req.user.userId)));
    res.json({ message: "Token rimosso" });
  } catch (error) {
    logger.error("Unregister push token error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione del token" } });
  }
});
var notifications_default = router21;

// server/routes/bills.ts
init_db();
init_schema();
init_http_params();
init_family();
init_entitlements();
init_websocket();
init_logger();
import { Router as Router22 } from "express";
import multer3 from "multer";
import path5 from "path";
import crypto6 from "crypto";
import fs5 from "fs";
import { z as z18 } from "zod";
import { eq as eq30, and as and25, desc as desc8, isNull as isNull5 } from "drizzle-orm";

// server/lib/bills.ts
var FREE_MAX_ACTIVE_BILLS = 5;
function toDateString(d) {
  return d.toISOString().slice(0, 10);
}
function parseDateString(s) {
  return /* @__PURE__ */ new Date(`${s}T00:00:00.000Z`);
}
function addDays(dateStr, days) {
  const d = parseDateString(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}
function computeBillStatus(bill, now = /* @__PURE__ */ new Date()) {
  if (bill.status === "pagata") return "pagata";
  const today = toDateString(now);
  if (bill.dueDate < today) return "scaduta";
  return "da_pagare";
}
var REMINDER_LABELS = {
  "7_days": "Scade tra 7 giorni",
  "3_days": "Scade tra 3 giorni",
  due_day: "Scade oggi",
  overdue: "Bolletta scaduta"
};
function computeBillReminders(params) {
  const { dueDate, remindersEnabled, plan } = params;
  const now = params.now ?? /* @__PURE__ */ new Date();
  if (!remindersEnabled) return [];
  if (params.status === "pagata") return [];
  const types = plan === "premium" ? ["7_days", "3_days", "due_day", "overdue"] : ["due_day", "overdue"];
  const today = toDateString(now);
  return types.map((type) => {
    let date2;
    switch (type) {
      case "7_days":
        date2 = addDays(dueDate, -7);
        break;
      case "3_days":
        date2 = addDays(dueDate, -3);
        break;
      case "due_day":
        date2 = dueDate;
        break;
      case "overdue":
        date2 = addDays(dueDate, 1);
        break;
    }
    return {
      type,
      date: date2,
      label: REMINDER_LABELS[type],
      isDue: date2 <= today
    };
  });
}
function canCreateBill(plan, activeBillCount) {
  if (plan === "premium") return true;
  return activeBillCount < FREE_MAX_ACTIVE_BILLS;
}
function splitEqually(totalAmount, memberCount) {
  if (memberCount <= 0) return [];
  const totalCents = Math.round(totalAmount * 100);
  const base = Math.floor(totalCents / memberCount);
  const remainder = totalCents - base * memberCount;
  const shares = [];
  for (let i = 0; i < memberCount; i++) {
    const cents = base + (i < remainder ? 1 : 0);
    shares.push((cents / 100).toFixed(2));
  }
  return shares;
}

// server/routes/bills.ts
var router22 = Router22();
var BILL_ALLOWED_MIMES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf"
]);
var uploadsDir3 = path5.resolve("uploads");
if (!fs5.existsSync(uploadsDir3)) {
  fs5.mkdirSync(uploadsDir3, { recursive: true });
}
var storage2 = multer3.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir3),
  filename: (_req, file, cb) => {
    const name = crypto6.randomBytes(16).toString("hex");
    cb(null, buildStoredFilename(file.mimetype, name));
  }
});
var upload2 = multer3({
  storage: storage2,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (BILL_ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato"));
    }
  }
});
function handleUploadError2(err, _req, res, next) {
  if (!err) return next();
  if (err instanceof multer3.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "File troppo grande (max 10MB)" } });
    }
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message: "Errore nel caricamento del file" } });
  }
  return res.status(415).json({ error: { code: "UNSUPPORTED_TYPE", message: "Tipo di file non supportato (solo PDF o immagini)" } });
}
function requirePremium() {
  return async (req, res, next) => {
    const familyId = getParam(req, "familyId");
    const premium = await isPremium(familyId);
    if (!premium) {
      return res.status(403).json({
        error: { code: "PREMIUM_REQUIRED", message: "Questa funzione \xE8 disponibile solo con Premium" }
      });
    }
    next();
  };
}
function isRealIsoDate2(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}
var customReminderDatesSchema = z18.array(z18.string().refine(isRealIsoDate2, "Data promemoria non valida (AAAA-MM-GG)")).max(20, "Massimo 20 date promemoria").optional().transform((v) => v ? Array.from(new Set(v)).sort() : v);
var createBillSchema = z18.object({
  title: z18.string().min(1, "Il titolo \xE8 obbligatorio"),
  provider: z18.string().optional(),
  category: z18.enum(["luce", "gas", "acqua", "telefono", "scuola", "assicurazione", "tasse", "altro"]).optional().default("altro"),
  amount: z18.number().nonnegative("Importo non valido"),
  dueDate: z18.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data scadenza non valida (AAAA-MM-GG)").optional(),
  holder: z18.string().optional(),
  assignedTo: z18.string().uuid().optional().nullable(),
  notes: z18.string().optional(),
  remindersEnabled: z18.boolean().optional().default(true),
  // Date promemoria personalizzate (ISO AAAA-MM-GG): deduplicate e ordinate.
  customReminderDates: customReminderDatesSchema,
  // Bolletta registrata come GIÀ pagata: paid=true + data di pagamento.
  // In questo caso la scadenza è facoltativa (default: la data di pagamento).
  paid: z18.boolean().optional().default(false),
  paidAt: z18.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data pagamento non valida (AAAA-MM-GG)").optional()
}).superRefine((data, ctx) => {
  if (!data.paid && !data.dueDate) {
    ctx.addIssue({ code: z18.ZodIssueCode.custom, path: ["dueDate"], message: "Data scadenza obbligatoria" });
  }
  if (data.paid && !data.paidAt && !data.dueDate) {
    ctx.addIssue({ code: z18.ZodIssueCode.custom, path: ["paidAt"], message: "Data pagamento obbligatoria" });
  }
});
var updateBillSchema = z18.object({
  title: z18.string().min(1).optional(),
  provider: z18.string().nullable().optional(),
  category: z18.enum(["luce", "gas", "acqua", "telefono", "scuola", "assicurazione", "tasse", "altro"]).optional(),
  amount: z18.number().nonnegative().optional(),
  dueDate: z18.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  holder: z18.string().nullable().optional(),
  assignedTo: z18.string().uuid().nullable().optional(),
  notes: z18.string().nullable().optional(),
  remindersEnabled: z18.boolean().optional(),
  customReminderDates: customReminderDatesSchema,
  // Data di pagamento (AAAA-MM-GG): modificabile solo per bollette già pagate.
  paidAt: z18.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).strict();
async function assignedToBelongsToFamily(assignedTo, familyId) {
  const [row] = await db.select({ id: familyMembers.id }).from(familyMembers).where(and25(eq30(familyMembers.id, assignedTo), eq30(familyMembers.familyId, familyId))).limit(1);
  return !!row;
}
var BILL_EVENT_COLOR = "#F59E0B";
function billEventFields(bill) {
  const parts = [];
  if (bill.provider) parts.push(`Fornitore: ${bill.provider}`);
  parts.push(`Importo: \u20AC${bill.amount}`);
  parts.push("Creato automaticamente dalla sezione Bollette");
  return {
    title: `Scadenza bolletta: ${bill.title}`,
    description: parts.join("\n"),
    date: bill.dueDate,
    time: null,
    endTime: null,
    allDay: true,
    category: "other",
    color: BILL_EVENT_COLOR
  };
}
async function createBillCalendarEvent(bill, userId) {
  try {
    const [event] = await db.insert(calendarEvents).values({
      familyId: bill.familyId,
      ...billEventFields(bill),
      createdBy: userId
    }).returning();
    const [updated] = await db.update(bills).set({ calendarEventId: event.id }).where(and25(eq30(bills.id, bill.id), isNull5(bills.calendarEventId))).returning();
    if (!updated) {
      await db.delete(calendarEvents).where(eq30(calendarEvents.id, event.id));
      const [current] = await db.select().from(bills).where(eq30(bills.id, bill.id)).limit(1);
      return current ?? bill;
    }
    broadcastToFamily(bill.familyId, "event_created", event);
    return updated;
  } catch (error) {
    logger.warn("Bill calendar sync (create) failed", { billId: bill.id, error: String(error) });
    return bill;
  }
}
async function updateBillCalendarEvent(bill) {
  if (!bill.calendarEventId) return;
  try {
    const [event] = await db.update(calendarEvents).set({ ...billEventFields(bill), updatedAt: /* @__PURE__ */ new Date() }).where(and25(eq30(calendarEvents.id, bill.calendarEventId), eq30(calendarEvents.familyId, bill.familyId))).returning();
    if (event) broadcastToFamily(bill.familyId, "event_updated", event);
  } catch (error) {
    logger.warn("Bill calendar sync (update) failed", { billId: bill.id, error: String(error) });
  }
}
async function deleteBillCalendarEvent(familyId, billId, calendarEventId) {
  if (!calendarEventId) return;
  try {
    await db.delete(calendarEvents).where(and25(eq30(calendarEvents.id, calendarEventId), eq30(calendarEvents.familyId, familyId)));
    await db.update(bills).set({ calendarEventId: null }).where(eq30(bills.id, billId));
    broadcastToFamily(familyId, "event_deleted", { eventId: calendarEventId });
  } catch (error) {
    logger.warn("Bill calendar sync (delete) failed", { billId, error: String(error) });
  }
}
function serializeBill(bill) {
  return {
    ...bill,
    computedStatus: computeBillStatus({ status: bill.status, dueDate: bill.dueDate })
  };
}
router22.get("/:familyId", requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const rows = await db.select().from(bills).where(eq30(bills.familyId, familyId)).orderBy(desc8(bills.dueDate));
    res.json(rows.map(serializeBill));
  } catch (error) {
    logger.error("Get bills error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero delle bollette" } });
  }
});
router22.get("/:familyId/reminders", requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const plan = await getPlanForFamily(familyId);
    const rows = await db.select().from(bills).where(and25(eq30(bills.familyId, familyId), eq30(bills.status, "da_pagare")));
    const reminders = rows.flatMap(
      (bill) => computeBillReminders({
        dueDate: bill.dueDate,
        remindersEnabled: bill.remindersEnabled,
        plan,
        status: bill.status
      }).map((r) => ({
        billId: bill.id,
        billTitle: bill.title,
        dueDate: bill.dueDate,
        ...r
      }))
    );
    res.json(reminders);
  } catch (error) {
    logger.error("Get bill reminders error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero dei promemoria" } });
  }
});
router22.get("/:familyId/:billId", requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const billId = getParam(req, "billId");
    const [bill] = await db.select().from(bills).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId))).limit(1);
    if (!bill) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bolletta non trovata" } });
    }
    const plan = await getPlanForFamily(familyId);
    const isPremiumPlan = plan === "premium";
    const splits = isPremiumPlan ? await db.select({
      id: billSplits.id,
      memberId: billSplits.memberId,
      amount: billSplits.amount,
      isPaid: billSplits.isPaid,
      memberName: familyMembers.nickname,
      memberColor: familyMembers.color
    }).from(billSplits).leftJoin(familyMembers, eq30(billSplits.memberId, familyMembers.id)).where(eq30(billSplits.billId, billId)) : [];
    const attachments = isPremiumPlan ? await db.select().from(billAttachments).where(eq30(billAttachments.billId, billId)).orderBy(desc8(billAttachments.createdAt)) : [];
    const history = plan === "premium" ? await db.select({
      id: billPaymentHistory.id,
      amount: billPaymentHistory.amount,
      note: billPaymentHistory.note,
      paidAt: billPaymentHistory.paidAt,
      paidByUserId: billPaymentHistory.paidByUserId,
      paidByName: users.name
    }).from(billPaymentHistory).leftJoin(users, eq30(billPaymentHistory.paidByUserId, users.id)).where(eq30(billPaymentHistory.billId, billId)).orderBy(desc8(billPaymentHistory.paidAt)) : [];
    const reminders = computeBillReminders({
      dueDate: bill.dueDate,
      remindersEnabled: bill.remindersEnabled,
      plan,
      status: bill.status
    });
    res.json({ ...serializeBill(bill), splits, attachments, history, reminders });
  } catch (error) {
    logger.error("Get bill detail error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero della bolletta" } });
  }
});
router22.post("/:familyId", requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const parsed = createBillSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    if (parsed.data.assignedTo) {
      const ok = await assignedToBelongsToFamily(parsed.data.assignedTo, familyId);
      if (!ok) {
        return res.status(400).json({
          error: { code: "INVALID_MEMBER", message: "Il membro assegnato non appartiene a questa famiglia" }
        });
      }
    }
    const createAsPaid = parsed.data.paid === true;
    if (!createAsPaid) {
      const plan = await getPlanForFamily(familyId);
      const activeRows = await db.select({ id: bills.id }).from(bills).where(and25(eq30(bills.familyId, familyId), eq30(bills.status, "da_pagare")));
      if (!canCreateBill(plan, activeRows.length)) {
        return res.status(403).json({
          error: {
            code: "FREE_LIMIT_REACHED",
            message: "Hai raggiunto il limite di 5 bollette attive del piano Free. Passa a Premium per bollette illimitate."
          }
        });
      }
    }
    const paidDateStr = parsed.data.paidAt ?? parsed.data.dueDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const dueDate = parsed.data.dueDate ?? paidDateStr;
    const [created] = await db.insert(bills).values({
      familyId,
      title: parsed.data.title,
      provider: parsed.data.provider,
      category: parsed.data.category,
      amount: parsed.data.amount.toFixed(2),
      dueDate,
      holder: parsed.data.holder,
      assignedTo: parsed.data.assignedTo ?? null,
      notes: parsed.data.notes,
      remindersEnabled: parsed.data.remindersEnabled,
      customReminderDates: parsed.data.customReminderDates ?? [],
      createdBy: req.user.userId,
      ...createAsPaid ? {
        status: "pagata",
        paidAt: /* @__PURE__ */ new Date(`${paidDateStr}T12:00:00.000Z`),
        paidBy: req.user.userId
      } : {}
    }).returning();
    let bill = created;
    if (createAsPaid) {
      await db.insert(billPaymentHistory).values({
        billId: created.id,
        familyId,
        paidByUserId: req.user.userId,
        amount: parsed.data.amount.toFixed(2)
      });
    } else {
      bill = await createBillCalendarEvent(created, req.user.userId);
    }
    broadcastToFamily(familyId, "bill_created", serializeBill(bill));
    res.status(201).json(serializeBill(bill));
  } catch (error) {
    logger.error("Create bill error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della bolletta" } });
  }
});
router22.put("/:familyId/:billId", requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const billId = getParam(req, "billId");
    const parsed = updateBillSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    if (parsed.data.assignedTo) {
      const ok = await assignedToBelongsToFamily(parsed.data.assignedTo, familyId);
      if (!ok) {
        return res.status(400).json({
          error: { code: "INVALID_MEMBER", message: "Il membro assegnato non appartiene a questa famiglia" }
        });
      }
    }
    const { paidAt: paidAtInput, ...updateFields } = parsed.data;
    const updateData = { ...updateFields, updatedAt: /* @__PURE__ */ new Date() };
    if (parsed.data.amount !== void 0) {
      updateData.amount = parsed.data.amount.toFixed(2);
    }
    if (paidAtInput !== void 0) {
      const [current] = await db.select({ status: bills.status }).from(bills).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId))).limit(1);
      if (!current) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bolletta non trovata" } });
      }
      if (current.status !== "pagata") {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "La data di pagamento \xE8 modificabile solo per bollette pagate" }
        });
      }
      updateData.paidAt = /* @__PURE__ */ new Date(`${paidAtInput}T12:00:00.000Z`);
    }
    const whereConditions = [eq30(bills.id, billId), eq30(bills.familyId, familyId)];
    if (paidAtInput !== void 0) {
      whereConditions.push(eq30(bills.status, "pagata"));
    }
    let [bill] = await db.update(bills).set(updateData).where(and25(...whereConditions)).returning();
    if (!bill) {
      if (paidAtInput !== void 0) {
        return res.status(409).json({
          error: { code: "CONFLICT", message: "La bolletta non \xE8 pi\xF9 pagata: riprova dopo aver aggiornato la pagina" }
        });
      }
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bolletta non trovata" } });
    }
    if (bill.calendarEventId) {
      await updateBillCalendarEvent(bill);
    } else if (bill.status === "da_pagare") {
      bill = await createBillCalendarEvent(bill, req.user.userId);
    }
    broadcastToFamily(familyId, "bill_updated", serializeBill(bill));
    res.json(serializeBill(bill));
  } catch (error) {
    logger.error("Update bill error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento della bolletta" } });
  }
});
var paySchema = z18.object({
  paid: z18.boolean().optional().default(true),
  amount: z18.number().nonnegative().optional(),
  note: z18.string().optional()
}).strict();
router22.patch("/:familyId/:billId/pay", requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const billId = getParam(req, "billId");
    const parsed = paySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const [existing] = await db.select().from(bills).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId))).limit(1);
    if (!existing) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bolletta non trovata" } });
    }
    const markPaid = parsed.data.paid;
    if (!markPaid && existing.status !== "da_pagare") {
      const plan = await getPlanForFamily(familyId);
      const activeRows = await db.select({ id: bills.id }).from(bills).where(and25(eq30(bills.familyId, familyId), eq30(bills.status, "da_pagare")));
      if (!canCreateBill(plan, activeRows.length)) {
        return res.status(403).json({
          error: {
            code: "FREE_LIMIT_REACHED",
            message: "Hai raggiunto il limite di 5 bollette attive del piano Free. Passa a Premium per bollette illimitate."
          }
        });
      }
    }
    let [bill] = await db.update(bills).set({
      status: markPaid ? "pagata" : "da_pagare",
      paidAt: markPaid ? /* @__PURE__ */ new Date() : null,
      paidBy: markPaid ? req.user.userId : null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId))).returning();
    if (markPaid) {
      await deleteBillCalendarEvent(familyId, billId, bill.calendarEventId);
      bill = { ...bill, calendarEventId: null };
    } else if (!bill.calendarEventId) {
      bill = await createBillCalendarEvent(bill, req.user.userId);
    }
    if (markPaid) {
      await db.insert(billPaymentHistory).values({
        billId,
        familyId,
        paidByUserId: req.user.userId,
        amount: (parsed.data.amount ?? Number(existing.amount)).toFixed(2),
        note: parsed.data.note
      });
    }
    broadcastToFamily(familyId, "bill_updated", serializeBill(bill));
    res.json(serializeBill(bill));
  } catch (error) {
    logger.error("Pay bill error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel segnare la bolletta come pagata" } });
  }
});
router22.delete("/:familyId/:billId", requireFamilyMember(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const billId = getParam(req, "billId");
    const [bill] = await db.select({ id: bills.id, calendarEventId: bills.calendarEventId }).from(bills).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId))).limit(1);
    if (!bill) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bolletta non trovata" } });
    }
    await deleteBillCalendarEvent(familyId, billId, bill.calendarEventId);
    const attachments = await db.select({ fileUrl: billAttachments.fileUrl }).from(billAttachments).where(eq30(billAttachments.billId, billId));
    for (const att of attachments) {
      const safePath = resolveSafeUploadPath2(att.fileUrl);
      if (safePath) fs5.unlink(safePath, () => {
      });
    }
    await db.delete(bills).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId)));
    broadcastToFamily(familyId, "bill_deleted", { billId });
    res.json({ message: "Bolletta eliminata" });
  } catch (error) {
    logger.error("Delete bill error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione della bolletta" } });
  }
});
var splitsSchema = z18.object({
  type: z18.enum(["equal", "custom"]),
  memberIds: z18.array(z18.string().uuid()).optional(),
  splits: z18.array(z18.object({ memberId: z18.string().uuid(), amount: z18.number().nonnegative() })).optional()
}).strict();
router22.put("/:familyId/:billId/splits", requireFamilyMember(), requirePremium(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const billId = getParam(req, "billId");
    const parsed = splitsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors }
      });
    }
    const [bill] = await db.select().from(bills).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId))).limit(1);
    if (!bill) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bolletta non trovata" } });
    }
    let rows = [];
    if (parsed.data.type === "equal") {
      const memberIds = parsed.data.memberIds ?? [];
      if (memberIds.length === 0) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Seleziona almeno un membro" } });
      }
      const shares = splitEqually(Number(bill.amount), memberIds.length);
      rows = memberIds.map((memberId, i) => ({ memberId, amount: shares[i] }));
    } else {
      const splits2 = parsed.data.splits ?? [];
      if (splits2.length === 0) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Inserisci almeno una quota" } });
      }
      const splitTotal = splits2.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(splitTotal - Number(bill.amount)) > 0.01) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "La somma delle quote deve essere uguale all\u2019importo della bolletta"
          }
        });
      }
      rows = splits2.map((s) => ({ memberId: s.memberId, amount: s.amount.toFixed(2) }));
    }
    const familyMemberRows = await db.select({ id: familyMembers.id }).from(familyMembers).where(eq30(familyMembers.familyId, familyId));
    const validIds = new Set(familyMemberRows.map((m) => m.id));
    if (rows.some((r) => !validIds.has(r.memberId))) {
      return res.status(400).json({ error: { code: "INVALID_MEMBER", message: "Membro non valido per questa famiglia" } });
    }
    await db.delete(billSplits).where(eq30(billSplits.billId, billId));
    if (rows.length > 0) {
      await db.insert(billSplits).values(rows.map((r) => ({ billId, memberId: r.memberId, amount: r.amount })));
    }
    await db.update(bills).set({ splitType: parsed.data.type, updatedAt: /* @__PURE__ */ new Date() }).where(eq30(bills.id, billId));
    const splits = await db.select({
      id: billSplits.id,
      memberId: billSplits.memberId,
      amount: billSplits.amount,
      isPaid: billSplits.isPaid,
      memberName: familyMembers.nickname,
      memberColor: familyMembers.color
    }).from(billSplits).leftJoin(familyMembers, eq30(billSplits.memberId, familyMembers.id)).where(eq30(billSplits.billId, billId));
    broadcastToFamily(familyId, "bill_updated", { billId });
    res.json({ splitType: parsed.data.type, splits });
  } catch (error) {
    logger.error("Set bill splits error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella ripartizione" } });
  }
});
router22.post(
  "/:familyId/:billId/attachments",
  requireFamilyMember(),
  requirePremium(),
  upload2.single("file"),
  handleUploadError2,
  async (req, res) => {
    try {
      const familyId = getParam(req, "familyId");
      const billId = getParam(req, "billId");
      const kindRaw = req.body.kind || "document";
      const kind = kindRaw === "receipt" ? "receipt" : "document";
      if (!req.file) {
        return res.status(400).json({ error: { code: "NO_FILE", message: "Nessun file caricato" } });
      }
      const [bill] = await db.select({ id: bills.id }).from(bills).where(and25(eq30(bills.id, billId), eq30(bills.familyId, familyId))).limit(1);
      if (!bill) {
        fs5.unlink(req.file.path, () => {
        });
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bolletta non trovata" } });
      }
      const magic = readMagicBytes(req.file.path);
      if (!verifyMagicBytes(magic, req.file.mimetype)) {
        fs5.unlink(req.file.path, () => {
        });
        return res.status(415).json({ error: { code: "CONTENT_MISMATCH", message: "Il contenuto del file non corrisponde al tipo dichiarato" } });
      }
      const [attachment] = await db.insert(billAttachments).values({
        billId,
        familyId,
        kind,
        fileUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        fileMimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user.userId
      }).returning();
      broadcastToFamily(familyId, "bill_updated", { billId });
      res.status(201).json(attachment);
    } catch (error) {
      logger.error("Upload bill attachment error", { error: String(error) });
      if (req.file) fs5.unlink(req.file.path, () => {
      });
      res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel caricamento del file" } });
    }
  }
);
router22.delete("/:familyId/:billId/attachments/:attachmentId", requireFamilyMember(), requirePremium(), async (req, res) => {
  try {
    const familyId = getParam(req, "familyId");
    const billId = getParam(req, "billId");
    const attachmentId = getParam(req, "attachmentId");
    const [attachment] = await db.select().from(billAttachments).where(and25(eq30(billAttachments.id, attachmentId), eq30(billAttachments.billId, billId), eq30(billAttachments.familyId, familyId))).limit(1);
    if (!attachment) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Allegato non trovato" } });
    }
    const safePath = resolveSafeUploadPath2(attachment.fileUrl);
    if (safePath) fs5.unlink(safePath, () => {
    });
    await db.delete(billAttachments).where(eq30(billAttachments.id, attachmentId));
    broadcastToFamily(familyId, "bill_updated", { billId });
    res.json({ message: "Allegato eliminato" });
  } catch (error) {
    logger.error("Delete bill attachment error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione dell'allegato" } });
  }
});
var bills_default = router22;

// server/routes/support.ts
init_db();
init_schema();
import { Router as Router23 } from "express";
import rateLimit5 from "express-rate-limit";
import { z as z19 } from "zod";
import { eq as eq31 } from "drizzle-orm";
init_config();
init_logger();
var router23 = Router23();
var supportLimiter = rateLimit5({
  windowMs: 60 * 60 * 1e3,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // La route è sempre autenticata: limitiamo per utente, non per IP, così
  // utenti dietro lo stesso NAT/proxy (deployment autoscale) non si bloccano a vicenda.
  keyGenerator: (req) => req.user?.userId ?? "unauthenticated",
  message: { error: { code: "RATE_LIMITED", message: "Hai inviato troppe richieste. Riprova pi\xF9 tardi." } }
});
var supportSchema = z19.object({
  subject: z19.string().trim().min(3, "Inserisci un oggetto").max(150),
  message: z19.string().trim().min(10, "Scrivi un messaggio pi\xF9 dettagliato").max(5e3)
});
router23.post("/", supportLimiter, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: { code: "NO_TOKEN", message: "Non autenticato" } });
  }
  const parsed = supportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dati non validi" }
    });
  }
  if (!isSupportEmailConfigured() && config.isProduction) {
    return res.status(503).json({
      error: { code: "SUPPORT_NOT_CONFIGURED", message: "Il servizio di assistenza non \xE8 disponibile al momento." }
    });
  }
  try {
    const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq31(users.id, req.user.userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    await sendSupportRequestEmail({
      userName: user.name,
      userEmail: user.email,
      subject: parsed.data.subject,
      message: parsed.data.message
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("Support request send failed", { error: String(error) });
    return res.status(502).json({
      error: { code: "SUPPORT_SEND_FAILED", message: "Non siamo riusciti a inviare la richiesta. Riprova tra poco." }
    });
  }
});
var support_default = router23;

// server/routes/profile.ts
init_db();
init_schema();
init_logger();
import { Router as Router24 } from "express";
import multer4 from "multer";
import path6 from "path";
import crypto7 from "crypto";
import fs6 from "fs";
import { eq as eq32 } from "drizzle-orm";
var router24 = Router24();
var avatarsDir = path6.resolve("uploads/avatars");
if (!fs6.existsSync(avatarsDir)) {
  fs6.mkdirSync(avatarsDir, { recursive: true });
}
var MAX_AVATAR_BYTES = 5 * 1024 * 1024;
var storage3 = multer4.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (_req, file, cb) => cb(null, buildStoredFilename(file.mimetype, crypto7.randomBytes(16).toString("hex")))
});
var upload3 = multer4({
  storage: storage3,
  limits: { fileSize: MAX_AVATAR_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") && isAllowedUploadMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato"));
    }
  }
});
function handleUploadError3(err, _req, res, next) {
  if (!err) return next();
  if (err instanceof multer4.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "Immagine troppo grande (max 5MB)" } });
    }
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message: "Errore nel caricamento dell'immagine" } });
  }
  return res.status(415).json({ error: { code: "UNSUPPORTED_TYPE", message: "Tipo di file non supportato" } });
}
router24.post(
  "/avatar",
  (req, res, next) => {
    upload3.single("file")(req, res, (err) => handleUploadError3(err, req, res, next));
  },
  async (req, res) => {
    const file = req.file;
    try {
      if (!file) {
        return res.status(400).json({ error: { code: "NO_FILE", message: "Nessuna immagine ricevuta" } });
      }
      const magic = readMagicBytes(file.path);
      if (!verifyMagicBytes(magic, file.mimetype)) {
        await deleteUploadFiles([`/uploads/avatars/${file.filename}`]);
        return res.status(415).json({ error: { code: "INVALID_IMAGE", message: "Il file non \xE8 un'immagine valida" } });
      }
      const newUrl = `/uploads/avatars/${file.filename}`;
      const [prev] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq32(users.id, req.user.userId)).limit(1);
      await db.update(users).set({ avatarUrl: newUrl }).where(eq32(users.id, req.user.userId));
      if (prev?.avatarUrl && prev.avatarUrl.startsWith("/uploads/avatars/")) {
        await deleteUploadFiles([prev.avatarUrl]);
      }
      res.json({ avatarUrl: newUrl });
    } catch (error) {
      if (file) await deleteUploadFiles([`/uploads/avatars/${file.filename}`]);
      logger.error("Avatar upload error", { error: String(error) });
      res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel salvataggio della foto" } });
    }
  }
);
router24.delete("/avatar", async (req, res) => {
  try {
    const [prev] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq32(users.id, req.user.userId)).limit(1);
    await db.update(users).set({ avatarUrl: null }).where(eq32(users.id, req.user.userId));
    if (prev?.avatarUrl && prev.avatarUrl.startsWith("/uploads/avatars/")) {
      await deleteUploadFiles([prev.avatarUrl]);
    }
    res.json({ ok: true });
  } catch (error) {
    logger.error("Avatar delete error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione della foto" } });
  }
});
var profile_default = router24;

// server/routes/test-analytics.ts
init_db();
init_schema();
import { Router as Router25 } from "express";
import { and as and27, count, desc as desc9, eq as eq34, gte as gte7, sql as sql13 } from "drizzle-orm";
import { z as z20 } from "zod";

// server/lib/demo-account.ts
init_db();
init_schema();
import bcrypt5 from "bcryptjs";
import { and as and26, eq as eq33, inArray as inArray5, sql as sql12 } from "drizzle-orm";
var DEMO_ENABLED = process.env.ENABLE_DEMO_ACCOUNT === "true";
var DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL || "demo@familysync.eu";
var DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || "";
var DEMO_NAME = "Account Demo";
var [demoLocal, demoDomain] = DEMO_EMAIL.split("@");
var PARTNER_EMAIL = `${demoLocal}.partner@${demoDomain || "familysync.eu"}`;
var PARTNER_NAME = "Giulia (Demo)";
var DEMO_FAMILY_NAME = "Famiglia Demo";
var iso = (d) => d.toISOString().slice(0, 10);
var addDays2 = (n) => {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + n);
  return d;
};
var addDaysFrom = (base, n) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};
var mondayOfThisWeek = () => {
  const d = /* @__PURE__ */ new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
async function cleanup(tx) {
  const existing = await tx.select({ id: users.id }).from(users).where(inArray5(users.email, [DEMO_EMAIL, PARTNER_EMAIL]));
  if (existing.length === 0) return { users: 0, families: 0 };
  const userIds = existing.map((u) => u.id);
  const demoFamilies = await tx.selectDistinct({ familyId: families.id }).from(families).innerJoin(familyMembers, eq33(familyMembers.familyId, families.id)).where(
    and26(
      eq33(families.name, DEMO_FAMILY_NAME),
      inArray5(familyMembers.userId, userIds)
    )
  );
  const familyIds = demoFamilies.map((f) => f.familyId);
  if (familyIds.length > 0) {
    await tx.delete(families).where(inArray5(families.id, familyIds));
  }
  await tx.delete(users).where(inArray5(users.id, userIds));
  return { users: userIds.length, families: familyIds.length };
}
async function ensureDemoAccount(opts = {}) {
  if (!DEMO_ENABLED) {
    return { created: false, skipped: true, reason: "disabled", email: DEMO_EMAIL };
  }
  if (!DEMO_PASSWORD) {
    return { created: false, skipped: true, reason: "missing_password", email: DEMO_EMAIL };
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql12`SELECT pg_advisory_xact_lock(hashtext('familysync:demo-account'))`);
    const [present] = await tx.select({ id: users.id }).from(users).where(eq33(users.email, DEMO_EMAIL)).limit(1);
    if (present && !opts.reset) {
      return { created: false, skipped: false, email: DEMO_EMAIL };
    }
    await cleanup(tx);
    const now = /* @__PURE__ */ new Date();
    const passwordHash = await bcrypt5.hash(DEMO_PASSWORD, 10);
    const partnerHash = await bcrypt5.hash(DEMO_PASSWORD, 10);
    const [demoUser] = await tx.insert(users).values({
      email: DEMO_EMAIL,
      passwordHash,
      name: DEMO_NAME,
      emailVerified: true,
      termsAcceptedAt: now,
      aiFeaturesEnabled: true
    }).returning();
    const [partnerUser] = await tx.insert(users).values({
      email: PARTNER_EMAIL,
      passwordHash: partnerHash,
      name: PARTNER_NAME,
      emailVerified: true,
      termsAcceptedAt: now,
      aiFeaturesEnabled: true
    }).returning();
    const [family] = await tx.insert(families).values({
      name: DEMO_FAMILY_NAME,
      colorTheme: "#6366F1",
      subscriptionStatus: "premium"
      // mirror; la verita e in entitlements
    }).returning();
    const [adminMember] = await tx.insert(familyMembers).values({
      familyId: family.id,
      userId: demoUser.id,
      role: "admin",
      nickname: "Mamma",
      color: "#6366F1",
      points: 120
    }).returning();
    const [partnerMember] = await tx.insert(familyMembers).values({
      familyId: family.id,
      userId: partnerUser.id,
      role: "adult",
      nickname: "Pap\xE0",
      color: "#22C55E",
      points: 80
    }).returning();
    await tx.insert(entitlements).values({
      familyId: family.id,
      userId: demoUser.id,
      platform: "revenuecat",
      productId: "familysync_premium_yearly",
      status: "active",
      expiresAt: null
      // permanente per la revisione
    });
    await tx.insert(calendarEvents).values([
      {
        familyId: family.id,
        title: "Visita dal pediatra",
        description: "Controllo annuale",
        date: iso(addDays2(1)),
        time: "09:30",
        endTime: "10:15",
        category: "health",
        location: "Studio Dott. Bianchi",
        color: "#EF4444",
        memberId: adminMember.id,
        createdBy: demoUser.id
      },
      {
        familyId: family.id,
        title: "Allenamento calcio",
        date: iso(addDays2(2)),
        time: "17:00",
        endTime: "18:30",
        category: "sport",
        location: "Campo comunale",
        color: "#22C55E",
        memberId: partnerMember.id,
        createdBy: partnerUser.id
      },
      {
        familyId: family.id,
        title: "Cena con i nonni",
        date: iso(addDays2(4)),
        allDay: true,
        category: "family",
        color: "#6366F1",
        createdBy: demoUser.id
      }
    ]);
    const [list] = await tx.insert(shoppingLists).values({
      familyId: family.id,
      name: "Spesa settimanale",
      icon: "cart",
      createdBy: demoUser.id
    }).returning();
    await tx.insert(shoppingItems).values([
      { listId: list.id, name: "Latte", quantity: "2", unit: "l", category: "food", createdBy: demoUser.id, position: 0 },
      { listId: list.id, name: "Pane", quantity: "1", unit: "kg", category: "food", createdBy: demoUser.id, position: 1 },
      { listId: list.id, name: "Mele", quantity: "6", unit: "pcs", category: "food", createdBy: partnerUser.id, position: 2 },
      {
        listId: list.id,
        name: "Detersivo",
        quantity: "1",
        category: "home",
        isChecked: true,
        checkedBy: demoUser.id,
        checkedAt: now,
        createdBy: demoUser.id,
        position: 3
      }
    ]);
    await tx.insert(chores).values([
      {
        familyId: family.id,
        title: "Portare fuori la spazzatura",
        description: "Ogni sera",
        difficulty: 1,
        points: 10,
        estimatedMinutes: 5,
        assignedTo: partnerMember.id,
        dueDate: addDays2(1),
        createdBy: demoUser.id
      },
      {
        familyId: family.id,
        title: "Lavare i piatti",
        difficulty: 2,
        points: 15,
        estimatedMinutes: 20,
        assignedTo: adminMember.id,
        isCompleted: true,
        completedAt: now,
        completedBy: demoUser.id,
        createdBy: demoUser.id
      },
      {
        familyId: family.id,
        title: "Annaffiare le piante",
        difficulty: 1,
        points: 5,
        estimatedMinutes: 10,
        assignedTo: partnerMember.id,
        createdBy: partnerUser.id
      }
    ]);
    const [recipe] = await tx.insert(recipes).values({
      familyId: family.id,
      createdByUserId: demoUser.id,
      source: "manual",
      title: "Pasta al pomodoro",
      description: "Un classico veloce e amato da tutta la famiglia.",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      steps: [
        "Porta a ebollizione una pentola di acqua salata.",
        "Cuoci la pasta secondo i tempi indicati.",
        "Scalda il sugo di pomodoro con un filo d'olio e basilico.",
        "Scola la pasta e condisci con il sugo. Servi caldo."
      ],
      tags: { cuisine: "italiana", difficulty: "facile" }
    }).returning();
    await tx.insert(recipeIngredients).values([
      { recipeId: recipe.id, name: "Pasta", quantity: "320", unit: "g", normalizedName: "pasta", category: "food" },
      { recipeId: recipe.id, name: "Passata di pomodoro", quantity: "400", unit: "ml", normalizedName: "passata di pomodoro", category: "food" },
      { recipeId: recipe.id, name: "Basilico", unit: "to_taste", normalizedName: "basilico", category: "food" },
      { recipeId: recipe.id, name: "Olio d'oliva", quantity: "2", unit: "tbsp", normalizedName: "olio d'oliva", category: "food" }
    ]);
    const weekStart = mondayOfThisWeek();
    const [plan] = await tx.insert(mealPlans).values({
      familyId: family.id,
      createdByUserId: demoUser.id,
      weekStartDate: iso(weekStart),
      title: "Menu della settimana",
      preferences: { mealsPerDay: 3 }
    }).returning();
    await tx.insert(mealPlanItems).values([
      { mealPlanId: plan.id, date: iso(weekStart), mealType: "lunch", recipeId: recipe.id, servings: 4 },
      { mealPlanId: plan.id, date: iso(weekStart), mealType: "dinner", titleOverride: "Minestrone di verdure", servings: 4 },
      { mealPlanId: plan.id, date: iso(addDaysFrom(weekStart, 1)), mealType: "dinner", titleOverride: "Pollo al forno con patate", servings: 4 }
    ]);
    const [billLuce] = await tx.insert(bills).values({
      familyId: family.id,
      title: "Bolletta luce - Giugno",
      provider: "Enel Energia",
      category: "luce",
      amount: "84.50",
      dueDate: iso(addDays2(7)),
      holder: "Account Demo",
      assignedTo: adminMember.id,
      status: "da_pagare",
      splitType: "equal",
      remindersEnabled: true,
      createdBy: demoUser.id
    }).returning();
    await tx.insert(billSplits).values([
      { billId: billLuce.id, memberId: adminMember.id, amount: "42.25" },
      { billId: billLuce.id, memberId: partnerMember.id, amount: "42.25" }
    ]);
    await tx.insert(bills).values({
      familyId: family.id,
      title: "Abbonamento internet - Maggio",
      provider: "TIM",
      category: "telefono",
      amount: "29.90",
      dueDate: iso(addDays2(-10)),
      status: "pagata",
      paidAt: addDays2(-12),
      paidBy: demoUser.id,
      remindersEnabled: true,
      createdBy: demoUser.id
    });
    await tx.insert(chatMessages).values([
      {
        familyId: family.id,
        userId: partnerUser.id,
        messageType: "text",
        content: "Ciao! Ho aggiunto la spesa per stasera \u{1F6D2}",
        createdAt: addDays2(-1)
      },
      {
        familyId: family.id,
        userId: demoUser.id,
        messageType: "text",
        content: "Perfetto, passo io al supermercato \u{1F44D}",
        createdAt: addDays2(-1)
      }
    ]);
    await tx.insert(aiInsights).values({
      familyId: family.id,
      type: "shopping_suggestion",
      title: "Potrebbe servirti: caff\xE8",
      description: "In base agli acquisti recenti, il caff\xE8 di solito si esaurisce in questo periodo.",
      actionData: { item: "Caff\xE8" }
    });
    return { created: true, skipped: false, email: DEMO_EMAIL };
  });
}

// server/lib/test-analytics.ts
init_db();
init_schema();
import { lt as lt4 } from "drizzle-orm";
var RETENTION_DAYS = 30;
var ALLOWED_EVENTS = /* @__PURE__ */ new Set([
  "app_open",
  "login_success",
  "screen_view",
  "feature_used",
  "api_error",
  "premium_status_checked",
  "ai_toggle_changed",
  "delete_account_opened",
  "legal_page_opened"
]);
var ALLOWED_PLATFORMS = /* @__PURE__ */ new Set(["web", "android", "ios"]);
var ALLOWED_METADATA_KEYS = /* @__PURE__ */ new Set(["feature", "status", "code", "route", "source", "enabled", "durationMs"]);
var METADATA_VALUE_MAX_LEN = 100;
function isTestAnalyticsEnabled() {
  return process.env.ENABLE_TEST_ANALYTICS === "true";
}
function isAppOwner(email) {
  if (!email) return false;
  const raw = process.env.APP_OWNER_EMAILS || "";
  const allow = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}
function sanitizeMetadata(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, METADATA_VALUE_MAX_LEN);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}
function sanitizePlatform(input) {
  if (typeof input !== "string") return null;
  const p = input.toLowerCase().trim();
  return ALLOWED_PLATFORMS.has(p) ? p : null;
}
async function pruneOldEvents() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1e3);
  await db.delete(testAnalyticsEvents).where(lt4(testAnalyticsEvents.createdAt, cutoff));
}

// server/routes/test-analytics.ts
function requireTestAnalyticsFlag(req, res, next) {
  if (!isTestAnalyticsEnabled()) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Non trovato" } });
  }
  next();
}
async function requireAppOwner(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }
    const [record] = await db.select({ email: users.email, emailVerified: users.emailVerified }).from(users).where(eq34(users.id, req.user.userId)).limit(1);
    if (!record) {
      return res.status(401).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    if (!record.emailVerified || !isAppOwner(record.email)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Accesso riservato al proprietario dell'app" } });
    }
    next();
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica dei permessi" } });
  }
}
var eventSchema = z20.object({
  eventName: z20.string().min(1).max(50),
  platform: z20.unknown().optional(),
  appVersion: z20.string().max(20).optional(),
  screen: z20.string().max(100).optional(),
  familyId: z20.string().uuid().optional(),
  metadata: z20.unknown().optional()
});
var testAnalyticsEventsRouter = Router25();
testAnalyticsEventsRouter.post("/events", requireTestAnalyticsFlag, async (req, res) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success || !ALLOWED_EVENTS.has(parsed.data.eventName)) {
      return res.status(400).json({ error: { code: "INVALID_EVENT", message: "Evento non valido" } });
    }
    const data = parsed.data;
    await db.insert(testAnalyticsEvents).values({
      eventName: data.eventName,
      userId: req.user?.userId ?? null,
      familyId: data.familyId ?? null,
      platform: sanitizePlatform(data.platform),
      appVersion: data.appVersion?.slice(0, 20) ?? null,
      screen: data.screen?.slice(0, 100) ?? null,
      metadata: sanitizeMetadata(data.metadata),
      isDemoAccount: (req.user?.email ?? "").toLowerCase() === DEMO_EMAIL.toLowerCase()
    });
    if (Math.random() < 0.02) {
      pruneOldEvents().catch(() => {
      });
    }
    return res.status(201).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: false });
  }
});
var testAnalyticsAdminRouter = Router25();
testAnalyticsAdminRouter.use(requireTestAnalyticsFlag, requireAppOwner);
function periodStart(req) {
  const period = typeof req.query.period === "string" ? req.query.period : "7d";
  const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
  if (period === "today") {
    const d = /* @__PURE__ */ new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
}
testAnalyticsAdminRouter.get("/access", (_req, res) => {
  res.json({ allowed: true });
});
testAnalyticsAdminRouter.get("/summary", async (req, res) => {
  try {
    await pruneOldEvents();
    const since = periodStart(req);
    const where = gte7(testAnalyticsEvents.createdAt, since);
    const todayStart = /* @__PURE__ */ new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [
      [totals],
      [activeToday],
      [appOpens],
      topScreens,
      topFeatures,
      byPlatform,
      byEvent,
      recentErrors,
      [lastEvent],
      [demoUsage]
    ] = await Promise.all([
      db.select({ total: count() }).from(testAnalyticsEvents).where(where),
      db.select({ n: sql13`count(distinct ${testAnalyticsEvents.userId})` }).from(testAnalyticsEvents).where(gte7(testAnalyticsEvents.createdAt, todayStart)),
      db.select({ n: count() }).from(testAnalyticsEvents).where(and27(where, eq34(testAnalyticsEvents.eventName, "app_open"))),
      db.select({ screen: testAnalyticsEvents.screen, n: count() }).from(testAnalyticsEvents).where(and27(where, eq34(testAnalyticsEvents.eventName, "screen_view"))).groupBy(testAnalyticsEvents.screen).orderBy(desc9(count())).limit(10),
      db.select({ feature: sql13`${testAnalyticsEvents.metadata}->>'feature'`, n: count() }).from(testAnalyticsEvents).where(and27(where, eq34(testAnalyticsEvents.eventName, "feature_used"))).groupBy(sql13`${testAnalyticsEvents.metadata}->>'feature'`).orderBy(desc9(count())).limit(10),
      db.select({ platform: testAnalyticsEvents.platform, n: count() }).from(testAnalyticsEvents).where(where).groupBy(testAnalyticsEvents.platform).orderBy(desc9(count())),
      db.select({ eventName: testAnalyticsEvents.eventName, n: count() }).from(testAnalyticsEvents).where(where).groupBy(testAnalyticsEvents.eventName).orderBy(desc9(count())),
      db.select().from(testAnalyticsEvents).where(and27(where, eq34(testAnalyticsEvents.eventName, "api_error"))).orderBy(desc9(testAnalyticsEvents.createdAt)).limit(20),
      db.select().from(testAnalyticsEvents).orderBy(desc9(testAnalyticsEvents.createdAt)).limit(1),
      db.select({ n: count() }).from(testAnalyticsEvents).where(and27(where, eq34(testAnalyticsEvents.isDemoAccount, true)))
    ]);
    res.json({
      period: typeof req.query.period === "string" ? req.query.period : "7d",
      totalEvents: totals?.total ?? 0,
      activeUsersToday: Number(activeToday?.n ?? 0),
      appOpens: appOpens?.n ?? 0,
      topScreens,
      topFeatures,
      byPlatform,
      byEvent,
      recentErrors,
      lastEvent: lastEvent ?? null,
      demoAccountEvents: demoUsage?.n ?? 0,
      appVersions: await db.select({ appVersion: testAnalyticsEvents.appVersion, n: count() }).from(testAnalyticsEvents).where(where).groupBy(testAnalyticsEvents.appVersion).orderBy(desc9(count()))
    });
  } catch {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel calcolo del riepilogo" } });
  }
});
testAnalyticsAdminRouter.get("/users", async (req, res) => {
  try {
    const since = periodStart(req);
    const where = gte7(testAnalyticsEvents.createdAt, since);
    const perUser = await db.select({
      userId: testAnalyticsEvents.userId,
      email: users.email,
      isDemoAccount: testAnalyticsEvents.isDemoAccount,
      totalEvents: count(),
      lastSeen: sql13`max(${testAnalyticsEvents.createdAt})`
    }).from(testAnalyticsEvents).leftJoin(users, eq34(users.id, testAnalyticsEvents.userId)).where(where).groupBy(testAnalyticsEvents.userId, users.email, testAnalyticsEvents.isDemoAccount).orderBy(desc9(sql13`max(${testAnalyticsEvents.createdAt})`)).limit(50);
    const screensRows = await db.select({
      userId: testAnalyticsEvents.userId,
      screen: testAnalyticsEvents.screen,
      n: count()
    }).from(testAnalyticsEvents).where(and27(where, eq34(testAnalyticsEvents.eventName, "screen_view"))).groupBy(testAnalyticsEvents.userId, testAnalyticsEvents.screen).orderBy(desc9(count()));
    const screensByUser = /* @__PURE__ */ new Map();
    for (const row of screensRows) {
      const key = row.userId ?? "unknown";
      if (!screensByUser.has(key)) screensByUser.set(key, []);
      const list = screensByUser.get(key);
      if (list.length < 20) list.push({ screen: row.screen, n: row.n });
    }
    res.json({
      users: perUser.map((u) => ({
        userId: u.userId,
        email: u.email ?? "(utente eliminato)",
        isDemoAccount: u.isDemoAccount,
        totalEvents: u.totalEvents,
        lastSeen: u.lastSeen,
        screens: screensByUser.get(u.userId ?? "unknown") ?? []
      }))
    });
  } catch {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel dettaglio per utente" } });
  }
});
testAnalyticsAdminRouter.get("/events", async (req, res) => {
  try {
    const since = periodStart(req);
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const eventName = typeof req.query.eventName === "string" && ALLOWED_EVENTS.has(req.query.eventName) ? req.query.eventName : null;
    const where = eventName ? and27(gte7(testAnalyticsEvents.createdAt, since), eq34(testAnalyticsEvents.eventName, eventName)) : gte7(testAnalyticsEvents.createdAt, since);
    const events = await db.select().from(testAnalyticsEvents).where(where).orderBy(desc9(testAnalyticsEvents.createdAt)).limit(limit);
    res.json({ events });
  } catch {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero degli eventi" } });
  }
});
testAnalyticsAdminRouter.delete("/", async (_req, res) => {
  try {
    await db.delete(testAnalyticsEvents);
    res.json({ ok: true, message: "Analytics di test svuotate" });
  } catch {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la cancellazione" } });
  }
});

// server/routes.ts
async function registerRoutes(app2) {
  app2.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  const limiter = rateLimit6({
    windowMs: 15 * 60 * 1e3,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/api/health"
  });
  app2.use("/api", limiter);
  app2.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app2.use("/api/auth", auth_default);
  app2.use("/api/invites", inviteLimiter, invites_default);
  app2.use("/api/join-link", joinLinkLimiter, join_link_default);
  app2.use("/api/families", authenticate, requireEmailVerified, families_default);
  app2.use("/api/calendar", authenticate, requireEmailVerified, calendar_default);
  app2.use("/api/shopping", authenticate, requireEmailVerified, shopping_default);
  app2.use("/api/chores", authenticate, requireEmailVerified, chores_default);
  app2.use("/api/rewards", authenticate, requireEmailVerified, rewards_default);
  app2.use("/api/pantry", authenticate, requireEmailVerified, pantry_default);
  app2.use("/api/expenses", authenticate, requireEmailVerified, expenses_default);
  app2.use("/api/ai", authenticate, requireEmailVerified, ai_default);
  app2.use("/api/payments", authenticate, requireEmailVerified, payments_default);
  app2.post("/api/purchases/webhook", handleRevenueCatWebhook);
  app2.use("/api/purchases", authenticate, requireEmailVerified, purchases_default);
  app2.use("/api/moderation", authenticate, requireEmailVerified, moderation_default);
  app2.use("/api/recipes", authenticate, requireEmailVerified, recipes_default);
  app2.use("/api/meal-plans", authenticate, requireEmailVerified, meal_plans_default);
  app2.use("/api/chat", authenticate, requireEmailVerified, chat_default);
  app2.use("/api/notifications", authenticate, requireEmailVerified, notifications_default);
  app2.use("/api/bills", authenticate, requireEmailVerified, bills_default);
  app2.use("/api/support", authenticate, requireEmailVerified, support_default);
  app2.use("/api/profile", authenticate, requireEmailVerified, profile_default);
  app2.use("/api/test-analytics", requireTestAnalyticsFlag, authenticate, testAnalyticsEventsRouter);
  app2.use("/api/admin/test-analytics", requireTestAnalyticsFlag, authenticate, testAnalyticsAdminRouter);
  app2.use("/calendar-feed", calendar_feed_default);
  app2.use("/uploads/recipe-images", express.static("uploads/recipe-images", { maxAge: "30d", immutable: true }));
  app2.use("/uploads/avatars", express.static("uploads/avatars", { maxAge: "7d" }));
  app2.use("/uploads", authenticateMedia, requireEmailVerified, express.static("uploads"));
  app2.use("/legal", legal_default);
  app2.use("/privacy", (req, res, next) => {
    req.url = "/privacy";
    legal_default(req, res, next);
  });
  app2.use("/terms", (req, res, next) => {
    req.url = "/terms";
    legal_default(req, res, next);
  });
  app2.use("/help", help_default);
  const httpServer = createServer(app2);
  const io2 = setupWebSocket(httpServer);
  app2.set("io", io2);
  return httpServer;
}

// server/index.ts
init_config();
init_logger();
init_entitlements();
import * as fs7 from "fs";
import * as path7 from "path";

// server/lib/tester-accounts.ts
init_db();
init_schema();
import crypto8 from "crypto";
import bcrypt6 from "bcryptjs";
import { and as and28, eq as eq35, inArray as inArray6, sql as sql14 } from "drizzle-orm";
var TESTER_COUNT = 100;
var TESTER_TRIAL_DAYS = 15;
var TESTER_ENABLED = process.env.ENABLE_TESTER_ACCOUNTS === "true";
var DEMO_EMAIL2 = process.env.DEMO_ACCOUNT_EMAIL || "demo@familysync.eu";
var DOMAIN = DEMO_EMAIL2.split("@")[1] || "familysync.eu";
var TESTER_FAMILY_NAME = "Famiglia Tester";
var TESTER_PRODUCT_ID = "familysync_tester_trial";
var PASSWORD_SEED = process.env.TESTER_PASSWORD_SEED || process.env.SESSION_SECRET || "";
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var pad2 = (n) => String(n).padStart(2, "0");
function derivePassword(index2) {
  const digest = crypto8.createHmac("sha256", PASSWORD_SEED).update(`familysync-tester-account-${index2}`).digest();
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += ALPHABET[digest[i] % ALPHABET.length];
    if (i % 4 === 3 && i !== 15) out += "-";
  }
  return out;
}
function getTesterCredentials() {
  const list = [];
  for (let i = 1; i <= TESTER_COUNT; i++) {
    list.push({
      index: i,
      email: `tester${pad2(i)}@${DOMAIN}`,
      name: `Tester ${pad2(i)}`,
      password: derivePassword(i)
    });
  }
  return list;
}
async function cleanup2(tx, emails) {
  const existing = await tx.select({ id: users.id }).from(users).where(inArray6(users.email, emails));
  if (existing.length === 0) return;
  const userIds = existing.map((u) => u.id);
  const testerFamilies = await tx.selectDistinct({ familyId: families.id }).from(families).innerJoin(familyMembers, eq35(familyMembers.familyId, families.id)).where(and28(eq35(families.name, TESTER_FAMILY_NAME), inArray6(familyMembers.userId, userIds)));
  const familyIds = testerFamilies.map((f) => f.familyId);
  if (familyIds.length > 0) {
    await tx.delete(families).where(inArray6(families.id, familyIds));
  }
  await tx.delete(users).where(inArray6(users.id, userIds));
}
async function createTester(tx, cred, now) {
  const passwordHash = await bcrypt6.hash(cred.password, 10);
  const [user] = await tx.insert(users).values({
    email: cred.email,
    passwordHash,
    name: cred.name,
    emailVerified: true,
    // tutte le /api richiedono email verificata
    termsAcceptedAt: now,
    aiFeaturesEnabled: true
  }).returning();
  const [family] = await tx.insert(families).values({
    name: TESTER_FAMILY_NAME,
    colorTheme: "#6366F1",
    subscriptionStatus: "free"
    // la prova non è ancora partita (pending)
  }).returning();
  await tx.insert(familyMembers).values({
    familyId: family.id,
    userId: user.id,
    role: "admin",
    nickname: cred.name,
    color: "#6366F1"
  });
  await tx.insert(entitlements).values({
    familyId: family.id,
    userId: user.id,
    platform: "revenuecat",
    productId: TESTER_PRODUCT_ID,
    status: "pending",
    expiresAt: null,
    trialDays: TESTER_TRIAL_DAYS
  });
}
async function ensureTesterAccounts(opts = {}) {
  if (!TESTER_ENABLED && !opts.force) {
    return { created: 0, skipped: true, reason: "disabled" };
  }
  if (!PASSWORD_SEED) {
    return { created: 0, skipped: true, reason: "missing_secret" };
  }
  const creds = getTesterCredentials();
  const emails = creds.map((c) => c.email);
  return db.transaction(async (tx) => {
    await tx.execute(sql14`SELECT pg_advisory_xact_lock(hashtext('familysync:tester-accounts'))`);
    if (opts.reset) {
      await cleanup2(tx, emails);
    }
    const now = /* @__PURE__ */ new Date();
    const present = await tx.select({ email: users.email }).from(users).where(inArray6(users.email, emails));
    const existing = new Set(present.map((r) => r.email));
    let created = 0;
    for (const cred of creds) {
      if (existing.has(cred.email)) continue;
      await createTester(tx, cred, now);
      created += 1;
    }
    return { created, skipped: false };
  });
}

// server/lib/vip-account.ts
init_db();
init_schema();
import bcrypt7 from "bcryptjs";
import { and as and29, eq as eq36, sql as sql15 } from "drizzle-orm";
var VIP_EMAIL = (process.env.VIP_ACCOUNT_EMAIL || "").trim().toLowerCase();
var VIP_PASSWORD = process.env.VIP_ACCOUNT_PASSWORD || "";
var VIP_PRODUCT_ID = "familysync_vip_lifetime";
async function ensureVipAccount() {
  if (!VIP_EMAIL) {
    return { created: false, upgraded: false, skipped: true, reason: "disabled", email: "" };
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql15`SELECT pg_advisory_xact_lock(hashtext('familysync:vip-account'))`);
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq36(users.email, VIP_EMAIL)).limit(1);
    let userId;
    let familyId = null;
    let created = false;
    if (existing) {
      userId = existing.id;
      const memberships = await tx.select({ familyId: familyMembers.familyId, role: familyMembers.role }).from(familyMembers).where(eq36(familyMembers.userId, userId));
      const admin = memberships.find((m) => m.role === "admin");
      familyId = (admin || memberships[0])?.familyId ?? null;
      await tx.update(users).set({ emailVerified: true }).where(eq36(users.id, userId));
    } else {
      if (!VIP_PASSWORD) {
        return { created: false, upgraded: false, skipped: true, reason: "missing_password", email: VIP_EMAIL };
      }
      const now = /* @__PURE__ */ new Date();
      const passwordHash = await bcrypt7.hash(VIP_PASSWORD, 10);
      const [user] = await tx.insert(users).values({
        email: VIP_EMAIL,
        passwordHash,
        name: "Francesco",
        emailVerified: true,
        termsAcceptedAt: now,
        aiFeaturesEnabled: true
      }).returning();
      userId = user.id;
      created = true;
    }
    if (!familyId) {
      const [family] = await tx.insert(families).values({
        name: "La Mia Famiglia",
        colorTheme: "#6366F1",
        subscriptionStatus: "premium"
        // mirror; la verità è in entitlements
      }).returning();
      familyId = family.id;
      await tx.insert(familyMembers).values({
        familyId,
        userId,
        role: "admin",
        color: "#6366F1"
      });
    }
    const [ent] = await tx.select({ id: entitlements.id, status: entitlements.status, expiresAt: entitlements.expiresAt }).from(entitlements).where(and29(eq36(entitlements.familyId, familyId), eq36(entitlements.productId, VIP_PRODUCT_ID))).limit(1);
    let upgraded = false;
    if (!ent) {
      await tx.insert(entitlements).values({
        familyId,
        userId,
        platform: "revenuecat",
        productId: VIP_PRODUCT_ID,
        status: "active",
        expiresAt: null
        // permanente, nessuna scadenza
      });
      upgraded = true;
    } else if (ent.status !== "active" || ent.expiresAt !== null) {
      await tx.update(entitlements).set({ status: "active", expiresAt: null }).where(eq36(entitlements.id, ent.id));
      upgraded = true;
    }
    await tx.update(families).set({ subscriptionStatus: "premium" }).where(eq36(families.id, familyId));
    return { created, upgraded, skipped: false, email: VIP_EMAIL };
  });
}

// server/index.ts
var app = express2();
app.set("trust proxy", 1);
var log = console.log;
async function initStripe() {
  if (!config.premiumPaymentsEnabled) {
    logger.info("Premium payments disabled (set PREMIUM_PAYMENTS_ENABLED=true to enable)");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not found, skipping Stripe initialization");
    return;
  }
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const { getStripeSync: getStripeSync2 } = await Promise.resolve().then(() => (init_stripeClient(), stripeClient_exports));
    const { WebhookHandlers: WebhookHandlers2 } = await Promise.resolve().then(() => (init_webhookHandlers(), webhookHandlers_exports));
    logger.info("Initializing Stripe schema...");
    await runMigrations({
      databaseUrl
    });
    logger.info("Stripe schema ready");
    const stripeSync2 = await getStripeSync2();
    logger.info("Setting up managed webhook...");
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    try {
      const result = await stripeSync2.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result?.webhook) {
        logger.info(`Webhook configured: ${result.webhook.url}`);
      } else {
        logger.info("Webhook setup completed");
      }
    } catch (webhookError) {
      logger.warn("Webhook setup skipped (sandbox mode or not configured)");
    }
    logger.info("Syncing Stripe data...");
    stripeSync2.syncBackfill().then(() => {
      logger.info("Stripe data synced");
    }).catch((err) => {
      logger.error("Error syncing Stripe data", { error: String(err) });
    });
  } catch (error) {
    logger.error("Failed to initialize Stripe", { error: String(error) });
  }
}
function setupStripeWebhook(app2) {
  if (!config.premiumPaymentsEnabled) return;
  app2.post(
    "/api/stripe/webhook",
    express2.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        return res.status(400).json({ error: "Missing stripe-signature" });
      }
      try {
        const { WebhookHandlers: WebhookHandlers2 } = await Promise.resolve().then(() => (init_webhookHandlers(), webhookHandlers_exports));
        const sig = Array.isArray(signature) ? signature[0] : signature;
        if (!Buffer.isBuffer(req.body)) {
          logger.error("STRIPE WEBHOOK ERROR: req.body is not a Buffer");
          return res.status(500).json({ error: "Webhook processing error" });
        }
        await WebhookHandlers2.processWebhook(req.body, sig);
        res.status(200).json({ received: true });
      } catch (error) {
        logger.error("Webhook error", { error: error.message });
        res.status(400).json({ error: "Webhook processing error" });
      }
    }
  );
}
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    const isMobileApp = !origin;
    if (isMobileApp) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    } else if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express2.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express2.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const requestId = generateRequestId();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const start = Date.now();
    const reqPath = req.path;
    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;
      const duration = Date.now() - start;
      logger.info(`${req.method} ${reqPath} ${res.statusCode}`, {
        requestId,
        durationMs: duration
      });
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path7.resolve(process.cwd(), "app.json");
    const appJsonContent = fs7.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path7.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs7.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs7.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path7.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs7.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  const webBuildDir = path7.resolve(process.cwd(), "web-build");
  const hasWebBuild = fs7.existsSync(path7.join(webBuildDir, "index.html"));
  log(
    hasWebBuild ? "Serving Expo web app from web-build with native manifest routing" : "Serving static Expo files with dynamic manifest routing"
  );
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path === "/" || req.path === "/manifest") {
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") {
        return serveExpoManifest(platform, res);
      }
    }
    if (!hasWebBuild && req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.get("/download/store-assets.zip", (_req, res) => {
    const zipPath = path7.resolve(process.cwd(), "store-assets.zip");
    if (fs7.existsSync(zipPath)) {
      res.setHeader("Content-Disposition", "attachment; filename=store-assets.zip");
      res.setHeader("Content-Type", "application/zip");
      res.sendFile(zipPath);
    } else {
      res.status(404).send("File not found");
    }
  });
  if (hasWebBuild) {
    app2.use(express2.static(webBuildDir));
  }
  app2.use("/assets", express2.static(path7.resolve(process.cwd(), "assets")));
  app2.use(express2.static(path7.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupWebAppFallback(app2) {
  const webIndexPath = path7.resolve(process.cwd(), "web-build", "index.html");
  if (!fs7.existsSync(webIndexPath)) {
    return;
  }
  app2.use((req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    if (!req.accepts("html")) {
      return next();
    }
    res.sendFile(webIndexPath);
  });
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  await initStripe();
  setupCors(app);
  setupStripeWebhook(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupWebAppFallback(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
      void seedOwnerEntitlements().then((n) => {
        if (n > 0) log(`owner premium reconciled for ${n} family(ies)`);
      }).catch((err) => log(`owner premium seed failed: ${String(err)}`));
      void ensureDemoAccount().then((r) => {
        if (r.created) log(`demo account created (${r.email})`);
        else if (r.skipped && r.reason === "missing_password")
          log(`demo account skipped: set DEMO_ACCOUNT_PASSWORD to enable`);
      }).catch((err) => log(`demo account seed failed: ${String(err)}`));
      void ensureTesterAccounts().then((r) => {
        if (r.created > 0) log(`tester accounts created: ${r.created}`);
        else if (r.skipped && r.reason === "missing_secret")
          log(`tester accounts skipped: SESSION_SECRET non impostato`);
      }).catch((err) => log(`tester accounts seed failed: ${String(err)}`));
      void ensureVipAccount().then((r) => {
        if (r.created) log(`vip account created (${r.email})`);
        else if (r.upgraded) log(`vip account upgraded to permanent premium (${r.email})`);
        else if (r.skipped && r.reason === "missing_password")
          log(`vip account skipped: set VIP_ACCOUNT_PASSWORD to enable`);
      }).catch((err) => log(`vip account seed failed: ${String(err)}`));
    }
  );
})();

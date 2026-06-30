/**
 * Account DEMO per i revisori di App Store / Google Play.
 *
 * `ensureDemoAccount()` garantisce l'esistenza di un account demo con email gia
 * verificata, Premium attivo e dati di esempio in TUTTE le funzioni dell'app.
 * Viene chiamata all'avvio del server (vedi server/index.ts), quindi funziona
 * anche nel database di PRODUZIONE dopo il deploy.
 *
 * - Modalita "ensure" (default): crea l'account SOLO se manca. Non resetta nulla
 *   se esiste gia, cosi eventuali modifiche dei revisori non vengono perse al
 *   riavvio.
 * - Modalita "reset": rigenera l'account demo da zero (usata dallo script CLI
 *   scripts/seed-demo-account.ts).
 *
 * La pulizia tocca SOLO la famiglia demo (riconosciuta dal nome marker) a cui
 * appartengono gli utenti demo: mai famiglie o dati reali, anche se un account
 * demo fosse stato aggiunto a una famiglia vera. Tutto gira in transazione.
 */
import bcrypt from "bcryptjs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  families,
  familyMembers,
  calendarEvents,
  shoppingLists,
  shoppingItems,
  chores,
  recipes,
  recipeIngredients,
  mealPlans,
  mealPlanItems,
  bills,
  billSplits,
  chatMessages,
  aiInsights,
  entitlements,
} from "../../shared/schema";

// Configurazione da variabili ambiente / secret: NESSUNA password hardcoded.
// La creazione avviene SOLO se ENABLE_DEMO_ACCOUNT === "true" (vedi sotto).
export const DEMO_ENABLED = process.env.ENABLE_DEMO_ACCOUNT === "true";
export const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL || "demo@familysync.eu";
// La password vive in un secret: nessun valore di default nel codice.
export const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || "";
const DEMO_NAME = "Account Demo";

// Partner demo: solo dati dimostrativi (non un login per i revisori).
// Email derivata da quella demo per restare coerente con il dominio.
const [demoLocal, demoDomain] = DEMO_EMAIL.split("@");
const PARTNER_EMAIL = `${demoLocal}.partner@${demoDomain || "familysync.eu"}`;
const PARTNER_NAME = "Giulia (Demo)";

// Marker deterministico: la pulizia cancella SOLO la famiglia con questo nome.
const DEMO_FAMILY_NAME = "Famiglia Demo";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// --- Helper date ------------------------------------------------------------
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (n: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const addDaysFrom = (base: Date, n: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};
// Lunedi della settimana corrente (per il piano pasti).
const mondayOfThisWeek = (): Date => {
  const d = new Date();
  const day = d.getDay(); // 0=dom .. 6=sab
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

async function cleanup(tx: Tx): Promise<{ users: number; families: number }> {
  const existing = await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, [DEMO_EMAIL, PARTNER_EMAIL]));

  if (existing.length === 0) return { users: 0, families: 0 };

  const userIds = existing.map((u) => u.id);

  // Cancella SOLO la famiglia demo (riconosciuta dal nome marker) a cui gli
  // utenti demo appartengono. Mai famiglie reali. ON DELETE CASCADE rimuove
  // tutti i dati collegati.
  const demoFamilies = await tx
    .selectDistinct({ familyId: families.id })
    .from(families)
    .innerJoin(familyMembers, eq(familyMembers.familyId, families.id))
    .where(
      and(
        eq(families.name, DEMO_FAMILY_NAME),
        inArray(familyMembers.userId, userIds),
      ),
    );

  const familyIds = demoFamilies.map((f) => f.familyId);
  if (familyIds.length > 0) {
    await tx.delete(families).where(inArray(families.id, familyIds));
  }
  // Gli utenti demo usano email riservate al seed: eliminarli e sicuro.
  await tx.delete(users).where(inArray(users.id, userIds));
  return { users: userIds.length, families: familyIds.length };
}

export interface EnsureDemoResult {
  created: boolean;
  skipped: boolean;
  reason?: "disabled" | "missing_password";
  email: string;
}

/**
 * Garantisce l'account demo. Con `reset: false` (default) crea solo se manca.
 * Con `reset: true` rigenera da zero. Idempotente, marker-scoped, in transazione.
 *
 * Crea l'account SOLO se `ENABLE_DEMO_ACCOUNT === "true"` e se la password
 * (secret `DEMO_ACCOUNT_PASSWORD`) e impostata; altrimenti non tocca nulla.
 */
export async function ensureDemoAccount(
  opts: { reset?: boolean } = {},
): Promise<EnsureDemoResult> {
  if (!DEMO_ENABLED) {
    return { created: false, skipped: true, reason: "disabled", email: DEMO_EMAIL };
  }
  if (!DEMO_PASSWORD) {
    return { created: false, skipped: true, reason: "missing_password", email: DEMO_EMAIL };
  }
  return db.transaction(async (tx): Promise<EnsureDemoResult> => {
    // Lock advisory transazionale: serializza chiamate concorrenti (deploy
    // multi-istanza / restart simultanei) evitando insert duplicati su email.
    // Rilasciato automaticamente a fine transazione.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('familysync:demo-account'))`);

    const [present] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_EMAIL))
      .limit(1);

    if (present && !opts.reset) {
      return { created: false, skipped: false, email: DEMO_EMAIL };
    }

    // Pulizia marker-scoped: rimuove eventuali residui demo (anche solo il
    // partner) prima di ricreare, evitando conflitti di chiave unica.
    await cleanup(tx);

    const now = new Date();
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const partnerHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    // 1) Utenti -----------------------------------------------------------
    const [demoUser] = await tx
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        passwordHash,
        name: DEMO_NAME,
        emailVerified: true,
        termsAcceptedAt: now,
        aiFeaturesEnabled: true,
      })
      .returning();

    const [partnerUser] = await tx
      .insert(users)
      .values({
        email: PARTNER_EMAIL,
        passwordHash: partnerHash,
        name: PARTNER_NAME,
        emailVerified: true,
        termsAcceptedAt: now,
        aiFeaturesEnabled: true,
      })
      .returning();

    // 2) Famiglia + membri ------------------------------------------------
    const [family] = await tx
      .insert(families)
      .values({
        name: DEMO_FAMILY_NAME,
        colorTheme: "#6366F1",
        subscriptionStatus: "premium", // mirror; la verita e in entitlements
      })
      .returning();

    const [adminMember] = await tx
      .insert(familyMembers)
      .values({
        familyId: family.id,
        userId: demoUser.id,
        role: "admin",
        nickname: "Mamma",
        color: "#6366F1",
        points: 120,
      })
      .returning();

    const [partnerMember] = await tx
      .insert(familyMembers)
      .values({
        familyId: family.id,
        userId: partnerUser.id,
        role: "adult",
        nickname: "Papà",
        color: "#22C55E",
        points: 80,
      })
      .returning();

    // 3) Premium attivo (fonte di verita: entitlements) -------------------
    await tx.insert(entitlements).values({
      familyId: family.id,
      userId: demoUser.id,
      platform: "revenuecat",
      productId: "familysync_premium_yearly",
      status: "active",
      expiresAt: null, // permanente per la revisione
    });

    // 4) Calendario -------------------------------------------------------
    await tx.insert(calendarEvents).values([
      {
        familyId: family.id,
        title: "Visita dal pediatra",
        description: "Controllo annuale",
        date: iso(addDays(1)),
        time: "09:30",
        endTime: "10:15",
        category: "health",
        location: "Studio Dott. Bianchi",
        color: "#EF4444",
        memberId: adminMember.id,
        createdBy: demoUser.id,
      },
      {
        familyId: family.id,
        title: "Allenamento calcio",
        date: iso(addDays(2)),
        time: "17:00",
        endTime: "18:30",
        category: "sport",
        location: "Campo comunale",
        color: "#22C55E",
        memberId: partnerMember.id,
        createdBy: partnerUser.id,
      },
      {
        familyId: family.id,
        title: "Cena con i nonni",
        date: iso(addDays(4)),
        allDay: true,
        category: "family",
        color: "#6366F1",
        createdBy: demoUser.id,
      },
    ]);

    // 5) Spesa ------------------------------------------------------------
    const [list] = await tx
      .insert(shoppingLists)
      .values({
        familyId: family.id,
        name: "Spesa settimanale",
        icon: "cart",
        createdBy: demoUser.id,
      })
      .returning();

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
        position: 3,
      },
    ]);

    // 6) Faccende ---------------------------------------------------------
    await tx.insert(chores).values([
      {
        familyId: family.id,
        title: "Portare fuori la spazzatura",
        description: "Ogni sera",
        difficulty: 1,
        points: 10,
        estimatedMinutes: 5,
        assignedTo: partnerMember.id,
        dueDate: addDays(1),
        createdBy: demoUser.id,
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
        createdBy: demoUser.id,
      },
      {
        familyId: family.id,
        title: "Annaffiare le piante",
        difficulty: 1,
        points: 5,
        estimatedMinutes: 10,
        assignedTo: partnerMember.id,
        createdBy: partnerUser.id,
      },
    ]);

    // 7) Ricette + ingredienti -------------------------------------------
    const [recipe] = await tx
      .insert(recipes)
      .values({
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
          "Scola la pasta e condisci con il sugo. Servi caldo.",
        ],
        tags: { cuisine: "italiana", difficulty: "facile" },
      })
      .returning();

    await tx.insert(recipeIngredients).values([
      { recipeId: recipe.id, name: "Pasta", quantity: "320", unit: "g", normalizedName: "pasta", category: "food" },
      { recipeId: recipe.id, name: "Passata di pomodoro", quantity: "400", unit: "ml", normalizedName: "passata di pomodoro", category: "food" },
      { recipeId: recipe.id, name: "Basilico", unit: "to_taste", normalizedName: "basilico", category: "food" },
      { recipeId: recipe.id, name: "Olio d'oliva", quantity: "2", unit: "tbsp", normalizedName: "olio d'oliva", category: "food" },
    ]);

    // 8) Piano pasti ------------------------------------------------------
    const weekStart = mondayOfThisWeek();
    const [plan] = await tx
      .insert(mealPlans)
      .values({
        familyId: family.id,
        createdByUserId: demoUser.id,
        weekStartDate: iso(weekStart),
        title: "Menu della settimana",
        preferences: { mealsPerDay: 3 },
      })
      .returning();

    await tx.insert(mealPlanItems).values([
      { mealPlanId: plan.id, date: iso(weekStart), mealType: "lunch", recipeId: recipe.id, servings: 4 },
      { mealPlanId: plan.id, date: iso(weekStart), mealType: "dinner", titleOverride: "Minestrone di verdure", servings: 4 },
      { mealPlanId: plan.id, date: iso(addDaysFrom(weekStart, 1)), mealType: "dinner", titleOverride: "Pollo al forno con patate", servings: 4 },
    ]);

    // 9) Bollette + ripartizione -----------------------------------------
    const [billLuce] = await tx
      .insert(bills)
      .values({
        familyId: family.id,
        title: "Bolletta luce - Giugno",
        provider: "Enel Energia",
        category: "luce",
        amount: "84.50",
        dueDate: iso(addDays(7)),
        holder: "Account Demo",
        assignedTo: adminMember.id,
        status: "da_pagare",
        splitType: "equal",
        remindersEnabled: true,
        createdBy: demoUser.id,
      })
      .returning();

    await tx.insert(billSplits).values([
      { billId: billLuce.id, memberId: adminMember.id, amount: "42.25" },
      { billId: billLuce.id, memberId: partnerMember.id, amount: "42.25" },
    ]);

    await tx.insert(bills).values({
      familyId: family.id,
      title: "Abbonamento internet - Maggio",
      provider: "TIM",
      category: "telefono",
      amount: "29.90",
      dueDate: iso(addDays(-10)),
      status: "pagata",
      paidAt: addDays(-12),
      paidBy: demoUser.id,
      remindersEnabled: true,
      createdBy: demoUser.id,
    });

    // 10) Chat ------------------------------------------------------------
    await tx.insert(chatMessages).values([
      {
        familyId: family.id,
        userId: partnerUser.id,
        messageType: "text",
        content: "Ciao! Ho aggiunto la spesa per stasera 🛒",
        createdAt: addDays(-1),
      },
      {
        familyId: family.id,
        userId: demoUser.id,
        messageType: "text",
        content: "Perfetto, passo io al supermercato 👍",
        createdAt: addDays(-1),
      },
    ]);

    // 11) Suggerimento AI -------------------------------------------------
    await tx.insert(aiInsights).values({
      familyId: family.id,
      type: "shopping_suggestion",
      title: "Potrebbe servirti: caffè",
      description: "In base agli acquisti recenti, il caffè di solito si esaurisce in questo periodo.",
      actionData: { item: "Caffè" },
    });

    return { created: true, skipped: false, email: DEMO_EMAIL };
  });
}

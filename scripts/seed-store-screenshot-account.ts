/**
 * Seed SOLO-SVILUPPO per catturare gli screenshot degli store.
 *
 * Obiettivo: partire dall'account demo ufficiale (stessa email/secret, stesso
 * entitlement Premium) e trasformarlo in una famiglia dimostrativa "polished"
 * ("Famiglia Bianchi") con contenuti fittizi ricchi in TUTTE le sezioni
 * dell'app, così le catture appaiono realistiche e complete.
 *
 * Sicurezza:
 * - RIFIUTA di girare in produzione (NODE_ENV=production) e, per prudenza,
 *   richiede STORE_SCREENSHOT_SEED=true come conferma esplicita.
 * - Riusa ensureDemoAccount({ reset: true }): stessa logica marker-scoped che
 *   tocca solo la famiglia demo (marker "Famiglia Demo"), mai dati reali.
 * - NON logga MAI la password né alcun valore di secret.
 *
 * Idempotenza:
 * - Prima del reset, elimina in sicurezza SOLO una eventuale famiglia chiamata
 *   esattamente "Famiglia Bianchi" collegata (via family_members) alla email
 *   demo configurata. Questo perché, dopo la trasformazione, il marker della
 *   famiglia non è più "Famiglia Demo" e quindi il cleanup interno di
 *   ensureDemoAccount non la riconoscerebbe più: la ripuliamo noi qui.
 *
 * Nessuna modifica al comportamento dell'app in produzione né allo startup.
 *
 * Avvio:
 *   NODE_ENV=development STORE_SCREENSHOT_SEED=true \
 *   ENABLE_DEMO_ACCOUNT=true DEMO_ACCOUNT_EMAIL=... DEMO_ACCOUNT_PASSWORD=... \
 *   npx tsx scripts/seed-store-screenshot-account.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { ensureDemoAccount, DEMO_EMAIL } from "../server/lib/demo-account";
import { PRIVACY_POLICY_VERSION } from "../shared/policy-version";
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
  rewards,
  pantryItems,
  expenses,
  familyBudgets,
} from "../shared/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Nome deterministico della famiglia dimostrativa trasformata.
const SCREENSHOT_FAMILY_NAME = "Famiglia Bianchi";
// Marker della famiglia appena seminata da ensureDemoAccount.
const DEMO_FAMILY_NAME = "Famiglia Demo";

// --- Helper date ------------------------------------------------------------
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const at = (n: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const atTime = (n: number, h: number, m: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, m, 0, 0);
  return d;
};
const addDaysFrom = (base: Date, n: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};
const mondayOfThisWeek = (): Date => {
  const d = new Date();
  const day = d.getDay(); // 0=dom .. 6=sab
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Cancella in sicurezza SOLO una famiglia chiamata esattamente
 * "Famiglia Bianchi" collegata (via family_members) alla email demo configurata.
 * ON DELETE CASCADE rimuove tutti i dati collegati. Mai famiglie reali.
 */
async function cleanupPreviousScreenshotFamily(
  tx: Tx,
): Promise<{ families: number }> {
  const [demoUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);

  if (!demoUser) return { families: 0 };

  const rows = await tx
    .selectDistinct({ familyId: families.id })
    .from(families)
    .innerJoin(familyMembers, eq(familyMembers.familyId, families.id))
    .where(
      and(
        eq(families.name, SCREENSHOT_FAMILY_NAME),
        eq(familyMembers.userId, demoUser.id),
      ),
    );

  const familyIds = rows.map((r) => r.familyId);
  if (familyIds.length > 0) {
    await tx.delete(families).where(inArray(families.id, familyIds));
  }
  return { families: familyIds.length };
}

interface TransformResult {
  familyId: string;
  saraMemberId: string;
  lucaMemberId: string;
  emmaMemberId: string;
  tommasoMemberId: string;
}

/**
 * Trasforma la famiglia demo appena seminata in "Famiglia Bianchi" e sostituisce
 * i dati di esempio con contenuti fittizi ricchi e realistici. Tutto in
 * transazione, con date correnti.
 */
async function transform(tx: Tx): Promise<TransformResult> {
  // 1) Individua la famiglia demo appena creata (marker "Famiglia Demo")
  //    collegata alla email demo, così tocchiamo SOLO quella.
  const [demoUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);
  if (!demoUser) {
    throw new Error(
      "Utente demo non trovato dopo il reset: impossibile trasformare.",
    );
  }

  const [family] = await tx
    .selectDistinct({ id: families.id })
    .from(families)
    .innerJoin(familyMembers, eq(familyMembers.familyId, families.id))
    .where(
      and(
        eq(families.name, DEMO_FAMILY_NAME),
        eq(familyMembers.userId, demoUser.id),
      ),
    )
    .limit(1);
  if (!family) {
    throw new Error(
      "Famiglia demo (marker) non trovata dopo il reset: impossibile trasformare.",
    );
  }
  const familyId = family.id;

  // Membri con account (admin=demo/Sara, adult=partner/Luca).
  const accountMembers = await tx
    .select({
      memberId: familyMembers.id,
      userId: familyMembers.userId,
      role: familyMembers.role,
    })
    .from(familyMembers)
    .where(eq(familyMembers.familyId, familyId));

  const adminMember = accountMembers.find((m) => m.role === "admin");
  const adultMember = accountMembers.find(
    (m) => m.role === "adult" && m.memberId !== adminMember?.memberId,
  );
  if (!adminMember?.userId || !adultMember?.userId) {
    throw new Error(
      "Membri demo con account non trovati (admin/adult): impossibile trasformare.",
    );
  }
  const saraMemberId = adminMember.memberId;
  const lucaMemberId = adultMember.memberId;
  const saraUserId = adminMember.userId;
  const lucaUserId = adultMember.userId;

  // 2) Rinomina famiglia (diventa "Famiglia Bianchi").
  await tx
    .update(families)
    .set({ name: SCREENSHOT_FAMILY_NAME, colorTheme: "#6366F1" })
    .where(eq(families.id, familyId));

  // 3) Rinomina utenti collegati e segnali "pienamente onboarded".
  //    Onboarding completo = ageBand + termsAcceptedAt valorizzati (vedi auth.ts).
  const now = new Date();
  await tx
    .update(users)
    .set({
      name: "Sara Bianchi",
      emailVerified: true,
      ageBand: "adult",
      termsAcceptedAt: now,
      aiFeaturesEnabled: true,
      privacyPolicySeenVersion: PRIVACY_POLICY_VERSION,
    })
    .where(eq(users.id, saraUserId));
  await tx
    .update(users)
    .set({
      name: "Luca Bianchi",
      emailVerified: true,
      ageBand: "adult",
      termsAcceptedAt: now,
      aiFeaturesEnabled: true,
      privacyPolicySeenVersion: PRIVACY_POLICY_VERSION,
    })
    .where(eq(users.id, lucaUserId));

  // 4) Rinomina i membri collegati (nickname coerente Bianchi).
  await tx
    .update(familyMembers)
    .set({ nickname: "Mamma", color: "#6366F1", points: 240 })
    .where(eq(familyMembers.id, saraMemberId));
  await tx
    .update(familyMembers)
    .set({ nickname: "Papà", color: "#0984E3", points: 180 })
    .where(eq(familyMembers.id, lucaMemberId));

  // 5) Profili bambino gestiti (senza account: userId NULL, name valorizzato).
  const [emma] = await tx
    .insert(familyMembers)
    .values({
      familyId,
      userId: null,
      role: "child",
      name: "Emma Bianchi",
      nickname: "Emma",
      color: "#E84393",
      points: 95,
    })
    .returning();
  const [tommaso] = await tx
    .insert(familyMembers)
    .values({
      familyId,
      userId: null,
      role: "child",
      name: "Tommaso Bianchi",
      nickname: "Tommaso",
      color: "#00B894",
      points: 60,
    })
    .returning();
  const emmaMemberId = emma.id;
  const tommasoMemberId = tommaso.id;

  // --- 6) Sostituzione dati: azzera le sezioni e ripopola con Bianchi -------
  // Le entità figlie di family (calendar, chores, ecc.) sono già state ricreate
  // dal seed demo. Le svuotiamo per la famiglia e le ripopoliamo ricche.
  await tx.delete(calendarEvents).where(eq(calendarEvents.familyId, familyId));
  await tx.delete(chores).where(eq(chores.familyId, familyId));
  await tx.delete(chatMessages).where(eq(chatMessages.familyId, familyId));
  await tx.delete(aiInsights).where(eq(aiInsights.familyId, familyId));
  await tx.delete(bills).where(eq(bills.familyId, familyId));
  await tx.delete(pantryItems).where(eq(pantryItems.familyId, familyId));
  await tx.delete(expenses).where(eq(expenses.familyId, familyId));
  await tx.delete(familyBudgets).where(eq(familyBudgets.familyId, familyId));
  await tx.delete(rewards).where(eq(rewards.familyId, familyId));
  // Ricette + piani pasti + liste spesa: ricreiamo da zero.
  // I mealPlanItems possono riferirsi alle ricette: elimina prima il piano
  // (cascade sugli item), poi le ricette.
  await tx.delete(mealPlans).where(eq(mealPlans.familyId, familyId));
  await tx.delete(recipes).where(eq(recipes.familyId, familyId));
  await tx.delete(shoppingLists).where(eq(shoppingLists.familyId, familyId));

  // 6a) Calendario — evidenza su OGGI + prossimi giorni.
  await tx.insert(calendarEvents).values([
    {
      familyId,
      title: "Riunione a scuola di Emma",
      description: "Colloquio con le maestre",
      date: iso(at(0)),
      time: "08:30",
      endTime: "09:15",
      category: "school",
      location: "Scuola Primaria Rodari",
      color: "#E84393",
      memberId: emmaMemberId,
      createdBy: saraUserId,
    },
    {
      familyId,
      title: "Allenamento nuoto di Tommaso",
      date: iso(at(0)),
      time: "17:30",
      endTime: "18:30",
      category: "sport",
      location: "Piscina Comunale",
      color: "#00B894",
      memberId: tommasoMemberId,
      createdBy: lucaUserId,
    },
    {
      familyId,
      title: "Cena in famiglia",
      description: "Pizza fatta in casa 🍕",
      date: iso(at(0)),
      time: "20:00",
      endTime: "21:30",
      category: "family",
      color: "#6366F1",
      createdBy: saraUserId,
    },
    {
      familyId,
      title: "Visita dal dentista",
      date: iso(at(1)),
      time: "10:00",
      endTime: "10:45",
      category: "health",
      location: "Studio Dott.ssa Verdi",
      color: "#FF7675",
      memberId: saraMemberId,
      createdBy: saraUserId,
    },
    {
      familyId,
      title: "Compleanno di zia Chiara",
      date: iso(at(3)),
      allDay: true,
      category: "social",
      color: "#A29BFE",
      createdBy: lucaUserId,
    },
    {
      familyId,
      title: "Gita al parco",
      date: iso(at(5)),
      time: "15:00",
      endTime: "18:00",
      category: "family",
      location: "Parco della Rimembranza",
      color: "#0984E3",
      createdBy: lucaUserId,
    },
  ]);

  // 6b) Spesa — lista dettagliata con item spuntati e non.
  const [list] = await tx
    .insert(shoppingLists)
    .values({
      familyId,
      name: "Spesa della settimana",
      icon: "cart",
      createdBy: saraUserId,
    })
    .returning();
  await tx.insert(shoppingItems).values([
    { listId: list.id, name: "Latte parzialmente scremato", quantity: "2", unit: "l", category: "food", createdBy: saraUserId, position: 0 },
    { listId: list.id, name: "Pane integrale", quantity: "1", unit: "kg", category: "food", createdBy: lucaUserId, position: 1 },
    { listId: list.id, name: "Mele Fuji", quantity: "6", unit: "pcs", category: "food", createdBy: saraUserId, position: 2 },
    { listId: list.id, name: "Yogurt greco", quantity: "4", unit: "pcs", category: "food", createdBy: saraUserId, position: 3 },
    { listId: list.id, name: "Pasta penne", quantity: "1", unit: "kg", category: "food", createdBy: lucaUserId, position: 4 },
    { listId: list.id, name: "Passata di pomodoro", quantity: "3", unit: "pcs", category: "food", createdBy: saraUserId, position: 5 },
    { listId: list.id, name: "Detersivo piatti", quantity: "1", category: "home", isChecked: true, checkedBy: lucaUserId, checkedAt: now, createdBy: lucaUserId, position: 6 },
    { listId: list.id, name: "Carta igienica", quantity: "1", category: "home", isChecked: true, checkedBy: saraUserId, checkedAt: now, createdBy: saraUserId, position: 7 },
    { listId: list.id, name: "Merendine per la scuola", quantity: "2", category: "food", createdBy: saraUserId, position: 8 },
  ]);

  // 6c) Faccende — con almeno una assegnata a ciascun bambino, pending.
  await tx.insert(chores).values([
    {
      familyId,
      title: "Riordinare la cameretta",
      description: "Prima di cena",
      difficulty: 1,
      points: 15,
      estimatedMinutes: 15,
      assignedTo: emmaMemberId,
      dueDate: at(0),
      createdBy: saraUserId,
    },
    {
      familyId,
      title: "Apparecchiare la tavola",
      difficulty: 1,
      points: 10,
      estimatedMinutes: 10,
      assignedTo: tommasoMemberId,
      dueDate: at(0),
      createdBy: saraUserId,
    },
    {
      familyId,
      title: "Fare i compiti di matematica",
      difficulty: 2,
      points: 20,
      estimatedMinutes: 30,
      assignedTo: emmaMemberId,
      dueDate: at(1),
      createdBy: lucaUserId,
    },
    {
      familyId,
      title: "Dare da mangiare al gatto",
      difficulty: 1,
      points: 5,
      estimatedMinutes: 5,
      assignedTo: tommasoMemberId,
      dueDate: at(1),
      createdBy: lucaUserId,
    },
    {
      familyId,
      title: "Portare fuori la spazzatura",
      difficulty: 1,
      points: 10,
      estimatedMinutes: 5,
      assignedTo: lucaMemberId,
      isCompleted: true,
      completedAt: now,
      completedBy: lucaUserId,
      createdBy: saraUserId,
    },
  ]);

  // 6d) Premi — almeno uno attivo (più di uno per una griglia ricca).
  await tx.insert(rewards).values([
    { familyId, title: "Serata film con pop-corn 🍿", description: "Scegli tu il film!", pointsCost: 50, isActive: true, createdBy: saraUserId },
    { familyId, title: "Gelato al parco 🍦", description: "Doppio gusto a scelta", pointsCost: 30, isActive: true, createdBy: saraUserId },
    { familyId, title: "1 ora di videogiochi 🎮", pointsCost: 40, isActive: true, createdBy: lucaUserId },
    { familyId, title: "Pigiama party con un amico", pointsCost: 120, isActive: false, createdBy: saraUserId },
  ]);

  // 6e) Ricette + ingredienti (2 ricette).
  const [recipePasta] = await tx
    .insert(recipes)
    .values({
      familyId,
      createdByUserId: saraUserId,
      source: "manual",
      title: "Pasta al pomodoro e basilico",
      description: "Il piatto preferito di tutta la famiglia Bianchi.",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      steps: [
        "Porta a ebollizione una pentola di acqua salata.",
        "Cuoci la pasta al dente secondo i tempi indicati.",
        "Scalda la passata con un filo d'olio e uno spicchio d'aglio.",
        "Scola la pasta, manteca con il sugo e aggiungi basilico fresco.",
      ],
      tags: { cuisine: "italiana", difficulty: "facile" },
    })
    .returning();
  await tx.insert(recipeIngredients).values([
    { recipeId: recipePasta.id, name: "Pasta penne", quantity: "320", unit: "g", normalizedName: "pasta penne", category: "food" },
    { recipeId: recipePasta.id, name: "Passata di pomodoro", quantity: "400", unit: "ml", normalizedName: "passata di pomodoro", category: "food" },
    { recipeId: recipePasta.id, name: "Basilico fresco", unit: "to_taste", normalizedName: "basilico fresco", category: "food" },
    { recipeId: recipePasta.id, name: "Olio d'oliva", quantity: "2", unit: "tbsp", normalizedName: "olio d'oliva", category: "food" },
  ]);

  const [recipePollo] = await tx
    .insert(recipes)
    .values({
      familyId,
      createdByUserId: lucaUserId,
      source: "manual",
      title: "Pollo al forno con patate",
      description: "Croccante fuori, morbido dentro. Piace anche ai bambini.",
      servings: 4,
      prepTimeMinutes: 15,
      cookTimeMinutes: 45,
      steps: [
        "Scalda il forno a 200°C.",
        "Taglia le patate a spicchi e condisci con olio, rosmarino e sale.",
        "Disponi il pollo e le patate in teglia.",
        "Inforna per 45 minuti girando a metà cottura.",
      ],
      tags: { cuisine: "italiana", difficulty: "media" },
    })
    .returning();
  await tx.insert(recipeIngredients).values([
    { recipeId: recipePollo.id, name: "Cosce di pollo", quantity: "4", unit: "pcs", normalizedName: "cosce di pollo", category: "food" },
    { recipeId: recipePollo.id, name: "Patate", quantity: "800", unit: "g", normalizedName: "patate", category: "food" },
    { recipeId: recipePollo.id, name: "Rosmarino", unit: "to_taste", normalizedName: "rosmarino", category: "food" },
    { recipeId: recipePollo.id, name: "Olio d'oliva", quantity: "3", unit: "tbsp", normalizedName: "olio d'oliva", category: "food" },
  ]);

  // 6f) Piano pasti della settimana corrente.
  const weekStart = mondayOfThisWeek();
  const [plan] = await tx
    .insert(mealPlans)
    .values({
      familyId,
      createdByUserId: saraUserId,
      weekStartDate: iso(weekStart),
      title: "Menu della settimana",
      preferences: { mealsPerDay: 3 },
    })
    .returning();
  await tx.insert(mealPlanItems).values([
    { mealPlanId: plan.id, date: iso(weekStart), mealType: "lunch", recipeId: recipePasta.id, servings: 4 },
    { mealPlanId: plan.id, date: iso(weekStart), mealType: "dinner", titleOverride: "Minestrone di verdure", servings: 4 },
    { mealPlanId: plan.id, date: iso(addDaysFrom(weekStart, 1)), mealType: "lunch", titleOverride: "Riso con zucchine", servings: 4 },
    { mealPlanId: plan.id, date: iso(addDaysFrom(weekStart, 1)), mealType: "dinner", recipeId: recipePollo.id, servings: 4 },
    { mealPlanId: plan.id, date: iso(addDaysFrom(weekStart, 2)), mealType: "dinner", titleOverride: "Frittata con insalata", servings: 4 },
    { mealPlanId: plan.id, date: iso(addDaysFrom(weekStart, 3)), mealType: "dinner", titleOverride: "Pizza fatta in casa", servings: 4 },
  ]);

  // 6g) Dispensa — prodotti con scadenze, alcuni in scadenza.
  const pantry = [
    { name: "Passata di pomodoro", quantity: "3", unit: "pcs", category: "food", expiryDate: iso(at(90)) },
    { name: "Pasta penne", quantity: "2", unit: "kg", category: "food", expiryDate: iso(at(200)) },
    { name: "Latte", quantity: "2", unit: "l", category: "food", expiryDate: iso(at(4)) },
    { name: "Uova", quantity: "6", unit: "pcs", category: "food", expiryDate: iso(at(12)) },
    { name: "Yogurt greco", quantity: "4", unit: "pcs", category: "food", expiryDate: iso(at(2)) },
    { name: "Riso", quantity: "1", unit: "kg", category: "food", expiryDate: iso(at(300)) },
    { name: "Olio d'oliva", quantity: "1", unit: "l", category: "food", expiryDate: iso(at(180)) },
    { name: "Detersivo piatti", quantity: "1", unit: "pcs", category: "home", expiryDate: null },
  ];
  await tx.insert(pantryItems).values(
    pantry.map((p) => ({
      familyId,
      name: p.name,
      normalizedName: normalize(p.name),
      quantity: p.quantity,
      unit: p.unit,
      category: p.category,
      expiryDate: p.expiryDate,
      addedBy: saraUserId,
    })),
  );

  // 6h) Budget + spese del mese corrente.
  await tx.insert(familyBudgets).values([
    { familyId, category: "total", monthlyLimit: "1500.00" },
    { familyId, category: "alimentari", monthlyLimit: "600.00" },
    { familyId, category: "trasporti", monthlyLimit: "200.00" },
    { familyId, category: "svago", monthlyLimit: "150.00" },
  ]);
  await tx.insert(expenses).values([
    { familyId, memberId: saraMemberId, amount: "84.30", category: "alimentari", description: "Spesa supermercato", date: iso(at(-2)), createdBy: saraUserId },
    { familyId, memberId: lucaMemberId, amount: "55.00", category: "trasporti", description: "Benzina", date: iso(at(-3)), createdBy: lucaUserId },
    { familyId, memberId: saraMemberId, amount: "24.50", category: "svago", description: "Cinema in famiglia", date: iso(at(-5)), createdBy: saraUserId },
    { familyId, memberId: lucaMemberId, amount: "39.90", category: "alimentari", description: "Frutta e verdura", date: iso(at(-6)), createdBy: lucaUserId },
    { familyId, memberId: saraMemberId, amount: "18.00", category: "salute", description: "Farmacia", date: iso(at(-8)), createdBy: saraUserId },
    { familyId, memberId: saraMemberId, amount: "42.70", category: "abbigliamento", description: "Scarpe per Emma", date: iso(at(-10)), createdBy: saraUserId },
    { familyId, memberId: lucaMemberId, amount: "60.00", category: "istruzione", description: "Corso di nuoto Tommaso", date: iso(at(-12)), createdBy: lucaUserId },
  ]);

  // 6i) Bollette — una da pagare a breve (con ripartizione) e una pagata.
  const [billLuce] = await tx
    .insert(bills)
    .values({
      familyId,
      title: "Bolletta luce",
      provider: "Enel Energia",
      category: "luce",
      amount: "92.40",
      dueDate: iso(at(5)),
      holder: "Sara Bianchi",
      assignedTo: saraMemberId,
      status: "da_pagare",
      splitType: "equal",
      remindersEnabled: true,
      createdBy: saraUserId,
    })
    .returning();
  await tx.insert(billSplits).values([
    { billId: billLuce.id, memberId: saraMemberId, amount: "46.20" },
    { billId: billLuce.id, memberId: lucaMemberId, amount: "46.20" },
  ]);
  await tx.insert(bills).values([
    {
      familyId,
      title: "Bolletta gas",
      provider: "Eni Plenitude",
      category: "gas",
      amount: "68.10",
      dueDate: iso(at(11)),
      holder: "Luca Bianchi",
      assignedTo: lucaMemberId,
      status: "da_pagare",
      remindersEnabled: true,
      createdBy: lucaUserId,
    },
    {
      familyId,
      title: "Internet e telefono",
      provider: "TIM",
      category: "telefono",
      amount: "29.90",
      dueDate: iso(at(-8)),
      status: "pagata",
      paidAt: at(-9),
      paidBy: lucaUserId,
      remindersEnabled: true,
      createdBy: lucaUserId,
    },
  ]);

  // 6j) Chat di famiglia.
  await tx.insert(chatMessages).values([
    { familyId, userId: lucaUserId, messageType: "text", content: "Buongiorno! Oggi passo io a prendere Tommaso dal nuoto 🏊", createdAt: atTime(0, 8, 12) },
    { familyId, userId: saraUserId, messageType: "text", content: "Perfetto grazie amore ❤️ io porto Emma al colloquio a scuola", createdAt: atTime(0, 8, 15) },
    { familyId, userId: saraUserId, messageType: "text", content: "Stasera pizza fatta in casa? 🍕", createdAt: atTime(0, 12, 30) },
    { familyId, userId: lucaUserId, messageType: "text", content: "Evvai! Prendo la mozzarella al rientro 👍", createdAt: atTime(0, 12, 33) },
  ]);

  // 6k) Suggerimento AI (per la sezione insights).
  await tx.insert(aiInsights).values([
    {
      familyId,
      type: "shopping_suggestion",
      title: "Potrebbe servirti: caffè",
      description: "In base agli acquisti recenti, il caffè di solito si esaurisce in questo periodo.",
      actionData: { item: "Caffè" },
    },
    {
      familyId,
      type: "meal_suggestion",
      title: "Idea per stasera",
      description: "Hai passata di pomodoro e pasta in dispensa: che ne dici di una pasta al pomodoro?",
      actionData: { recipe: "Pasta al pomodoro e basilico" },
    },
  ]);

  return {
    familyId,
    saraMemberId,
    lucaMemberId,
    emmaMemberId,
    tommasoMemberId,
  };
}

async function main(): Promise<void> {
  // --- Guardie di sicurezza -------------------------------------------------
  if (process.env.NODE_ENV === "production") {
    console.error(
      "RIFIUTO: questo seed è SOLO per lo sviluppo e non gira in produzione (NODE_ENV=production).",
    );
    process.exit(1);
  }
  if (process.env.STORE_SCREENSHOT_SEED !== "true") {
    console.error(
      "RIFIUTO: imposta STORE_SCREENSHOT_SEED=true per confermare l'esecuzione di questo seed di sviluppo.",
    );
    process.exit(1);
  }

  // 1) Pulizia idempotente della precedente "Famiglia Bianchi" (se esiste),
  //    perché dopo la trasformazione non ha più il marker demo.
  const pre = await db.transaction((tx) =>
    cleanupPreviousScreenshotFamily(tx),
  );

  // 2) Rigenera l'account demo da zero (stessa logica, marker-scoped, Premium).
  const res = await ensureDemoAccount({ reset: true });
  if (res.skipped) {
    if (res.reason === "disabled") {
      console.error(
        "Seed SALTATO: ENABLE_DEMO_ACCOUNT non è impostato a 'true'.",
      );
    } else if (res.reason === "missing_password") {
      console.error(
        "Seed SALTATO: il secret DEMO_ACCOUNT_PASSWORD non è impostato.",
      );
    } else {
      console.error("Seed SALTATO.");
    }
    process.exit(1);
  }

  // 3) Trasforma in "Famiglia Bianchi" con contenuti fittizi ricchi.
  const out = await db.transaction((tx) => transform(tx));

  // 4) Riepilogo conciso (nessun secret, nessuna password).
  console.log("\n========================================");
  console.log("  SEED SCREENSHOT STORE - PRONTO");
  console.log("========================================");
  console.log(`  Email account:   ${DEMO_EMAIL}`);
  console.log("  Password:        (nel secret DEMO_ACCOUNT_PASSWORD)");
  console.log(`  Famiglia:        ${SCREENSHOT_FAMILY_NAME}`);
  console.log(`  familyId:        ${out.familyId}`);
  console.log(`  Sara (member):   ${out.saraMemberId}`);
  console.log(`  Luca (member):   ${out.lucaMemberId}`);
  console.log(`  Emma (member):   ${out.emmaMemberId}`);
  console.log(`  Tommaso (member):${out.tommasoMemberId}`);
  console.log("----------------------------------------");
  console.log("  Email verificata: SI  |  Onboarding: COMPLETO");
  console.log("  Premium: ATTIVO  |  Dati fittizi Bianchi in tutte le sezioni");
  if (pre.families > 0) {
    console.log(`  (Ripulita ${pre.families} precedente/i "${SCREENSHOT_FAMILY_NAME}")`);
  }
  console.log("========================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore durante il seed screenshot:", err);
  process.exit(1);
});

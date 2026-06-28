import { db } from "../db";
import { entitlements, families, familyMembers, users } from "../../shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { config } from "./config";

/**
 * Stato Premium UNICO dell'app, derivato dalla tabella `entitlements`. La
 * tabella è la fonte operativa: isPremium(familyId) la legge dal DB ed è
 * l'unica fonte di verità usata da AI (quote) e da qualunque funzione premium.
 *
 * Il motore degli acquisti è RevenueCat (store-native): il backend sincronizza
 * lo stato da RevenueCat (vedi syncEntitlementFromRevenueCat) verso questa
 * tabella. Il client NON decide il Premium. Stripe NON entra qui.
 *
 * Lo store è INIETTABILE (__setEntitlementStoreForTest) per testare senza DB.
 */

export type Plan = "free" | "premium";
export type EntitlementStatus = "active" | "expired" | "canceled" | "pending";
export type EntitlementPlatform = "google" | "apple" | "revenuecat";

export interface EntitlementRecord {
  status: EntitlementStatus;
  expiresAt: Date | null;
}

export interface ApplyPurchaseInput {
  familyId: string;
  userId: string | null;
  platform: EntitlementPlatform;
  productId: string;
  status: EntitlementStatus;
  expiresAt: Date | null;
  purchaseToken: string | null;
  originalTransactionId: string | null;
  transactionId: string | null;
  latestReceipt: string | null;
}

export interface EntitlementStore {
  get(familyId: string): Promise<EntitlementRecord | null>;
  upsert(input: ApplyPurchaseInput): Promise<void>;
  setFamilySubscriptionStatus(familyId: string, status: string): Promise<void>;
}

const dbEntitlementStore: EntitlementStore = {
  async get(familyId) {
    const [row] = await db
      .select({ status: entitlements.status, expiresAt: entitlements.expiresAt })
      .from(entitlements)
      .where(eq(entitlements.familyId, familyId))
      .limit(1);
    return row ?? null;
  },
  async upsert(input) {
    // Premium UNICO per famiglia: upsert su familyId.
    await db
      .insert(entitlements)
      .values({
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
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
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
          updatedAt: new Date(),
        },
      });
  },
  async setFamilySubscriptionStatus(familyId, status) {
    await db
      .update(families)
      .set({ subscriptionStatus: status as "free" | "premium" | "canceled" })
      .where(eq(families.id, familyId));
  },
};

let store: EntitlementStore = dbEntitlementStore;

export function __setEntitlementStoreForTest(s: EntitlementStore): void {
  store = s;
}
export function __resetEntitlementStoreForTest(): void {
  store = dbEntitlementStore;
}

/** Un entitlement è "attivo" se status=active e non scaduto. */
export function isEntitlementActive(ent: EntitlementRecord | null | undefined, now: Date = new Date()): boolean {
  if (!ent) return false;
  if (ent.status !== "active") return false;
  if (ent.expiresAt && ent.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Deriva lo status di entitlement dall'esito della sync RevenueCat. */
export function deriveStatus(
  result: { active: boolean; expiresAt: Date | null },
  now: Date = new Date(),
): EntitlementStatus {
  if (result.active) {
    if (result.expiresAt && result.expiresAt.getTime() <= now.getTime()) return "expired";
    return "active";
  }
  // RevenueCat non riporta l'entitlement tra quelli attivi: scaduto/annullato.
  if (result.expiresAt && result.expiresAt.getTime() <= now.getTime()) return "expired";
  return "expired";
}

/**
 * Applica l'esito di una sincronizzazione da RevenueCat: aggiorna l'entitlement
 * della famiglia e sincronizza families.subscriptionStatus ("premium" se attivo,
 * altrimenti "free"). Ritorna lo stato premium risultante.
 *
 * productId è best-effort: l'endpoint active_entitlements di RevenueCat non
 * espone il prodotto, quindi salviamo l'identificativo dell'entitlement Premium.
 */
export async function syncEntitlementFromRevenueCat(params: {
  familyId: string;
  userId: string | null;
  active: boolean;
  expiresAt: Date | null;
  productId?: string | null;
}): Promise<{ premium: boolean; status: EntitlementStatus; expiresAt: Date | null }> {
  let active = params.active;
  let expiresAt = params.expiresAt;
  // Account proprietario: Premium permanente. La sync RevenueCat non lo declassa
  // mai (es. quando non esiste un acquisto reale lo store risponderebbe active=false).
  if (await isOwnerPremiumFamily(params.familyId)) {
    active = true;
    expiresAt = null;
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
    latestReceipt: null,
  });

  await store.setFamilySubscriptionStatus(params.familyId, premium ? "premium" : "free");

  return { premium, status, expiresAt };
}

/**
 * True se la famiglia ha tra i membri un account "proprietario"
 * (config.premiumOwnerEmails). Usato SOLO per (1) seedare un entitlement
 * permanente all'avvio e (2) impedire che la sync RevenueCat lo declassi.
 * NON è usato da isPremium: la fonte di verità resta la tabella entitlements.
 * Lista vuota -> nessuna query (nessun impatto su test/perf).
 */
async function isOwnerPremiumFamily(familyId: string): Promise<boolean> {
  const owners = config.premiumOwnerEmails;
  if (owners.length === 0) return false;
  try {
    const rows = await db
      .select({ email: users.email })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyMembers.familyId, familyId));
    return rows.some((r) => owners.includes(r.email.toLowerCase()));
  } catch {
    // Best-effort: in caso di errore (es. id non valido) trattiamo come non-proprietario.
    return false;
  }
}

/** Fonte di verità unica del Premium. Fail-closed: in caso di errore -> false. */
export async function isPremium(familyId: string): Promise<boolean> {
  try {
    const ent = await store.get(familyId);
    return isEntitlementActive(ent);
  } catch {
    return false;
  }
}

/**
 * Reconciliazione all'avvio: garantisce un entitlement Premium permanente
 * (status=active, expiresAt=null) per ogni famiglia che ha tra i membri un
 * account proprietario (config.premiumOwnerEmails). Mantiene `entitlements`
 * come unica fonte di verità (isPremium continua a leggere solo dal DB).
 * No-op se la lista è vuota; gli errori sono propagati al chiamante (che logga).
 */
export async function seedOwnerEntitlements(): Promise<number> {
  const owners = config.premiumOwnerEmails;
  if (owners.length === 0) return 0;
  const rows = await db
    .select({ familyId: familyMembers.familyId, userId: familyMembers.userId })
    .from(familyMembers)
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(inArray(sql`lower(${users.email})`, owners));

  const seen = new Set<string>();
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
      latestReceipt: null,
    });
    await store.setFamilySubscriptionStatus(r.familyId, "premium");
  }
  return seen.size;
}

export async function getEntitlement(familyId: string): Promise<EntitlementRecord | null> {
  return store.get(familyId);
}

export async function getPlanForFamily(familyId: string): Promise<Plan> {
  return (await isPremium(familyId)) ? "premium" : "free";
}

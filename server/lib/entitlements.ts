import { db } from "../db";
import { entitlements, families } from "../../shared/schema";
import { eq } from "drizzle-orm";
import type { VerifyOutcome, VerifyPlatform } from "./iap-verifier";

/**
 * Stato Premium UNICO dell'app, derivato dalla tabella `entitlements`
 * (acquisti store-native). isPremium(familyId) è l'unica fonte di verità usata
 * da AI (quote) e da qualunque funzione premium. Stripe NON entra qui.
 *
 * Lo store è INIETTABILE (__setEntitlementStoreForTest) per testare senza DB.
 */

export type Plan = "free" | "premium";
export type EntitlementStatus = "active" | "expired" | "canceled" | "pending";

export interface EntitlementRecord {
  status: EntitlementStatus;
  expiresAt: Date | null;
}

export interface ApplyPurchaseInput {
  familyId: string;
  userId: string | null;
  platform: VerifyPlatform;
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

/** Deriva lo status di entitlement dall'esito della verifica store. */
export function deriveStatus(outcome: VerifyOutcome, now: Date = new Date()): EntitlementStatus {
  if (outcome.canceled) return "canceled";
  if (!outcome.valid) return "expired";
  if (outcome.expiresAt && outcome.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/**
 * Applica l'esito di una verifica: aggiorna l'entitlement della famiglia e
 * sincronizza families.subscriptionStatus ("premium" se attivo, altrimenti "free").
 * Ritorna lo stato premium risultante.
 */
export async function applyPurchase(params: {
  familyId: string;
  userId: string | null;
  platform: VerifyPlatform;
  outcome: VerifyOutcome;
}): Promise<{ premium: boolean; status: EntitlementStatus; expiresAt: Date | null }> {
  const status = deriveStatus(params.outcome);
  const premium = status === "active";

  await store.upsert({
    familyId: params.familyId,
    userId: params.userId,
    platform: params.platform,
    productId: params.outcome.productId,
    status,
    expiresAt: params.outcome.expiresAt,
    purchaseToken: params.platform === "google" ? params.outcome.rawReceipt : null,
    originalTransactionId: params.outcome.originalTransactionId,
    transactionId: params.outcome.transactionId,
    latestReceipt: params.outcome.rawReceipt,
  });

  await store.setFamilySubscriptionStatus(params.familyId, premium ? "premium" : "free");

  return { premium, status, expiresAt: params.outcome.expiresAt };
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

export async function getEntitlement(familyId: string): Promise<EntitlementRecord | null> {
  return store.get(familyId);
}

export async function getPlanForFamily(familyId: string): Promise<Plan> {
  return (await isPremium(familyId)) ? "premium" : "free";
}

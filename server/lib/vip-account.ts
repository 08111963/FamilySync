/**
 * Account VIP: accesso completo a TUTTE le funzioni dell'app, SENZA scadenza.
 *
 * `ensureVipAccount()` viene chiamata all'avvio del server (vedi server/index.ts),
 * quindi funziona anche nel database di PRODUZIONE dopo il deploy.
 *
 * Configurazione (nessuna credenziale hardcoded):
 * - `VIP_ACCOUNT_EMAIL`    (env var, impostata solo dove serve, es. produzione)
 * - `VIP_ACCOUNT_PASSWORD` (secret) — usata SOLO alla creazione dell'account.
 *
 * Comportamento idempotente:
 * - Se l'utente NON esiste: lo crea con email verificata, famiglia propria
 *   (ruolo admin → nessun limite AI) ed entitlement Premium attivo permanente
 *   (expiresAt = null).
 * - Se l'utente esiste già: NON tocca password o dati; garantisce solo che
 *   abbia un entitlement Premium attivo permanente sulla sua famiglia.
 */
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, entitlements } from "../../shared/schema";

const VIP_EMAIL = (process.env.VIP_ACCOUNT_EMAIL || "").trim().toLowerCase();
const VIP_PASSWORD = process.env.VIP_ACCOUNT_PASSWORD || "";
const VIP_PRODUCT_ID = "familysync_vip_lifetime";

export interface EnsureVipResult {
  created: boolean;
  upgraded: boolean;
  skipped: boolean;
  reason?: "disabled" | "missing_password";
  email: string;
}

export async function ensureVipAccount(): Promise<EnsureVipResult> {
  if (!VIP_EMAIL) {
    return { created: false, upgraded: false, skipped: true, reason: "disabled", email: "" };
  }

  return db.transaction(async (tx): Promise<EnsureVipResult> => {
    // Serializza avvii concorrenti (autoscale multi-istanza).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('familysync:vip-account'))`);

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, VIP_EMAIL))
      .limit(1);

    let userId: string;
    let familyId: string | null = null;
    let created = false;

    if (existing) {
      userId = existing.id;
      // Famiglia in cui l'utente è membro (preferendo quelle dove è admin).
      const memberships = await tx
        .select({ familyId: familyMembers.familyId, role: familyMembers.role })
        .from(familyMembers)
        .where(eq(familyMembers.userId, userId));
      const admin = memberships.find((m) => m.role === "admin");
      familyId = (admin || memberships[0])?.familyId ?? null;
      // Assicura che l'email risulti verificata (tutte le /api lo richiedono).
      await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
    } else {
      if (!VIP_PASSWORD) {
        return { created: false, upgraded: false, skipped: true, reason: "missing_password", email: VIP_EMAIL };
      }
      const now = new Date();
      const passwordHash = await bcrypt.hash(VIP_PASSWORD, 10);
      const [user] = await tx
        .insert(users)
        .values({
          email: VIP_EMAIL,
          passwordHash,
          name: "Francesco",
          emailVerified: true,
          // Anche il VIP esprime i consensi al primo accesso (onboarding).
          termsAcceptedAt: null,
          aiFeaturesEnabled: false,
        })
        .returning();
      userId = user.id;
      created = true;
    }

    if (!familyId) {
      const [family] = await tx
        .insert(families)
        .values({
          name: "La Mia Famiglia",
          colorTheme: "#6366F1",
          subscriptionStatus: "premium", // mirror; la verità è in entitlements
        })
        .returning();
      familyId = family.id;
      await tx.insert(familyMembers).values({
        familyId,
        userId,
        role: "admin",
        color: "#6366F1",
      });
    }

    // Entitlement Premium attivo PERMANENTE (expiresAt null): fonte di verità.
    const [ent] = await tx
      .select({ id: entitlements.id, status: entitlements.status, expiresAt: entitlements.expiresAt })
      .from(entitlements)
      .where(and(eq(entitlements.familyId, familyId), eq(entitlements.productId, VIP_PRODUCT_ID)))
      .limit(1);

    let upgraded = false;
    if (!ent) {
      await tx.insert(entitlements).values({
        familyId,
        userId,
        platform: "revenuecat",
        productId: VIP_PRODUCT_ID,
        status: "active",
        expiresAt: null, // permanente, nessuna scadenza
      });
      upgraded = true;
    } else if (ent.status !== "active" || ent.expiresAt !== null) {
      await tx
        .update(entitlements)
        .set({ status: "active", expiresAt: null })
        .where(eq(entitlements.id, ent.id));
      upgraded = true;
    }

    // Mirror dello stato sulla famiglia (coerenza UI).
    await tx.update(families).set({ subscriptionStatus: "premium" }).where(eq(families.id, familyId));

    return { created, upgraded, skipped: false, email: VIP_EMAIL };
  });
}

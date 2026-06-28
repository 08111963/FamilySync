import { listCustomerActiveEntitlements } from "@replit/revenuecat-sdk";
import { getUncachableRevenueCatClient } from "../../scripts/revenueCatClient";
import { config } from "./config";
import { logger } from "./logger";

/**
 * Sincronizzazione server-side da RevenueCat verso la tabella `entitlements`.
 *
 * RevenueCat è il MOTORE degli acquisti store-native. Il client NON decide il
 * Premium: dopo un acquisto/ripristino chiama POST /api/purchases/sync e il
 * backend interroga RevenueCat (REST v2) per AppUserID = familyId, controllando
 * se l'entitlement "premium" è attivo. La fonte operativa del Premium resta la
 * tabella entitlements (isPremium(familyId) la legge dal DB).
 */

export interface RevenueCatEntitlementResult {
  /** L'entitlement "premium" risulta attivo su RevenueCat. */
  active: boolean;
  /** Scadenza dell'accesso (null = nessuna scadenza, es. lifetime). */
  expiresAt: Date | null;
}

/**
 * Verifica se l'entitlement restituito da RevenueCat corrisponde al nostro
 * entitlement "premium". RevenueCat espone `entitlement_id` (id oggetto, es.
 * entl...). Per robustezza confrontiamo sia l'id oggetto sia il lookup_key.
 */
function isPremiumEntitlementId(entitlementId: string): boolean {
  const candidates = [
    config.revenuecat.entitlementRcId,
    config.revenuecat.entitlementId,
    "premium",
  ].filter((v): v is string => !!v);
  return candidates.includes(entitlementId);
}

/**
 * Interroga RevenueCat per lo stato dell'entitlement "premium" della famiglia.
 * AppUserID (customer_id) = familyId.
 *
 * - Customer inesistente su RevenueCat (404) -> nessun premium (active: false).
 * - Errori di rete/API -> rilancia (il chiamante decide come gestirli).
 */
export async function getSubscriberEntitlement(
  familyId: string,
): Promise<RevenueCatEntitlementResult> {
  const projectId = config.revenuecat.projectId;
  if (!projectId) {
    throw new Error("REVENUECAT_PROJECT_ID non configurato");
  }

  const client = getUncachableRevenueCatClient();
  const { data, error, response } = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId, customer_id: familyId },
  });

  if (error) {
    // Customer mai visto da RevenueCat: nessun acquisto -> non premium.
    if (response?.status === 404) {
      return { active: false, expiresAt: null };
    }
    logger.error("RevenueCat listCustomerActiveEntitlements error", {
      status: response?.status,
      error: JSON.stringify(error),
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

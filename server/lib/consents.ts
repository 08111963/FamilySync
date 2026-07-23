import { db } from "../db";
import { consentRecords } from "../../shared/schema";
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../../shared/policy-version";
import { logger } from "./logger";

type ConsentType = "terms" | "ai_features";

/**
 * Registra una variazione di consenso (append-only, GDPR art. 7).
 * - Default fail-safe: un errore di registrazione viene loggato ma non blocca
 *   l'operazione principale (es. signup) — il valore effettivo del consenso
 *   resta comunque su users.aiFeaturesEnabled / termsAcceptedAt.
 * - Con `strict: true` (es. toggle AI in transazione) l'errore viene rilanciato,
 *   così l'operazione principale viene annullata se la prova del consenso non
 *   può essere scritta.
 */
export async function recordConsent(
  userId: string,
  consentType: ConsentType,
  granted: boolean,
  tx?: Pick<typeof db, "insert">,
  options?: { strict?: boolean },
): Promise<void> {
  const now = new Date();
  const policyVersion = consentType === "terms" ? TERMS_VERSION : PRIVACY_POLICY_VERSION;
  try {
    await (tx ?? db).insert(consentRecords).values({
      userId,
      consentType,
      granted,
      policyVersion,
      grantedAt: granted ? now : null,
      revokedAt: granted ? null : now,
    });
  } catch (error) {
    logger.error("Consent record insert failed", { userId, consentType, error: String(error) });
    if (options?.strict) throw error;
  }
}

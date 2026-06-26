/**
 * Politiche di costo AI applicate prima della generazione OpenAI.
 *
 * Prima pubblicazione: il premium è disabilitato, quindi le varianti multiple
 * del piano pasti settimanale (che raddoppierebbero il costo OpenAI a parità di
 * quota consumata) NON sono consentite. Tutti gli utenti ottengono 1 variante.
 */
export const MEAL_PLAN_MAX_VARIANTS = 1;

/**
 * Normalizza il numero di varianti richieste per il piano pasti settimanale,
 * limitandolo a MEAL_PLAN_MAX_VARIANTS. Qualsiasi input non valido → 1.
 */
export function resolveMealPlanVariants(raw: unknown): number {
  const requested = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 1;
  if (requested < 1) return 1;
  return Math.min(requested, MEAL_PLAN_MAX_VARIANTS);
}

-- Prova gratuita a tempo per gli account tester.
-- Aggiunge entitlements.trial_days: se valorizzato, l'entitlement e una prova
-- che parte dal primo login (status "pending" -> "active", expires_at = now + N giorni).
ALTER TABLE "entitlements" ADD COLUMN IF NOT EXISTS "trial_days" integer;

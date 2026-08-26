-- Le funzioni AI e la gestione delle allergie non hanno più toggle separati.
-- I profili bambino e gli account eliminati restano esclusi dai percorsi AI
-- tramite i controlli applicativi lato server.
ALTER TABLE "users" ALTER COLUMN "ai_features_enabled" SET DEFAULT true;
ALTER TABLE "users" ALTER COLUMN "ai_health_consent" SET DEFAULT true;

UPDATE "users"
SET
  "ai_features_enabled" = true,
  "ai_health_consent" = true
WHERE "is_child_account" IS NOT TRUE
  AND "deleted_at" IS NULL;
-- Accesso bambino con codice PIN (senza email).
-- users.is_child_account: account "dispositivo bambino" creato attivando un
-- codice generato dal genitore; gli endpoint vietati rifiutano questi account.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_child_account" boolean DEFAULT false NOT NULL;

-- Codici di accesso: solo hash nel DB, monouso, a scadenza, revocabili.
CREATE TABLE IF NOT EXISTS "child_access_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "family_members"("id") ON DELETE CASCADE,
  "code_hash" varchar(255) NOT NULL UNIQUE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "child_access_codes_member_idx" ON "child_access_codes" ("member_id");

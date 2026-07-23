-- Login social (Google/Apple): la password diventa opzionale e tracciamo il provider
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" varchar(20);

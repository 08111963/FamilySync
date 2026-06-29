/**
 * Migration runner sicuro per produzione: applica migrations/0001_add_users_deleted_at.sql.
 *
 * Esegue l'ALTER TABLE idempotente (ADD COLUMN IF NOT EXISTS) su DATABASE_URL.
 * Puo essere eseguito piu volte senza effetti collaterali.
 *
 * Uso:  npx tsx scripts/migrate-deleted-at.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL non impostata");
  }
  await db.execute(
    sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`
  );
  console.log('Migration applicata: users.deleted_at presente.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration fallita:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

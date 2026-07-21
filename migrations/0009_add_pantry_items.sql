CREATE TABLE IF NOT EXISTS "pantry_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "normalized_name" varchar(255) NOT NULL,
  "quantity" numeric,
  "unit" varchar(10),
  "category" varchar(50) DEFAULT 'food' NOT NULL,
  "expiry_date" date,
  "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pantry_items_family_idx"
  ON "pantry_items" ("family_id", "normalized_name");

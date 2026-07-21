CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "member_id" uuid REFERENCES "family_members"("id") ON DELETE SET NULL,
  "amount" numeric(10,2) NOT NULL,
  "category" varchar(30) NOT NULL,
  "description" varchar(255),
  "date" date NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "expenses_family_date_idx"
  ON "expenses" ("family_id", "date");

CREATE TABLE IF NOT EXISTS "family_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "category" varchar(30) DEFAULT 'total' NOT NULL,
  "monthly_limit" numeric(10,2) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "family_budgets_family_category_uq" UNIQUE ("family_id", "category")
);

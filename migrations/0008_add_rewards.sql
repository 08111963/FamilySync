CREATE TABLE IF NOT EXISTS "rewards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "description" text,
  "points_cost" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reward_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "reward_id" uuid NOT NULL REFERENCES "rewards"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "family_members"("id") ON DELETE CASCADE,
  "reward_title" varchar(200) NOT NULL,
  "points_spent" integer NOT NULL,
  "redeemed_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "reward_redemptions_family_redeemed_idx"
  ON "reward_redemptions" ("family_id", "redeemed_at");

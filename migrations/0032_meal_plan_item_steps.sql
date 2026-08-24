ALTER TABLE "meal_plan_items"
  ADD COLUMN IF NOT EXISTS "steps" jsonb;
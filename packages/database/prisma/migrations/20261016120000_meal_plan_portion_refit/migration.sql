-- Day rebalance (2026-10-16): last portion refit after a target change (additive).
ALTER TABLE "meal_plans" ADD COLUMN "portionRefit" JSONB;

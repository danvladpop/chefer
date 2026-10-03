-- OWNER-RUN DATA FIX (WP-01, UX-PLAN-02). NOT a Prisma migration: deploys use
-- `prisma db push`, which never applies migration files, so this must be run by
-- hand once, after the WP-01 deploy, against production:
--   ssh chefer
--   docker exec -i chefer-postgres psql -U chefer -d chefer < 2026-10-03-two-of-us-eater-portion.sql
-- Take a backup first. Safe to re-run (idempotent). Skipping it only means legacy
-- "two of us" slots stay at 2x until that plan is regenerated.
--
-- UX-PLAN-02: a plan slot's `portion` is now the EATER's calorie-driven share
-- only; "How you cook: two of us" is a table multiplier applied by Shop, the
-- cost chip and cook mode at read time. Until now the planner overwrote every
-- slot's portion with 2 for those users, which doubled their own calories and
-- "I ate this" logs.
--
-- Data fix (idempotent): for users whose "cooking for" is 2, a stored slot with
-- portion exactly 2 is the old table override, so drop it (absent = 1x, the
-- eater's own portion). The original per-eater portion was never stored, so 1x
-- is the honest value; a regenerate recomputes it from the user's targets.
-- Slots with any other portion (edited since) and every other user are
-- untouched.
UPDATE "meal_plan_days" AS d
SET "meals" = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(m -> 'portion') = 'number' AND (m ->> 'portion')::numeric = 2
          THEN m - 'portion'
        ELSE m
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(d."meals") WITH ORDINALITY AS t(m, ord)
)
FROM "meal_plans" AS p
JOIN "dietary_preferences" AS dp ON dp."userId" = p."userId"
WHERE d."mealPlanId" = p."id"
  AND dp."cookingFor" = 2
  AND jsonb_typeof(d."meals") = 'array'
  AND d."meals" @> '[{"portion": 2}]'::jsonb;

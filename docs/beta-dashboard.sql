-- ============================================================================
-- Chefer beta dashboard (WP-13, UX-PO-02) — plain SQL against OUR OWN tables.
-- Not PostHog: it works with mobile analytics off and counts every account,
-- consent or not, because it reads data the app already stores to run.
-- Read-only: SELECTs only. No DDL, no temp views (psql cannot share a CTE
-- across statements, so each query repeats the same `value_events` CTE —
-- keep the four copies identical when you edit one).
--
-- Run (local):
--   docker exec -i chefer-postgres psql -U postgres -d chefer < docs/beta-dashboard.sql
-- Choose the cohort and exclusions (psql variables; defaults are below):
--   psql "$DATABASE_URL" -v cohort_start=2026-10-15 -v exclude_email_like='%@chefer.dev' \
--        -f docs/beta-dashboard.sql
--
-- Parameters
--   cohort_start        first signup date (UTC) of the beta cohort. Used for the
--                       cohort-based queries (2, 3) and as the first day shown by
--                       the activity queries (1, 4).
--   exclude_email_like  SQL LIKE pattern of internal accounts to leave out (the
--                       seed/test accounts end in @chefer.dev).
--
-- What counts as a "value event" (one row = one user on one day). All dates are
-- UTC dates of the stored timestamp, except food and workout, which use the
-- day the user logged FOR / the device-local day of the session:
--   food_log        daily_logs row with at least one logged meal (date)
--   workout         workout_sessions with status COMPLETED (localDate)
--   plan_generated  meal_plans the user generated, restored or built
--                   (origin = USER, not a template). Carry-forward copies,
--                   applied templates and the Sunday auto-plan are NOT the
--                   user doing something, so they are left out.
--   recipe_rated    meal_ratings (ratedAt). The server keeps no record of "cook
--                   mode finished", so a rating is the closest stored sign that
--                   a recipe was cooked; the app-side `cook_finished` event
--                   (PostHog, once a key is set) is the real count.
-- Food = food_log + plan_generated + recipe_rated; Gym = workout.
-- Caveats: a food log's `date` can be back-filled, so "daily actives" counts the
-- day eaten, not the day the app was opened. A user who only opens the app
-- is not active. Re-run any time; nothing here writes.
-- ============================================================================

-- Belt and braces: whatever happens below, this session cannot write.
SET default_transaction_read_only = on;

\if :{?cohort_start}
\else
  \set cohort_start '2026-10-01'
\endif
\if :{?exclude_email_like}
\else
  \set exclude_email_like '%@chefer.dev'
\endif

\echo
\echo '== 1. Daily actives (any value event), per day since cohort_start =========='

WITH value_events AS (
  SELECT dl."userId" AS user_id, dl."date"::date AS day, 'food_log' AS kind
    FROM daily_logs dl
   WHERE dl."loggedMeals"::text NOT IN ('[]', '{}', 'null')
  UNION ALL
  SELECT ws."userId", ws."localDate"::date, 'workout'
    FROM workout_sessions ws
   WHERE ws.status = 'COMPLETED'
  UNION ALL
  SELECT mp."userId", mp."createdAt"::date, 'plan_generated'
    FROM meal_plans mp
   WHERE mp.origin = 'USER' AND NOT mp."isTemplate"
  UNION ALL
  SELECT mr."userId", mr."ratedAt"::date, 'recipe_rated'
    FROM meal_ratings mr
),
real_events AS (
  SELECT ve.*
    FROM value_events ve
    JOIN users u ON u.id = ve.user_id
   WHERE u.email NOT LIKE :'exclude_email_like'
     AND ve.day >= :'cohort_start'::date
     AND ve.day <= current_date
)
SELECT d.day::date                                              AS day,
       count(DISTINCT e.user_id)                                AS daily_actives,
       count(DISTINCT e.user_id) FILTER (WHERE e.kind = 'food_log')       AS food_loggers,
       count(DISTINCT e.user_id) FILTER (WHERE e.kind = 'workout')        AS workouts,
       count(DISTINCT e.user_id) FILTER (WHERE e.kind = 'plan_generated') AS plan_generators,
       count(DISTINCT e.user_id) FILTER (WHERE e.kind = 'recipe_rated')   AS recipe_raters
  FROM generate_series(:'cohort_start'::date, current_date, interval '1 day') AS d(day)
  LEFT JOIN real_events e ON e.day = d.day::date
 GROUP BY d.day
 ORDER BY d.day;

\echo
\echo '== 2. Activation: a value event on 2+ distinct days in the first 7 days ===='
\echo '   (day 0 = signup day; only users whose 7 days are over are judged)'

WITH value_events AS (
  SELECT dl."userId" AS user_id, dl."date"::date AS day, 'food_log' AS kind
    FROM daily_logs dl
   WHERE dl."loggedMeals"::text NOT IN ('[]', '{}', 'null')
  UNION ALL
  SELECT ws."userId", ws."localDate"::date, 'workout'
    FROM workout_sessions ws
   WHERE ws.status = 'COMPLETED'
  UNION ALL
  SELECT mp."userId", mp."createdAt"::date, 'plan_generated'
    FROM meal_plans mp
   WHERE mp.origin = 'USER' AND NOT mp."isTemplate"
  UNION ALL
  SELECT mr."userId", mr."ratedAt"::date, 'recipe_rated'
    FROM meal_ratings mr
),
cohort AS (
  SELECT u.id AS user_id,
         u."createdAt"::date AS signup_day,
         date_trunc('week', u."createdAt")::date AS signup_week
    FROM users u
   WHERE u."createdAt"::date >= :'cohort_start'::date
     AND u.email NOT LIKE :'exclude_email_like'
),
per_user AS (
  SELECT c.user_id, c.signup_week,
         (c.signup_day + 7 <= current_date) AS window_closed,
         count(DISTINCT ve.day) AS active_days_first_7
    FROM cohort c
    LEFT JOIN value_events ve
      ON ve.user_id = c.user_id
     AND ve.day >= c.signup_day
     AND ve.day <  c.signup_day + 7
   GROUP BY c.user_id, c.signup_week, c.signup_day
)
SELECT to_char(signup_week, 'YYYY-MM-DD')                         AS signup_week,
       count(*)                                                   AS signups,
       count(*) FILTER (WHERE window_closed)                      AS judged,
       count(*) FILTER (WHERE window_closed AND active_days_first_7 >= 2) AS activated,
       round(100.0 * count(*) FILTER (WHERE window_closed AND active_days_first_7 >= 2)
             / nullif(count(*) FILTER (WHERE window_closed), 0), 1)       AS activation_pct
  FROM per_user
 GROUP BY signup_week
UNION ALL
SELECT 'ALL',
       count(*),
       count(*) FILTER (WHERE window_closed),
       count(*) FILTER (WHERE window_closed AND active_days_first_7 >= 2),
       round(100.0 * count(*) FILTER (WHERE window_closed AND active_days_first_7 >= 2)
             / nullif(count(*) FILTER (WHERE window_closed), 0), 1)
  FROM per_user
 ORDER BY 1;

\echo
\echo '== 3. Weekly retention by signup week ======================================'
\echo '   (week N = days 7N..7N+6 after each user''s own signup day; week 0 = first'
\echo '    7 days. A cell appears only once that week is over for every user in it.)'

WITH value_events AS (
  SELECT dl."userId" AS user_id, dl."date"::date AS day, 'food_log' AS kind
    FROM daily_logs dl
   WHERE dl."loggedMeals"::text NOT IN ('[]', '{}', 'null')
  UNION ALL
  SELECT ws."userId", ws."localDate"::date, 'workout'
    FROM workout_sessions ws
   WHERE ws.status = 'COMPLETED'
  UNION ALL
  SELECT mp."userId", mp."createdAt"::date, 'plan_generated'
    FROM meal_plans mp
   WHERE mp.origin = 'USER' AND NOT mp."isTemplate"
  UNION ALL
  SELECT mr."userId", mr."ratedAt"::date, 'recipe_rated'
    FROM meal_ratings mr
),
cohort AS (
  SELECT u.id AS user_id,
         u."createdAt"::date AS signup_day,
         date_trunc('week', u."createdAt")::date AS signup_week
    FROM users u
   WHERE u."createdAt"::date >= :'cohort_start'::date
     AND u.email NOT LIKE :'exclude_email_like'
),
sizes AS (
  SELECT signup_week, count(*) AS cohort_size, max(signup_day) AS last_signup_day
    FROM cohort GROUP BY signup_week
),
active AS (
  SELECT c.signup_week,
         ((ve.day - c.signup_day) / 7) AS week_n,
         count(DISTINCT c.user_id) AS active_users
    FROM cohort c
    JOIN value_events ve
      ON ve.user_id = c.user_id AND ve.day >= c.signup_day
   GROUP BY c.signup_week, ((ve.day - c.signup_day) / 7)
)
SELECT to_char(s.signup_week, 'YYYY-MM-DD') AS signup_week,
       s.cohort_size,
       n.week_n,
       coalesce(a.active_users, 0) AS active_users,
       round(100.0 * coalesce(a.active_users, 0) / s.cohort_size, 1) AS retention_pct
  FROM sizes s
 CROSS JOIN generate_series(0, 12) AS n(week_n)
  LEFT JOIN active a ON a.signup_week = s.signup_week AND a.week_n = n.week_n
 WHERE s.last_signup_day + 7 * (n.week_n + 1) <= current_date
 ORDER BY s.signup_week, n.week_n;

\echo
\echo '== 4. Food vs gym usage split, per week ===================================='
\echo '   (users active that week: food only / gym only / both; plus event counts)'

WITH value_events AS (
  SELECT dl."userId" AS user_id, dl."date"::date AS day, 'food_log' AS kind
    FROM daily_logs dl
   WHERE dl."loggedMeals"::text NOT IN ('[]', '{}', 'null')
  UNION ALL
  SELECT ws."userId", ws."localDate"::date, 'workout'
    FROM workout_sessions ws
   WHERE ws.status = 'COMPLETED'
  UNION ALL
  SELECT mp."userId", mp."createdAt"::date, 'plan_generated'
    FROM meal_plans mp
   WHERE mp.origin = 'USER' AND NOT mp."isTemplate"
  UNION ALL
  SELECT mr."userId", mr."ratedAt"::date, 'recipe_rated'
    FROM meal_ratings mr
),
real_events AS (
  SELECT ve.user_id,
         date_trunc('week', ve.day)::date AS week,
         (ve.kind = 'workout') AS is_gym
    FROM value_events ve
    JOIN users u ON u.id = ve.user_id
   WHERE u.email NOT LIKE :'exclude_email_like'
     AND ve.day >= :'cohort_start'::date
     AND ve.day <= current_date
),
per_user AS (
  SELECT week, user_id,
         bool_or(NOT is_gym) AS did_food,
         bool_or(is_gym)     AS did_gym,
         count(*) FILTER (WHERE NOT is_gym) AS food_events,
         count(*) FILTER (WHERE is_gym)     AS gym_events
    FROM real_events
   GROUP BY week, user_id
)
SELECT to_char(week, 'YYYY-MM-DD')                           AS week,
       count(*)                                              AS active_users,
       count(*) FILTER (WHERE did_food AND NOT did_gym)      AS food_only,
       count(*) FILTER (WHERE did_gym AND NOT did_food)      AS gym_only,
       count(*) FILTER (WHERE did_food AND did_gym)          AS both,
       round(100.0 * count(*) FILTER (WHERE did_gym) / count(*), 1) AS gym_share_pct,
       sum(food_events)                                      AS food_events,
       sum(gym_events)                                       AS gym_events
  FROM per_user
 GROUP BY week
 ORDER BY week;

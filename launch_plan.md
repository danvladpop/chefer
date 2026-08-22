# Chefer — Launch Plan: Production-Ready with a Soft Paywall

> **Author:** 2026-08-21. Companion to [`roadmap.md`](./roadmap.md).
> **Structure decision:** one new file (this one), not two. "Production-ready" and "premium that
> earns the upgrade" converge on the same milestone — you cannot launch a paywall on an app whose
> quality gates fail, and hardening an app whose premium tier isn't worth paying for launches
> nothing. This file is the **milestone plan**: it sequences existing `roadmap.md` tickets (by ID,
> not duplicated) and adds the paywall-specific tickets (`PW-*`) that exist nowhere else.
> `roadmap.md` remains the master backlog and single source of ticket specs.

---

## 1. The Goal

Ship a production-grade Chefer where:

1. **The soft paywall is live** — `planTier` stays a DB flag (it already exists:
   `schema.prisma:100`, `premiumProcedure`, `user.upgradePlan`). No payment integration yet.
2. **Every premium feature works great and is worth paying for.** The flag is only "soft" on the
   billing side — the _value_ side must be real, because Phase C (Stripe, roadmap P2-1) changes
   nothing except how the flag gets set. If premium isn't compelling under the soft paywall, a
   hard paywall just adds a price to something nobody wants.
3. **The app survives production**: gates green, CI gating deploys, rate limits, error tracking,
   backups, no PII leaks.

## 2. What "premium" means (target feature matrix)

The single most important product decision in this plan. Current state has premium gating
_safety_ (allergies), which is wrong — see roadmap §4.2(a). Target split:

| Capability                                         | FREE                                                        | PREMIUM                                               |
| -------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Weekly plan generation                             | Curated pool, **filtered by allergies/restrictions** (P1-2) | AI-personalised to body metrics, goal, calorie target |
| Plans that learn (ratings, pinned favourites)      | —                                                           | ✅ (P1-1)                                             |
| Meal swaps                                         | Curated, same meal type                                     | AI alternative honouring preferences                  |
| Profile: allergies, restrictions, dislikes         | ✅ (moves free in P1-2)                                     | ✅                                                    |
| Profile: body metrics, goal, calorie/macro targets | —                                                           | ✅                                                    |
| Shopping list                                      | Deterministic merge + prices                                | AI-consolidated + prices                              |
| Budget-aware planning ("keep my week under €X")    | See total only                                              | ✅ generation honours budget (P2-4)                   |
| AI chef chat                                       | 5 messages/day                                              | Unlimited, with tools (P1-4)                          |
| Weekly auto-generation ("your week is ready")      | —                                                           | ✅ (PW-5)                                             |
| Recipes, favourites, tracker, progress, cook mode  | ✅                                                          | ✅                                                    |
| Plan generations per day                           | 3                                                           | 20                                                    |

**Rule of thumb:** free = a safe, usable, generic meal planner. Premium = _it knows you_.
Everything gated must answer "does this get better because the app knows me?" — if not, it's free.

## 3. Phases

### Phase A — Stabilise (production readiness)

All from `roadmap.md`, in this order:

| Step | Ticket              | What                                                                                                                                                                                                                             |
| ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | **P0-0**            | Repair the quality gates (lint/test/typecheck/e2e) — **✅ done, see §6**                                                                                                                                                         |
| A2   | **P0-2** ✅         | Delete `/user` PII leak, close public read, guard `/ingredients` — done 2026-08-21                                                                                                                                               |
| A3   | **P0-1** ✅         | Fix dashboard next-meal logic — done 2026-08-21, verified live at 19:40 (dinner hero)                                                                                                                                            |
| A4   | **P0-3** ✅         | CI on `master`, deploys gated on green — done 2026-08-21; branch protection = user's manual step                                                                                                                                 |
| A5   | **P0-4** ✅         | Rate limiting + helmet + per-user AI quotas — done 2026-08-21, all limits verified live (429s)                                                                                                                                   |
| A6   | **P0-5** ✅         | Unify calorie target — done 2026-08-21 via `resolveDailyTargets()`; custom macroSplit column deferred (goal-based splits already personalise)                                                                                    |
| A7   | **P0-6** ✅         | Password reset — done 2026-08-21; full flow verified live incl. session invalidation + single-use tokens                                                                                                                         |
| A8   | **P0-7 / P0-8** ✅  | Refactor + test foundation — done 2026-08-21; 37 api tests, coverage ratchet (25% floor → 60% target), all query paths verified live                                                                                             |
| A9   | **P2-2** ✅         | Observability — done 2026-08-22: Sentry both apps (verified deliveries), pino structured request logs w/ requestId, PostHog EU wired (pageviews + identify verified, `/e/` 200). Sentry alert rules + dashboards land with PW-3. |
| A10  | **P0-9 / P0-10** ✅ | Stale docs + mobile a11y — done 2026-08-21; also fixed a shopping-list overflow (missing min-w-0) and the never-passing chart-tooltip spec found on the way                                                                      |

**Also in Phase A, not previously ticketed:**

- **A11 — Backup verification `S` ✅ done 2026-08-22:** nightly cron installed on the VM (03:00 UTC,
  14-dump retention), restore rehearsed into a scratch DB (all row counts matched live), RPO/RTO +
  the same-disk gap documented in `infrastructure.md` §12.
- **A12 — Uptime monitoring `S` 🟡 code-side done 2026-08-22:** public `/api/health` now routes to
  the API (real API+DB check, 503 on DB failure) and deploy-verify polls it plus the homepage.
  **Remaining manual step (user):** create the UptimeRobot free account + the two monitors per
  `infrastructure.md` §12 "Uptime monitoring".

### Phase B — Premium value + soft paywall

| Step | Ticket                | What                                                                                         |
| ---- | --------------------- | -------------------------------------------------------------------------------------------- |
| B1   | **PW-1** (new, below) | Feature matrix as code — one source of truth for what's gated                                |
| B2   | **P1-2**              | Free tier safe (allergies free, curated pool filtered, contextual upsell)                    |
| B3   | **P1-1**              | Plans that learn — the premium flagship                                                      |
| B4   | **P1-4**              | Real AI chat with tools, free taste (5/day)                                                  |
| B5   | **P2-4**              | Budget-aware plans + cost visibility (free sees, premium controls)                           |
| B6   | **PW-5** (new, below) | Weekly auto-generation for premium                                                           |
| B7   | **PW-2** (new, below) | Soft-paywall mechanics: tier management + upgrade touchpoints                                |
| B8   | **PW-3** (new, below) | Upgrade funnel instrumentation                                                               |
| B9   | **P1-5**              | Synced shopping-list check-off (retention support, cheap)                                    |
| B10  | **P1-3 / P1-6**       | Cook mode + real-device sweep (both tiers; drives the daily habit that upsells convert from) |

### Phase C — Hard paywall (later, out of this milestone)

**P2-1** (Stripe). By design, Phase C only changes _how `planTier` gets set_: Checkout + webhooks
replace the self-serve flag flip, `user.upgradePlan` is deleted, everything built in Phase B
carries over untouched. Gate on Phase B metrics: don't add a price until ≥ 25% of active free
users hit an upgrade touchpoint weekly and premium W4 retention beats free by a clear margin.

---

## 4. New tickets (PW-\*)

### `PW-1` — Feature matrix as code · `M`

**Problem:** what's premium is currently scattered — 3 `premiumProcedure` uses, tier branches
inside `MealPlanService`, a hardcoded perks array in `UpgradeButton.tsx`. Adding or moving a gate
means hunting.

**Steps:**

1. `packages/types/src/plan-features.ts`: a typed `PLAN_FEATURES` map — feature key → `{ free:
boolean | limit, premium: boolean | limit, label, description }`. This is the file product
   edits when the matrix changes.
2. API: `entitlements.ts` helper — `hasFeature(user, key)` / `getLimit(user, key)` — used by
   `premiumProcedure`, the tier branches, and the P0-4 quota middleware. Admins keep implicit
   premium.
3. Web: `useEntitlement(key)` hook wrapping `useIsPremium` + the map; `UpgradeButton` perks list
   and the preferences/onboarding upgrade panels render **from the map**, so marketing copy and
   enforcement can't drift.
4. `business_flow.md` §9 documents the matrix by reference to the file, not by copying it.

**Acceptance:** one file answers "what does premium get"; changing a limit there changes
enforcement and UI copy together.

### `PW-2` — Soft-paywall mechanics · `M`

**Steps:**

1. Keep `user.upgradePlan` for the soft phase, but move it behind a confirm dialog that sets
   expectations ("free during beta").
2. Add `user.downgradePlan` (self-service) — needed to test both sides of every gate, and honest
   during a free beta.
3. Add `user.setPlanTier` (`adminProcedure`) + a minimal `/admin/users` page (roadmap already
   notes `user.list` has no UI): search user, flip tier, see AI usage. This is the "DB flag that
   can be changed" without SSH-ing into prod psql.
4. Upgrade touchpoints at **moments of need**, all rendering from PW-1's map:
   - curated-pool exhaustion under restrictions (P1-2's upsell),
   - AI quota hit (P0-4's `TOO_MANY_REQUESTS`),
   - chat message limit,
   - locked preferences sections (metrics/goal),
   - swap button on free tier ("get an AI alternative that fits your macros").
5. Every touchpoint uses one shared `UpgradePrompt` component (Sheet-based, per P0-10) with a
   `source` prop — feeds PW-3.

**Acceptance:** both tier directions flippable from the UI (self + admin); every gate in the app
shows the same upgrade surface with a tracked source.

### `PW-3` — Upgrade funnel instrumentation · `S` · needs A9

Events: `upgrade_prompt_shown {source}`, `upgrade_clicked {source}`, `upgrade_completed`,
`downgrade_completed`, plus per-feature usage events for everything in the PW-1 matrix.
Dashboard: prompt→click→complete by source; premium vs free W1/W4 retention; feature usage by
tier. **This is the data Phase C's pricing decision comes from.**

### `PW-5` — Weekly auto-generation for premium · `M` · needs P1-1

The premium subset of roadmap P2-3 (email/push infrastructure stays in P2-3):

1. `WeeklyPlanWorker` — mirrors the existing worker patterns (`recipe-image.worker.ts`) — runs
   Sunday, pre-generates next week's plan for premium users with a complete profile, honouring
   pinned favourites and rating signals (P1-1).
2. Dashboard banner Monday morning: "Your week is ready — built from N dishes you rated."
3. Respect the P0-4 quotas (worker generations don't consume the user's daily allowance).

**Acceptance:** a premium user who did nothing on Sunday opens the app Monday to a fresh,
personalised, image-complete plan. That experience — _it cooked for me while I slept_ — is the
upgrade pitch in one sentence.

---

## 5. Definition of Done (launch checklist)

- [x] `pnpm lint && pnpm typecheck && pnpm test` exit 0 from a clean clone (A1)
- [ ] CI green required to deploy ✅; **branch protection still off — user's manual step** (A4)
- [x] No public endpoint returns another user's PII (A2)
- [x] Auth endpoints rate-limited; AI spend capped per user per day (A5)
- [x] Password reset works end-to-end (A7)
- [ ] Sentry receiving ✅; backup restore rehearsed ✅ 2026-08-22; **uptime monitor: `/api/health` routing live, UptimeRobot signup = user's manual step** (A9, A11, A12)
- [x] Free user with allergies gets a safe plan on day one (B2)
- [x] Premium plan visibly reflects ratings + pins; generation screen says so (B3)
- [x] All upgrade touchpoints live, sourced, and measured (B7, B8)
- [x] Feature matrix exists in one file and drives both enforcement and copy (B1)
- [x] Funnel dashboard shows prompt→upgrade conversion by source (B8) — PostHog "Upgrade funnel" dashboard + Sentry alerts built 2026-08-22, see `docs/analytics-funnel.md`

---

## 6. Progress

| Step              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (P0-0)         | ✅ 2026-08-21 — six workspaces wired to the shared ESLint config, lint 0 errors (64 warnings ratcheted); typecheck 7/7; `ignoreBuildErrors` removed, `next build` type-checks again; 33 unit tests; `home.spec.ts` 17/17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| bug sweep         | ✅ 2026-08-22 — pre-Phase-B user-reported fixes: auth-page phone scroll, upgrade banner not clearing (server-component refresh), stale query cache across account switches, sticky `0` in numeric inputs, Shopping & Delivery removed from Preferences, save→dashboard redirect, All-Recipes heart (`recipe.list` now returns `isFavourite`); plus AI nutrition autofill, profile-completion nudge, goal calorie badges, user-menu links. HTTPS report could not be reproduced (prod serves valid TLS; http 308s to https)                                                                                                                                                                                                                                                                                                                                                                    |
| B1 (PW-1)         | ✅ 2026-08-22 — `PLAN_FEATURES` matrix in `packages/types/src/plan-features.ts`; API `lib/entitlements.ts` (`isPremiumUser`/`hasFeature`/`getLimit`) backs `premiumProcedure`, the tier branches and `lib/quotas.ts` (no direct `planTier` compare left in the API); web `useEntitlement` hook; UpgradeButton/UpgradeCard perk lists render from `PREMIUM_PERK_KEYS`; unit-tested; `business_flow.md` §9 documents by reference                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B2 (P1-2)         | ✅ 2026-08-22 — safety is free: `preferences.updateSafety` (protected) split from `updateTargets` (premium); curated pool expanded 22 → 64 recipes with accurate tags; `lib/curated-recipes/safety.ts` filters free generation AND free swaps (allergen synonym matching + tag-AND-ingredient restriction rules, mis-tags fail safe); pool exhaustion throws `PRECONDITION_FAILED` → contextual upsell banner; free onboarding = 2-step safety flow; preferences page shows editable safety + locked targets for free users; coverage pinned by `safety.test.ts`; verified live (vegan+peanut plan all-compliant, vegan+keto → upsell)                                                                                                                                                                                                                                                        |
| B3 (P1-1)         | ✅ 2026-08-22 — plans learn: premium generation loads pinned favourites (`findPinnedForNextPlan`) + 20 most recent ratings (`findSignalsForUser`); liked/disliked dishes steer the Gemini prompt; pinned recipes REPLACE matching slots verbatim post-generation (meal type inferred from recent plans, spread across the week, rows not re-upserted); `useInNextPlan` cleared after success; response `personalisation` drives the "Built for you from N dishes you rated and M pinned favourites" banner; unit-tested (prompt + placement + flag clearing); verified live against real Gemini (pin placed, banner shown, flag cleared)                                                                                                                                                                                                                                                      |
| B4 (P1-4)         | ✅ 2026-08-22 — the AI chef is real: ChatService on the API (`POST /api/chat`, session-auth, plain-text streaming) builds per-message context from live data (today's meals+macros, targets, safety prefs, ratings) and gives Gemini tools — `swapMeal` performs a real plan swap, `scaleRecipe` rescales quantities; FREE 5 msgs/day from the matrix (over-quota streams the upgrade message); mock echoes the same context+tools; `apps/web` no longer imports Prisma (Rule 1 exception gone). Verified live: protein question answered 77.3g matching the dashboard; chat swap persisted to the DB. Deferred: `addToShoppingList` tool (needs a custom-items overlay on the derived list — pairs with P1-5) — **delivered 2026-08-22**, see the post-B follow-ups row                                                                                                                      |
| B5 (P2-4)         | ✅ 2026-08-22 (scoped) — cost visibility + budget: every `WeekPlanDto` carries `estimatedCost` from the price vocabulary (`application/shared/plan-cost.ts`); meal-plan page shows the week-cost chip on every tier; `ChefProfile.weeklyBudgetEur` (premium, Preferences → Weekly Budget) feeds the prompt as a hard constraint and the page warns with the overage when the estimate exceeds it; `budgetAwarePlanning` added to PLAN_FEATURES (upsell). Verified live: €80.87 chip, €60 budget → amber warning with €20.87 overage. Deferred from roadmap P2-4: currency conversion end-to-end (needs an FX-rate source; EUR-only until then), cost-per-serving on recipe cards + cost sort, and a cost-feedback regenerate loop (Gemini can't see our price table, so the prompt constraint is soft — the warning is the honest fallback)                                                   |
| B6 (PW-5)         | ✅ 2026-08-22 — `WeeklyPlanWorker`: hourly tick, acts Sundays ≥08:00 UTC; pre-generates NEXT week for `planTier=PREMIUM` users with complete profiles via the full premium path (ratings+pins+budget+safety all apply); idempotent from data (`findByWeekStart` skip), per-user failures don't starve the sweep, router quotas don't apply to worker calls; `dashboard.summary.weekReady` + Monday banner "Your week is ready — built from N dishes you rated"; `weeklyAutoGeneration` added to PLAN_FEATURES (upsell). Verified live: forced-Sunday sweep generated 1/1 (Alice, real Gemini), second run 0 (idempotent). Note: email/push notification lands with roadmap P2-3 as planned                                                                                                                                                                                                    |
| B7 (PW-2)         | ✅ 2026-08-22 — soft-paywall mechanics: `user.downgradePlan` (self-service, inline confirm on /profile), `user.setPlanTier` + `user.aiCallsToday` behind a new `/admin/users` page (search, tier flip, today's AI usage; admin menu link); upgrade dialog copy says "free during the beta"; ONE shared UpgradeButton/UpgradeCard with a required `source` prop across all 9 touchpoints (sidebar, mobile-drawer, meal-plan-banner, pool-exhaustion, shopping-list, preferences-locked, onboarding, profile-page, swap — the new free-swap hint), firing `upgrade_prompt_shown/clicked/completed {source}` + `downgrade_completed` into PostHog (PW-3's raw input). Verified live: admin flip Bob FREE→PREMIUM, Bob self-downgrade back. Chat-quota touchpoint stays a text reply for now (converts to the shared surface with PW-3) — **converted 2026-08-22**, see the post-B follow-ups row |
| B8 (PW-3)         | ✅ 2026-08-22 — funnel + usage instrumentation: `identify(userId, {planTier})`; per-feature events (`plan_generated{tier}`, `meal_swapped{tier}`, `chat_message_sent`, `shopping_list_regenerated`, `preferences_saved`, `recipe_rated`, `recipe_pinned`, `pool_exhausted`) on top of PW-2's sourced upgrade events; **fixed a real P1-1 gap found on the way — `useInNextPlan` had no UI**, the recipe page now has a Pin-for-next-plan toggle (`recipe.isSaved` returns pin state). Event dictionary + one-time PostHog dashboard (funnel by source, premium-vs-free W1/W4 retention, usage by tier) + Sentry alert rules (deferred from A9) documented as ☐ manual steps in `docs/analytics-funnel.md`                                                                                                                                                                                     |
| B9 (P1-5)         | ✅ 2026-08-22 — synced shopping-list check-off: `ShoppingList.checkedKeys` column; `shoppingList.toggleItems { planId, keys[], checked }` with per-key add/remove under a SERIALIZABLE transaction + retry (first manual test caught the read-modify-write race dropping keys — fixed before shipping); bare rows hold check state without shadowing the derived list (only `aiGenerated` rows are an item source); optimistic client toggle with rollback; AI regenerate clears stale keys; one-time localStorage migration then local clear. Verified live: 4 rapid toggles all persisted, fresh reload shows 4/83, migration pushed legacy keys and emptied localStorage                                                                                                                                                                                                                   |
| B10 (P1-3/P1-6)   | 🟡 2026-08-22 — cook mode BUILT + emulation-verified: `/recipes/[id]/cook` full-screen stepper (large type, swipe + clamped tap navigation — a rapid-tap overrun was caught and fixed in testing), wake lock w/ visibility reacquire, inline timers (range upper bound, ≤4h cap, Android vibration), servings scaler + ingredients drawer in the user's unit system, "Made it!" → appends 1 serving to today's DailyLog (verified: 385 kcal breakfast row) → star rating (verified: 5★ persisted, feeds P1-1); entry points on the recipe page + dashboard hero. **P1-6 remains: the real-device sweep is the user's** — full checklist in `docs/device-checklist.md` (wake lock, swipe vs back-gesture, zoom-on-focus, dvh, keyboard-vs-sticky-bars, reduced motion + regression checks for this phase's surfaces)                                                                           |
| prod follow-ups   | 🟡 2026-08-22 — tracked in [`docs/prod-followups.md`](./docs/prod-followups.md). **#1 (the `/meal-plan` #418 stall) FIXED + verified on prod** same day: lazily-hydrated `loading.tsx` boundary vs already-resolved react-query cache; `useHasMounted()` gate on `/meal-plan` and `/recipes/[id]`. Remaining: #2, the low-confidence chat-send observation (pairs with the P1-6 device sweep).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A11 (backups)     | ✅ 2026-08-22 — nightly `pg_dump` cron installed on the VM (03:00 UTC, keeps 14); restore rehearsed: fresh dump restored into scratch DB `chefer_restore_test`, all row counts matched live (users 6, meal_plans 18, recipes 298), ~1 s restore. RPO 24 h / RTO ~5 min (VM alive) or ~1–2 h (VM lost) documented in `infrastructure.md` §12, incl. the known gap: dumps sit on the same VM disk — **gap closed later same day**: `pull-backups.sh` + launchd on the dev Mac mirror the dumps daily (keeps 30, 48 h staleness alarm, restore-tested from the mirror), see `infrastructure.md` §12                                                                                                                                                                                                                                                                                              |
| A12 (uptime)      | 🟡 2026-08-22 — code side done: Caddy now routes public `/api/health` to the API (the canonical check — `SELECT 1` against Postgres, `{"ok":true}` or 503), web keeps a container-local liveness route for its Docker healthcheck, and deploy-verify polls both the health endpoint and the homepage. Monitor spec (2 monitors, keyword + HTTP 200) in `infrastructure.md` §12. **User's manual step: UptimeRobot signup + create the two monitors, after this deploys**                                                                                                                                                                                                                                                                                                                                                                                                                      |
| post-B follow-ups | ✅ 2026-08-22 — the two unblocked leftovers: (1) **chat-quota touchpoint** — over-quota now sends `X-Chat-Quota-Exhausted`, the widget swaps its input for the shared UpgradeButton (`source: chat-quota`, the 10th sourced touchpoint; upgrading re-enables chat in place); (2) **`addToShoppingList` chat tool + custom items** — new `ShoppingList.customItems` overlay column (never shadows the derived list, survives AI regenerate), `shoppingList.addCustomItems`/`removeCustomItem` (SERIALIZABLE+retry), page add-input ("2 kg flour" parsing) + remove button, `shopping_list_item_added {via}` event, Gemini+mock tool. Verified live in dev: manual add/check/remove, real-Gemini chat add ("oat milk + 6 bananas" persisted), quota banner + upgrade unblock. 7 new unit tests (93 api total)                                                                                   |
| everything else   | ⬜                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

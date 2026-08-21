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

| Step | Ticket              | What                                                                                                                                                                                                       |
| ---- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | **P0-0**            | Repair the quality gates (lint/test/typecheck/e2e) — **✅ done, see §6**                                                                                                                                   |
| A2   | **P0-2** ✅         | Delete `/user` PII leak, close public read, guard `/ingredients` — done 2026-08-21                                                                                                                         |
| A3   | **P0-1** ✅         | Fix dashboard next-meal logic — done 2026-08-21, verified live at 19:40 (dinner hero)                                                                                                                      |
| A4   | **P0-3** ✅         | CI on `master`, deploys gated on green — done 2026-08-21; branch protection = user's manual step                                                                                                           |
| A5   | **P0-4** ✅         | Rate limiting + helmet + per-user AI quotas — done 2026-08-21, all limits verified live (429s)                                                                                                             |
| A6   | **P0-5** ✅         | Unify calorie target — done 2026-08-21 via `resolveDailyTargets()`; custom macroSplit column deferred (goal-based splits already personalise)                                                              |
| A7   | **P0-6** ✅         | Password reset — done 2026-08-21; full flow verified live incl. session invalidation + single-use tokens                                                                                                   |
| A8   | **P0-7 / P0-8** ✅  | Refactor + test foundation — done 2026-08-21; 37 api tests, coverage ratchet (25% floor → 60% target), all query paths verified live                                                                       |
| A9   | **P2-2**            | Observability — **pulled forward from roadmap P2**: Sentry, pino, funnel analytics. A paywall without an upgrade funnel dashboard is flying blind, and production without error tracking isn't production. |
| A10  | **P0-9 / P0-10** ✅ | Stale docs + mobile a11y — done 2026-08-21; also fixed a shopping-list overflow (missing min-w-0) and the never-passing chart-tooltip spec found on the way                                                |

**Also in Phase A, not previously ticketed:**

- **A11 — Backup verification `S`:** `infrastructure/scripts/backup-db.sh` exists; nobody has
  restored from one. Schedule it (cron on the VM), verify a restore into a scratch DB, document
  RPO/RTO in `infrastructure.md` §12.
- **A12 — Uptime monitoring `S`:** external monitor on `/api/health` (UptimeRobot free tier is
  fine), alerting to email.

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

- [ ] `pnpm lint && pnpm typecheck && pnpm test` exit 0 from a clean clone (A1)
- [ ] CI green required to deploy; branch protection on (A4)
- [ ] No public endpoint returns another user's PII (A2)
- [ ] Auth endpoints rate-limited; AI spend capped per user per day (A5)
- [ ] Password reset works end-to-end (A7)
- [ ] Sentry receiving; uptime monitor on `/api/health`; backup restore rehearsed (A9, A11, A12)
- [ ] Free user with allergies gets a safe plan on day one (B2)
- [ ] Premium plan visibly reflects ratings + pins; generation screen says so (B3)
- [ ] All upgrade touchpoints live, sourced, and measured (B7, B8)
- [ ] Feature matrix exists in one file and drives both enforcement and copy (B1)
- [ ] Funnel dashboard shows prompt→upgrade conversion by source (B8)

---

## 6. Progress

| Step            | Status                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1 (P0-0)       | ✅ 2026-08-21 — six workspaces wired to the shared ESLint config, lint 0 errors (64 warnings ratcheted); typecheck 7/7; `ignoreBuildErrors` removed, `next build` type-checks again; 33 unit tests; `home.spec.ts` 17/17 |
| everything else | ⬜                                                                                                                                                                                                                       |

# UX Review Fix Plan — actionable tracker

Source: [`docs/ux-review-2026-08-23.md`](./ux-review-2026-08-23.md). Each item carries the review's finding ID.
Status legend: ☐ todo · ◐ in progress · ✅ done (commit) · ✖ dropped (reason).

Working branch: `integrate/wave-2` (== origin/master at start). Commit per item or coherent batch, Conventional Commits, run affected tests before each commit. Doc-maintenance rules from CLAUDE.md apply (new procedures → infrastructure.md §8 + business_flow.md; schema → §6; env vars → §10).

---

## Phase 1 — P0: trust in the numbers

| #   | ID   | Item                                                                                        | Where                                                                                                   | Acceptance                                                                                                                                                            | Status     |
| --- | ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1.1 | P-1  | Validate generated plan day totals against the user's calorie target; retry/rescale on miss | `apps/api/src/application/meal-plan/` (generation service), prompt builders in `apps/api/src/lib/ai/`   | Generated days within ±15% of target or plan is regenerated once with corrective instruction; final miss > 15% surfaces per-day "under/over target" badge data in DTO | ✅ 62056e7 |
| 1.2 | P-2  | Fix "ON TRACK" chip logic — flag under-planning, not just over                              | dashboard summary service + `apps/web/src/features/dashboard/`                                          | Chip shows "Under target" state when planned day < 85% of target; "On track" only within band                                                                         | ✅ 62056e7 |
| 1.3 | P-3  | Preferences calorie preview shows goal-adjusted target, not maintenance                     | `apps/web/src/features/preferences/` (estimate widget), calc in `packages/utils` or preferences service | Preview number == target used by planner (deficit/surplus applied); maintenance shown as secondary line                                                               | ✅ 959e5ee |
| 1.4 | F-4  | Chat claim precision: planned vs logged                                                     | chat tools/prompt in `apps/api/src/lib/ai/chat-tools.ts` + system prompt                                | Intake questions answered with explicit "planned" vs "logged" framing when log is empty/partial                                                                       | ✅ 959e5ee |
| 1.5 | —    | Import calorie-discrepancy banner: suppress implausible computed estimate                   | `apps/api/src/application/recipe-import/` or the preview banner component                               | When computed vs stated diverge >3×, banner says estimate is uncertain without quoting the absurd number                                                              | ✅ 959e5ee |
| 1.6 | §7.6 | In-app feedback channel                                                                     | new `feedback` tRPC procedure + small model (db push) + entry in More menu/sidebar + PostHog event      | User can send free-text feedback from nav; stored in DB; `feedback_submitted` event fires; docs updated (§6/§8)                                                       | ✅ 5a396a7 |

## Phase 2 — P1: the front door

| #   | ID  | Item                                                                                         | Where                                                                   | Acceptance                                                                                      | Status     |
| --- | --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| 2.1 | L-1 | Re-skin landing to app brand (cream/serif/brown)                                             | `apps/web/src/app/page.tsx`                                             | Landing uses the dashboard design tokens; no indigo/blue gradient; passes mobile sweep          | ✅ d46f9d7 |
| 2.2 | L-2 | Landing content: all 5 premium features, plan-grid visual, "free during beta" hook, mini-FAQ | `apps/web/src/app/page.tsx`                                             | Sections: hero + plan preview, feature grid (free+premium), beta banner, FAQ teaser, CTA repeat | ✅ d46f9d7 |
| 2.3 | L-3 | Footer credibility: who-makes-this line + Terms/Privacy/Contact links on landing             | landing footer                                                          | Footer has maker line + 3 links (terms, privacy, feedback mailto/contact)                       | ✅ d46f9d7 |
| 2.4 | L-1 | Re-skin auth pages (login/register/forgot/reset) to brand                                    | `apps/web/src/app/(auth)/` + `features/auth/components`                 | Auth pages share brand tokens (serif headings, brand buttons)                                   | ✅ d46f9d7 |
| 2.5 | L-5 | Fix register-page hydration error (#418) + the two 404 resources                             | `(auth)` pages; check `useHasMounted` pattern; find 404s in network tab | Console clean on register/login in prod build                                                   | ✅ d46f9d7 |

## Phase 3 — P1: onboarding & premium funnel

| #   | ID      | Item                                                                                                                                | Where                                                                                      | Acceptance                                                                                                                     | Status     |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 3.1 | O-1/O-2 | Onboarding step 2 = optional goal + body metrics for everyone; premium pitch demoted to a card on the finish screen                 | `apps/web/src/features/onboarding/` + preferences service (free users can persist metrics) | Step 2 collects goal/sex/age/height/weight/activity (all skippable); free tier stores them; pitch card no longer _is_ the step | ✅ 05d514d |
| 3.2 | O-3     | "Welcome, chef" for first session vs "Welcome back"                                                                                 | dashboard header                                                                           | New account (no prior plan/log) sees "Welcome"; returning sees "Welcome back"                                                  | ✅ 3d93db9 |
| 3.3 | P-8     | Post-upgrade activation: "3 things to do first" (set targets → regenerate → try import)                                             | upgrade success handling in `features/premium/`                                            | After upgrade mutation succeeds, activation dialog/screen with 3 CTAs shows once                                               | ✅ 3d93db9 |
| 3.4 | P-5     | Upgrade dialog: top-3 source-aware benefits + "and N more →"                                                                        | `features/premium/components` dialog v2 + `premium-features.ts` registry                   | Dialog lists 3 (source-priority) + link to /premium; no 10-item wall                                                           | ✅ 3d93db9 |
| 3.5 | P-4     | /premium comparison table: FREE column uses labels ("Chef-curated", "Curated pool") instead of "—" where a lesser equivalent exists | `/premium` page + registry                                                                 | No leading dash-wall; every row with a free equivalent names it                                                                | ✅ 3d93db9 |
| 3.6 | P-6     | Sidebar upsell card → dismissible (persists)                                                                                        | nav components + localStorage or user flag                                                 | Card has ✕; stays dismissed across reloads; upgrade entry remains in user menu/premium page                                    | ✅ 3d93db9 |

## Phase 4 — P1/P2: preferences & accessibility

| #   | ID   | Item                                                                                                                      | Where                                                | Acceptance                                                                                    | Status |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| 4.1 | PR-1 | Sectioned saves: diet/household/goal-metrics/cadence/budget/units save independently (or relax all-or-nothing validation) | `features/preferences/` + preferences router/service | Changing only cuisine or budget saves without full body profile                               | ☐      |
| 4.2 | PR-4 | Focus ring visually distinct from selected state on card selectors                                                        | goal cards / diet chips / sex buttons styles         | Tab focus ≠ selected; both visible simultaneously and distinct                                | ☐      |
| 4.3 | PR-3 | A11y names: goal cards, sex buttons, activity radios (human labels, not enums)                                            | same components                                      | Screen reader announces "Lose Weight", "Male", "Moderately active"; axe/read_page shows names | ☐      |

## Phase 5 — P2: polish batch

| #   | ID   | Item                                                                                                       | Where                                             | Acceptance                                                                      | Status |
| --- | ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| 5.1 | F-2  | Swap undo toast (5s)                                                                                       | recipe detail / planner swap mutation             | "Swapped — Undo" toast restores prior recipe                                    | ☐      |
| 5.2 | §5.4 | Photo counter monotonic ("14 of 17")                                                                       | recipe-images SSE + planner chip                  | Denominator fixed for a generation batch; numerator only increases              | ☐      |
| 5.3 | —    | Profile page: vendor telemetry (Gemini/Pollinations) visible to admins only                                | `/profile` page + user role check                 | Non-admin sees account + plan mgmt only; admin retains telemetry                | ☐      |
| 5.4 | F-3  | Shopping list: categories collapsed by default with counts + per-category check progress                   | `features/shopping-list/`                         | Collapsed groups w/ "12 items · 3 done"; expand persists per session            | ☐      |
| 5.5 | F-5  | Consistency sweep: per-page `<title>`s, Pantry header shows "Pantry", orange-title legend on planner cards | layout/header components, planner card            | Every route has title; header matches page; special cards labeled or normalized | ☐      |
| 5.6 | M-1  | "SUSTAINABLE CHOICE" badge: tooltip explaining it, or remove                                               | dashboard header                                  | Badge explains itself on hover/tap, or is gone                                  | ☐      |
| 5.7 | M-2  | Chat FAB no longer covers last card's macros on mobile                                                     | planner page bottom padding / FAB scroll behavior | 375px: last card fully readable with FAB present                                | ☐      |

## Out of scope (human / infra steps — flag to owner)

- Real domain to replace duckdns (L-3) — DNS + Caddy change.
- Email verification + password-reset e2e (L-4) — needs mail provider decision.
- "Your week is ready Monday" push/notification moment (§9.3) — depends on notification channel choice.
- PostHog dashboards for new events — manual step in PostHog UI.

## Progress log

- 2026-08-23 · plan created; working tree clean at b8d7840; execution: Phase 1 → 5 sequential.
- 2026-08-23 · Phase 1 DONE: 62056e7 (P-1 validation+retry, P-2 chip, planner badges), 959e5ee (P-3 preview, F-4 chat framing, import check), 5a396a7 (feedback channel + docs).
- 2026-08-23 · Phase 2 DONE: d46f9d7 (brand tokens un-blued app-wide, landing rewrite, auth re-skin, /terms + /privacy created, favicon). Register console verified clean in dev; #418 was favicon/terms-404-adjacent — watch Sentry after deploy.
- 2026-08-23 · Phase 3 DONE: 05d514d (3-step free onboarding + saveProfileBasics), 3d93db9 (dialog top-3, activation sheet, dismissible nav card, table labels, welcome/badge/chip fixes). All verified live in dev (fresh account ux-fixes-e2e@chefer.dev, left PREMIUM).

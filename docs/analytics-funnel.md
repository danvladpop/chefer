# Analytics: upgrade funnel & feature usage (PW-3)

> **Author:** 2026-08-22, launch plan B8. The events below already fire from
> production code. Dashboards and alerts are configured in the PostHog and
> Sentry UIs — those are one-time manual steps, marked ☐, the same way branch
> protection was for P0-3. **This data is what the Phase C pricing decision
> comes from** (launch plan §3).

## Event dictionary (fired from `apps/web`, PostHog EU)

Identity: `posthog.identify(userId, { planTier })` on every session
(`use-auth.ts`) **only for users who opted in** under Profile → "Usage
analytics" (default off, backlog P0-6) — segment any insight by the `planTier`
person property. Everyone else sends anonymous events with an in-memory ID
(`persistence: 'memory'`, no cookies), so per-person funnels and retention
cover opted-in users only; event counts and the per-event `tier`/`source`
properties still cover everyone. See `infrastructure.md` §15.
Capture is production-only (`NEXT_PUBLIC_POSTHOG_DEV=1` to test locally).

### T-12.1–T-12.3: shared `EventMap`, mobile ships, a second consent switch

- **`packages/types/src/analytics-events.ts`** is now the shared, health-data-guarded
  `EventMap` (T-12.1): every property is a number, boolean, array, or a
  string-literal union — never the general `string` type, so free-text
  allergy/diet/condition/weight/food data cannot become an event property
  (`EventMapIsGuarded`, proven by `analytics-events.test.ts`). Web's
  `capture()` (`apps/web/src/lib/analytics.ts`) is now overloaded: an
  `EventMap` key gets its exact shape checked; any other event name (every
  funnel/gym event already listed on this page) keeps the old permissive
  typing until it's migrated onto the map.
- **Mobile sends analytics for the first time** (T-12.2): NEW
  `apps/mobile/src/lib/{analytics,analytics-transport}.ts` — a pure-JS
  transport over PostHog's public `/batch/` HTTP endpoint (no React Native
  SDK, no native module, no runtime-fingerprint change), queued in memory and
  flushed every 30s or on background. No `EXPO_PUBLIC_POSTHOG_KEY` = total
  no-op. `src/features/gym/analytics.ts`'s `captureGymEvent` is a real
  re-export through it now, not a `__DEV__` console no-op — every gym event
  in the table below fires from the app once a key is configured.
- **A second web+mobile switch** (T-12.3, Q-8 default: on): "Send anonymous
  usage counts", next to the existing "Link usage to my account" (default
  off). Turning the first off also turns the second off and stops every
  analytics call, anonymous counts included. Both switches log through
  `privacy.recordAnalyticsConsent` (`infrastructure.md` §7, §8) so the choice
  is provable in Profile → Privacy & data → "Consent history", not just
  enforced client-side.
- **New events reserved in the map**, not yet wired by this lane (owned by
  the wave-1 branch building the feature): gym `exercise_image_failed`,
  `workout_set_removed`, `workout_set_restored`; plan `plan_configured`,
  `regenerate_confirmed`, `regenerate_undone`, `swap_undone`,
  `replace_undone`, `premium_changes_viewed`; safety
  `safety_readback_viewed`, `safety_conflict_shown`, `safety_issue_reported`,
  `safety_migration_resolved`; recipe form `recipe_form_opened`,
  `recipe_form_blocked_tap`, `recipe_form_submitted`,
  `recipe_form_abandoned`, `upload_failed`. Two names replace a looser
  wave-0 shape with a richer one — `plan_generated { slotsCount, keptPicks }`
  and `meal_logged { source, mealType }` — the old shapes below keep firing
  through the permissive overload until L-PLAN/L-TRACK adopt the new one.
- **This lane's own events** (T-12.4): `app_opened` (mobile launch),
  `analytics_consent_changed { anonymous, linked }` (either switch flips),
  `meal_logged { source, mealType }` (tracker, new shape above).

### Upgrade funnel (PW-2)

| Event                  | Properties | Fired when                                       |
| ---------------------- | ---------- | ------------------------------------------------ |
| `upgrade_prompt_shown` | `source`   | The upgrade dialog is opened from any touchpoint |
| `upgrade_clicked`      | `source`   | "Upgrade now" confirmed inside the dialog        |
| `upgrade_completed`    | `source`   | `user.upgradePlan` succeeded                     |
| `downgrade_completed`  | —          | Self-service downgrade succeeded                 |
| `pool_exhausted`       | —          | Free generation blocked by restrictions (P1-2)   |

`source` values: `sidebar`, `mobile-drawer`, `meal-plan-banner`,
`pool-exhaustion`, `shopping-list`, `preferences-locked`, `onboarding`,
`profile-page`, `swap`, `chat-quota` (added 2026-08-22 — the chat widget's
over-quota state now renders the shared UpgradeButton instead of a bare text
reply; the funnel-by-source insight picks the new value up automatically).

Premium-expansion sources (premium_plan.md §3.4/§6 — each lands with its
feature): `coach-review`, `snap-scan`, `recipe-import`, `household`, `pantry`,
`post-rating`, `monday-nudge`, `premium-page`.

### Premium expansion (premium_plan.md §3.4 — events land with their wave)

| Event                    | Properties              | Fired when                                                                                       |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `premium_page_viewed`    | `source`                | The `/premium` showcase page mounts (wave 0)                                                     |
| `teaser_engaged`         | `feature`               | A ghost state / locked mini-demo is interacted with                                              |
| `weight_logged`          | —                       | Weight quick-entry saved (F1)                                                                    |
| `chef_review_viewed`     | —                       | Weekly review sheet opened (F1)                                                                  |
| `meal_scanned`           | `confirmed`             | Photo scan estimate confirmed or discarded (F4)                                                  |
| `week_rebalanced`        | —                       | Rebalance applied after a log (F4)                                                               |
| `recipe_imported`        | `via: url\|photo\|text` | Import preview generated (F5)                                                                    |
| `recipe_cheferized`      | —                       | Adapted version saved (F5)                                                                       |
| `household_member_added` | —                       | Household member created (F2; every tier since P2-3)                                             |
| `onboarding_intent`      | `intent`                | Onboarding step 0 answered: EAT_BETTER\|HOUSEHOLD\|TRAIN (P2-3) — segment activation by audience |
| `pantry_confirmed`       | —                       | Weekly pantry confirm sheet completed (F3)                                                       |
| `plan_used_pantry`       | `itemCount`             | Generated plan consumed pantry items (F3)                                                        |

### Feature usage (PW-1 matrix coverage)

| Event                       | Properties           | Matrix feature                                                            |
| --------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `plan_generated`            | `tier`, `weekOffset` | aiMealPlans / plan quota                                                  |
| `meal_swapped`              | `tier`               | aiMealSwaps                                                               |
| `chat_message_sent`         | `suggested?`         | chatMessagesPerDay                                                        |
| `shopping_list_regenerated` | —                    | aiShoppingList                                                            |
| `shopping_list_item_added`  | `via`                | custom items (page add-input; chat-tool adds are server-side, uncaptured) |
| `preferences_saved`         | `premium`            | safety / personalisation                                                  |
| `recipe_rated`              | `rating`             | (P1-1 signal fuel)                                                        |
| `recipe_pinned`             | `pinned`             | (P1-1 signal fuel)                                                        |

Weekly auto-generation (PW-5) is server-side and shows up as plans whose
`createdAt` precedes their `weekStartDate` — count it in SQL/Postgres, not
PostHog, until server-side capture is worth adding.

### Gym (gym_plan.md §6.6)

Fired through the typed wrapper `apps/web/src/features/gym/analytics.ts`
(`captureGymEvent`), which wraps the shared `capture` helper above so every
event name and its properties are checked by the compiler. As of T-12.2,
`apps/mobile/src/features/gym/analytics.ts` exposes the same typed API and
really fires (through `lib/analytics.ts`'s pure-JS transport), not a
`__DEV__`-only console no-op — same names, same properties, own `GymEventMap`
kept in step by hand (not yet unified with the shared `EventMap` above; see
that file's header comment for why).

| Event                   | Properties                                  | Fired when                                                                                                                                            |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gym_mode_switched`     | `to: 'food' \| 'gym'`                       | The Food/Gym segmented control changes mode (`nav/mode-context.tsx`)                                                                                  |
| `gym_setup_completed`   | `template, days, experience, knownWeights`  | `gym.profile.completeSetup` succeeds (`gym/setup/setup-wizard.tsx`)                                                                                   |
| `workout_started`       | `source: 'next' \| 'picked' \| 'freestyle'` | A workout session is started (`gym/today/today-view.tsx`)                                                                                             |
| `workout_finished`      | `durationMin, sets, prs, offline`           | The Finish button completes a session (`gym/workout/workout-view.tsx`)                                                                                |
| `suggestion_overridden` | `reasonCode, direction`                     | The user adjusts the engine's "next time" suggestion (`gym/workout/summary-view.tsx`)                                                                 |
| `routine_edited`        | `kind`                                      | A routine document save succeeds (`gym/routine/edit/page.tsx`)                                                                                        |
| `pr_achieved`           | `kind: 'weight' \| 'reps' \| 'e1rm'`        | Each PR detected on Finish, once per exercise (`gym/workout/workout-view.tsx`)                                                                        |
| `week_goal_met`         | `streak`                                    | The weekly session goal is first reached, shown on the summary's week ring (`gym/workout/summary-view.tsx`)                                           |
| `training_paused`       | `weeks, reason`                             | "Pause training" confirmed in gym settings (`gym/settings/settings-view.tsx`)                                                                         |
| `sync_failed`           | `reason`                                    | The offline outbox parks a rejected sync doc (`gym/workout/outbox.ts`) — also logged as a Sentry warning from the API side (`gym.session.upsertMany`) |
| `video_opened`          | `fallback: boolean`                         | The technique video is played inline (`false`) or opened on YouTube (`true`) (`gym/library/VideoEmbed.tsx`)                                           |

`gym_mode_switched`, `gym_setup_completed`, `workout_started`,
`workout_finished`, `suggestion_overridden` and `training_paused` shipped
with the G5-A web wave via the raw `capture()` helper directly; `routine_edited`,
`pr_achieved`, `week_goal_met`, `sync_failed` and `video_opened` were added by
G4-C through the typed wrapper. Migrating the first six onto
`captureGymEvent` is a low-risk follow-up (naming/shape already match
`GymEventMap`) — left alone here to avoid touching the workout/routine files
mid-flight for other in-progress work.

## ✅ PostHog dashboard — "Upgrade funnel" (built 2026-08-22)

All four insights live on the "Upgrade funnel" dashboard. Event definitions
were seeded with a throwaway prod account (`funnel-test@chefer.dev`, left on
FREE) because definitions only appear in pickers after an event has fired
once. Note: the owner's own browser blocks `eu.i.posthog.com` (ad-blocker),
so their sessions won't appear in analytics.

1. **Funnel insight**: `upgrade_prompt_shown` → `upgrade_clicked` →
   `upgrade_completed`, conversion window 1 day, **breakdown by `source`**.
   This answers the PW-2 acceptance question: which gate converts.
2. **Trend**: weekly `upgrade_completed` vs `downgrade_completed`.
3. **Retention insight**: first-time `plan_generated` → returning
   `plan_generated`, weekly, **broken down by person property `planTier`**.
   W1/W4 premium-vs-free retention is the Phase C gate (launch plan §3:
   don't add a price until premium W4 clearly beats free).
4. **Feature usage trend**: `plan_generated`, `meal_swapped`,
   `chat_message_sent`, `shopping_list_regenerated` — stacked, broken down
   by `planTier`.

## ✅ Sentry alert rules (built 2026-08-22; one ☐ deferred)

1. ✅ **AI failure spike — api**: event captured AND message contains
   `failed` AND issue seen > 5 times in 15 min → team email. (`contains
"failed"` covers both `AI generateMealPlan failed` and `Chat failed`;
   the frequency AND keeps it from firing on isolated errors.)
2. ✅ **New issue — api** / **New issue — web**: "a new issue is created" →
   team email (low volume at this stage; tighten later). The web project is
   still named `javascript-nextjs` in Sentry.
3. ☐ **API p95 latency** (api project, metric alert when tracing volume
   allows): `trpc mealPlan.generate` p95 > 30s over 15 min.

Sentry's auto-created "Send a notification for high priority issues" rules
(one per project) overlap with the New-issue rules — high-priority issues
email twice. Keep or delete at will.

Once the four PostHog insights and Sentry rules exist, tick the launch-plan
Definition-of-Done line "Funnel dashboard shows prompt→upgrade conversion by
source".

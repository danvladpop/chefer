# Analytics: upgrade funnel & feature usage (PW-3)

> **Author:** 2026-08-22, launch plan B8. The events below already fire from
> production code. Dashboards and alerts are configured in the PostHog and
> Sentry UIs — those are one-time manual steps, marked ☐, the same way branch
> protection was for P0-3. **This data is what the Phase C pricing decision
> comes from** (launch plan §3).

## Event dictionary (fired from `apps/web`, PostHog EU)

Identity: `posthog.identify(userId, { planTier })` on every session
(`use-auth.ts`) — segment any insight by the `planTier` person property.
Capture is production-only (`NEXT_PUBLIC_POSTHOG_DEV=1` to test locally).

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
event name and its properties are checked by the compiler. The mobile app has
no analytics SDK yet — `apps/mobile/src/features/gym/analytics.ts` exposes
the same typed API as a `__DEV__`-only console no-op, so call sites exist for
when a mobile SDK lands.

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

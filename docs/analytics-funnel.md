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
`profile-page`, `swap`.

### Feature usage (PW-1 matrix coverage)

| Event                       | Properties           | Matrix feature           |
| --------------------------- | -------------------- | ------------------------ |
| `plan_generated`            | `tier`, `weekOffset` | aiMealPlans / plan quota |
| `meal_swapped`              | `tier`               | aiMealSwaps              |
| `chat_message_sent`         | `suggested?`         | chatMessagesPerDay       |
| `shopping_list_regenerated` | —                    | aiShoppingList           |
| `preferences_saved`         | `premium`            | safety / personalisation |
| `recipe_rated`              | `rating`             | (P1-1 signal fuel)       |
| `recipe_pinned`             | `pinned`             | (P1-1 signal fuel)       |

Weekly auto-generation (PW-5) is server-side and shows up as plans whose
`createdAt` precedes their `weekStartDate` — count it in SQL/Postgres, not
PostHog, until server-side capture is worth adding.

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

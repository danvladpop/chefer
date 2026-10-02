# WP-13 · Beta instrumentation and re-engagement

|                   |                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 3 / P1 for the beta's learning goal. Start as soon as the owner sets the PostHog key (OA-2)                                                                                  |
| Size              | M: about 1 day                                                                                                                                                               |
| Branch / worktree | `feat/beta-instrumentation` / `../chefer-wp13`                                                                                                                               |
| DB / ports        | `chefer_wp13` / 3213, 3313, 8113                                                                                                                                             |
| Depends on        | OA-2: the owner's PostHog key decision. If no key exists yet, ship the events behind "no key = no-op" and the rest anyway. It also needs WP-02's `useNotificationPermission` |
| Can run alongside | anything that doesn't touch onboarding or Settings (avoid running it next to WP-09)                                                                                          |

## Items

1. **UX-PO-02, mobile funnel events** via OTA:
   - `signup_completed`;
   - `onboarding_completed{jobs, trainingStyles, numbersMode}`;
   - `plan_generated`;
   - `meal_logged{source: planned|replaced|quick|snap}`;
   - `slot_skipped`;
   - `class_checked_in{status, effort}`;
   - `list_opened/shared`;
   - `cook_finished`;
   - `workout_finished{kind}`.

   Rules:
   - Respect `analytics.consent`.
   - Mirror the web event names where they exist (`docs/analytics-funnel.md`).
   - Update the privacy labels doc **before** enabling (an owner step).
   - Also write the **SQL beta dashboard** queries (daily actives; activation = a value event on 2 days within 7) as
     `docs/beta-dashboard.sql`.

2. **UX-PO-05, feedback channel.**
   - Attach `CURRENT_BUILD`, the OS and the route to each submission.
   - Add a Gym-mode entry point and a "Report this" button on `RootErrorBoundary`.
   - Notify the owner by email or webhook on each submission. Use an existing mail path (Gmail SMTP), adding an env var
     only if needed, plus `infrastructure.md` §10 and `.env.example`.
3. **UX-PO-08, food re-engagement.**
   - Ask one opt-in question at the end of onboarding ("Want a nudge to log dinner / plan Sunday?").
   - Add a **Settings → Notifications** screen that gathers weekly updates, gym reminders, class reminders (from WP-05),
     log nudges and the rest timer.
   - Local notifications only (no push server change).
   - The universal link for email confirmation is native, so it goes to the batch.
4. **UX-PO-10, context-aware landing.** Feed the active session and training state into `landingFor`. After 30 minutes in
   the background, re-land on foreground.

## Kickoff prompt

```
You are the orchestrator for WP-13 "Beta instrumentation & re-engagement". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-13-beta-instrumentation.md
3. CLAUDE.md
4. docs/analytics-funnel.md
Then execute it end to end under the operating rules. First check OWNER-ACTIONS.md OA-2 for the analytics key status.
- Sonnet lanes, at most 3 at a time; OTA-safe; a regression test per fix; the full ladder;
- iOS plus ONE Android emulator;
- ONE PR to master, never merged.
Finish by updating the live coordination file, then give the final summary.
```

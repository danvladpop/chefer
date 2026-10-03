# Chefer mobile — UX/UI and product audit before beta

- **Date:** 2026-10-02
- **Build tested:** `origin/master` at `8eb30fb5` (merge of #98), app **1.0.1**. Release builds with embedded JS and the
  "Chefer Dev" variant (`dev.chefer.app.dev`), against a **local API with mock AI** (canned answers, ~1.5 s delay) and
  mock email. Code spot-checks were done in `chefer-review-int` (same tree as `origin/master`).
- **Devices:** iPhone 17 Pro and iPhone 16e simulators (iOS 26.3); Pixel 8 emulator (API 37, 1080×2400).
- **Method:** eight lanes ran in parallel.
  - STATIC read the code of all 53 routes end to end.
  - PO did a product-gap and beta-operations analysis, including the production flag and AI configuration.
  - Device lanes:
    - L1, iOS: account and gym.
    - L2, iOS: Today/food and recipes.
    - L3, iOS: a soft-keyboard sweep and re-verification of earlier findings.
    - L4, iOS: gym leftovers, imperial units, Following, household, AI Chef and notifications.
    - A1, Android: account and onboarding.
    - A2, Android: food and recipes.
    - A3, Android: gym and offline.
  - Every device lane pressed every control in its area, tried invalid input and back navigation, killed the app
    mid-flow, and (on iOS) ran dark-mode and large-text passes.
  - Findings were then de-duplicated and merged across lanes. Severities were re-scored on one scale, and S0/S1 items
    with thin evidence were checked in code.
- **Severity scale** (the yardstick is "what will a beta tester hit"):
  - **S0, blocker.** Crash, data loss, a core flow that can't be completed, a privacy leak, or wrong allergen/health
    information.
  - **S1, major.** A core flow broken for some users, badly misleading UI, a dead button, a trapped state, or something
    testers will definitely report.
  - **S2, moderate.** Real friction, inconsistency, missing feedback or states, or layout breakage at large text.
  - **S3, polish.**
- **Status labels used below:**
  - **Confirmed on iOS / Android:** reproduced on a device, often with a database check.
  - **Code-confirmed, not reproduced on device:** the code path was read end to end, but the trigger (usually offline
    or a server error) couldn't be produced in the lab.
- **Raw notes and full-resolution screenshots** are in the session scratchpad. The screenshots behind S0/S1 items and
  some key S2 items are in [`evidence/`](./evidence).

## Fix status

Updated by each work package in `docs/backlog-2026-10/` (each WP edits only its own rows). Status is one of fixed, partially fixed, deferred or open.

| ID         | Sev | Status          | WP            | PR   | Notes                                                                                                      |
| ---------- | --- | --------------- | ------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| UX-ACC-01  | S0  | fixed           | WP-01         | #106 | Picker `flush()` on every Save (mobile + web)                                                              |
| UX-ACC-02  | S0  | fixed           | WP-01         | #106 | One `signOut()`; cache cleared on `setToken`                                                               |
| UX-ACC-03  | S1  | fixed           | WP-01         | #106 | Error + retry; never seeds from a failed load                                                              |
| UX-ACC-04  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-05  | S2  | open            | WP-03         |      |                                                                                                            |
| UX-ACC-06  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-07  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-08  | S2  | open            | WP-09 + Owner |      | JS part in the WP; native part in the owner native batch                                                   |
| UX-ACC-09  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-10  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-ACC-11  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-12  | S2  | fixed           | WP-01         | #106 | Sign-out and deletion clear reminders + gym KV                                                             |
| UX-ACC-13  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-14  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-15  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-16  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-17  | S3  | fixed           | WP-01         | #106 | No password in the draft; cleared on sign-out                                                              |
| UX-ACC-18  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-19  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-20  | S3  | open            | WP-02         |      |                                                                                                            |
| UX-ACC-21  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-22  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-23  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-24  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-ACC-25  | S3  | open            | WP-03         |      |                                                                                                            |
| UX-ACC-26  | S3  | open            | WP-03         |      |                                                                                                            |
| UX-ACC-27  | S3  | open            | WP-04         |      |                                                                                                            |
| UX-ONB-01  | S1  | fixed           | WP-01         | #106 | BACK steps back; KV draft resumes; empty jobs → wizard                                                     |
| UX-ONB-02  | S1  | open            | Owner         |      |                                                                                                            |
| UX-ONB-03  | S2  | open            | WP-03         |      |                                                                                                            |
| UX-ONB-04  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ONB-05  | S2  | open            | WP-09         |      |                                                                                                            |
| UX-ONB-06  | S2  | open            | WP-03         |      |                                                                                                            |
| UX-ONB-07  | S2  | open            | WP-03         |      |                                                                                                            |
| UX-ONB-08  | S2  | fixed           | WP-01         | #106 | Saved jobs pre-fill; rounded metrics                                                                       |
| UX-ONB-09  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-ONB-10  | S3  | open            | WP-09         |      |                                                                                                            |
| UX-FOOD-01 | S1  | fixed           | WP-01         | #106 | Ticks derive from server data, optimistic + rollback                                                       |
| UX-FOOD-02 | S1  | fixed           | WP-01         | #106 | `planForDate` at every call site                                                                           |
| UX-FOOD-03 | S1  | fixed           | WP-01         | #106 | Off-plan rows editable (`tracker.updateRecipeEntry`)                                                       |
| UX-FOOD-04 | S1  | open            | WP-02         |      |                                                                                                            |
| UX-FOOD-05 | S1  | open            | WP-02         |      |                                                                                                            |
| UX-FOOD-06 | S1  | fixed           | WP-01         | #106 | Failed writes revert and say why                                                                           |
| UX-FOOD-07 | S1  | fixed           | WP-01         | #106 | `useKeyboardInset` pads the composer                                                                       |
| UX-FOOD-08 | S2  | open            | WP-03         |      |                                                                                                            |
| UX-FOOD-09 | S2  | open            | WP-02         |      |                                                                                                            |
| UX-FOOD-10 | S2  | open            | WP-03         |      |                                                                                                            |
| UX-FOOD-11 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-12 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-13 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-14 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-15 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-16 | S2  | open            | WP-03         |      |                                                                                                            |
| UX-FOOD-17 | S2  | fixed           | WP-01         | #106 | Optional `entryId` (index still accepted)                                                                  |
| UX-FOOD-18 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-19 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-20 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-21 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-22 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-23 | S3  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-24 | S3  | open            | WP-04         |      |                                                                                                            |
| UX-FOOD-25 | S3  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-26 | S3  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-27 | S3  | open            | WP-10         |      |                                                                                                            |
| UX-FOOD-28 | S3  | open            | WP-10         |      |                                                                                                            |
| UX-PLAN-01 | S1  | fixed           | WP-01         | #106 | Past days and eaten slots kept on regenerate                                                               |
| UX-PLAN-02 | S1  | fixed           | WP-01         | #106 | Slot portion = eater only; Shop scales (owner data fix OA-10)                                              |
| UX-PLAN-03 | S1  | fixed           | WP-01         | #106 | Busy confirm; quota error shown                                                                            |
| UX-PLAN-04 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-PLAN-05 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-PLAN-06 | S2  | fixed           | WP-01         | #106 | "Not paleo: contains quinoa"                                                                               |
| UX-PLAN-07 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-PLAN-08 | S2  | open            | WP-07         |      |                                                                                                            |
| UX-PLAN-09 | S2  | partially fixed | WP-01 + WP-07 | #106 | Wrong week fixed here; opt-in UX in WP-07                                                                  |
| UX-PLAN-10 | S2  | open            | WP-03         |      |                                                                                                            |
| UX-PLAN-11 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-PLAN-12 | S2  | open            | WP-10         |      |                                                                                                            |
| UX-PLAN-13 | S3  | open            | WP-04         |      |                                                                                                            |
| UX-PLAN-14 | S3  | open            | WP-02         |      |                                                                                                            |
| UX-PLAN-15 | S3  | open            | WP-10         |      |                                                                                                            |
| UX-SHOP-01 | S2  | open            | WP-11         |      |                                                                                                            |
| UX-SHOP-02 | S2  | open            | WP-02 + WP-11 |      | Errors in WP-02; the rest in WP-11                                                                         |
| UX-SHOP-03 | S2  | open            | WP-11         |      |                                                                                                            |
| UX-SHOP-04 | S2  | open            | WP-11         |      |                                                                                                            |
| UX-SHOP-05 | S2  | open            | WP-11         |      |                                                                                                            |
| UX-SHOP-06 | S2  | open            | WP-11         |      |                                                                                                            |
| UX-SHOP-07 | S3  | open            | WP-11         |      |                                                                                                            |
| UX-REC-01  | S1  | fixed           | WP-01         | #106 | Ingredient-based paleo/keto/vegan checks; "Tagged … (not verified)"                                        |
| UX-REC-02  | S1  | fixed           | WP-01         | #106 | `portionsFor`: 2× + ½ + 1 = 3½                                                                             |
| UX-REC-03  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-REC-04  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-05  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-06  | S2  | open            | WP-03         |      |                                                                                                            |
| UX-REC-07  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-08  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-09  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-10  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-11  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-12  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-REC-13  | S3  | open            | WP-11         |      |                                                                                                            |
| UX-REC-14  | S3  | open            | WP-11         |      |                                                                                                            |
| UX-REC-15  | S3  | open            | WP-11         |      |                                                                                                            |
| UX-COOK-01 | S2  | open            | WP-11         |      |                                                                                                            |
| UX-COOK-02 | S2  | open            | WP-03         |      |                                                                                                            |
| UX-COOK-03 | S2  | open            | WP-02         |      |                                                                                                            |
| UX-COOK-04 | S2  | open            | WP-11         |      |                                                                                                            |
| UX-COOK-05 | S3  | open            | WP-11         |      |                                                                                                            |
| UX-GYM-01  | S1  | fixed           | WP-01         | #106 | Keypad clamps + 2× confirm; parked workouts surfaced; inline setup checks. "Add set" cap deferred to WP-12 |
| UX-GYM-02  | S1  | fixed           | WP-01         | #106 | Resume / Finish & start / Discard & start                                                                  |
| UX-GYM-03  | S1  | fixed           | WP-01         | #106 | BACK steps back via `useUnsavedGuard`                                                                      |
| UX-GYM-04  | S1  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-05  | S1  | fixed           | WP-01         | #106 | Setup defaults to preferred units; no gym→food overwrite of Imperial                                       |
| UX-GYM-06  | S1  | fixed           | WP-01         | #106 | End today deletes a same-day pause                                                                         |
| UX-GYM-07  | S1  | fixed           | WP-01         | #106 | Subset-sum plates; remainder shown                                                                         |
| UX-GYM-08  | S1  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-09  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-10  | S2  | open            | WP-12 + Owner |      | JS part in the WP; native part in the owner native batch                                                   |
| UX-GYM-11  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-12  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-13  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-14  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-15  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-16  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-17  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-GYM-18  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-19  | S2  | open            | WP-11         |      |                                                                                                            |
| UX-GYM-20  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-21  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-22  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-23  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-24  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-25  | S2  | open            | WP-02         |      |                                                                                                            |
| UX-GYM-26  | S2  | open            | WP-03         |      |                                                                                                            |
| UX-GYM-27  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-28  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-29  | S2  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-30  | S3  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-31  | S3  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-32  | S3  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-33  | S3  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-34  | S3  | open            | WP-12         |      |                                                                                                            |
| UX-GYM-35  | S3  | open            | WP-03         |      |                                                                                                            |
| UX-SOC-01  | S2  | open            | Owner         |      | Following flag stays off (D-6)                                                                             |
| UX-SOC-02  | S3  | open            | Owner         |      | Following flag stays off (D-6)                                                                             |
| UX-SOC-03  | S3  | open            | Owner         |      | Following flag stays off (D-6)                                                                             |
| UX-X-01    | S1  | fixed           | WP-01         | #106 | `useUnsavedGuard` (`usePreventRemove`) blocks iOS swipe                                                    |
| UX-X-02    | S2  | fixed           | WP-01         | #106 | Sheet uses one keyboard mechanism                                                                          |
| UX-X-03    | S2  | open            | WP-03         |      |                                                                                                            |
| UX-X-04    | S2  | open            | WP-03         |      |                                                                                                            |
| UX-X-05    | S2  | open            | WP-03         |      |                                                                                                            |
| UX-X-06    | S2  | partially fixed | WP-01 + WP-02 | #106 | Gym setup + keypad fixed here; the rest in WP-02                                                           |
| UX-X-07    | S2  | open            | Owner         |      |                                                                                                            |
| UX-X-08    | S2  | open            | WP-04         |      |                                                                                                            |
| UX-X-09    | S2  | open            | WP-04         |      |                                                                                                            |
| UX-X-10    | S2  | open            | WP-04         |      |                                                                                                            |
| UX-X-11    | S2  | open            | WP-03         |      |                                                                                                            |
| UX-X-12    | S3  | open            | WP-02         |      |                                                                                                            |
| UX-X-13    | S3  | open            | WP-02         |      |                                                                                                            |
| UX-X-14    | S3  | open            | WP-04         |      |                                                                                                            |
| UX-X-15    | S3  | open            | WP-11         |      |                                                                                                            |
| UX-X-16    | S3  | open            | WP-03         |      |                                                                                                            |
| UX-X-17    | S3  | open            | WP-03         |      |                                                                                                            |
| UX-PO-01   | S1  | open            | Owner         |      |                                                                                                            |
| UX-PO-02   | S1  | open            | WP-13         |      |                                                                                                            |
| UX-PO-03   | S1  | open            | Owner         |      |                                                                                                            |
| UX-PO-04   | S1  | open            | Owner         |      |                                                                                                            |
| UX-PO-05   | S2  | open            | WP-13         |      |                                                                                                            |
| UX-PO-06   | S2  | open            | WP-14         |      |                                                                                                            |
| UX-PO-07   | S2  | open            | Owner         |      |                                                                                                            |
| UX-PO-08   | S2  | open            | WP-13 + Owner |      | JS part in the WP; native part in the owner native batch                                                   |
| UX-PO-09   | S2  | open            | Owner         |      |                                                                                                            |
| UX-PO-10   | S3  | open            | WP-13         |      |                                                                                                            |

### Coverage matrix

Key: **full** = every control exercised. **partial** = the main paths only. **—** = not covered.

| Area                                          | iOS                                       | Android                             | Notes                                                                                |
| --------------------------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| Welcome / register / login                    | full                                      | full                                |                                                                                      |
| Forgot / reset password (deep link)           | full                                      | —                                   |                                                                                      |
| Onboarding wizard (all jobs, units, consent)  | full                                      | partial                             | Android: the process was killed by the host at step 6. Several branches stop early.  |
| Settings, Preferences, Profile, privacy cards | full                                      | partial                             | Android: Settings hub and jobs only. Preferences editing not covered.                |
| Household editor                              | full                                      | —                                   |                                                                                      |
| Premium upgrade / post-upgrade / downgrade    | full                                      | partial                             |                                                                                      |
| Data export, account deletion                 | full                                      | —                                   |                                                                                      |
| Following (flag ON in test env, OFF in prod)  | full                                      | —                                   |                                                                                      |
| Today / dashboard                             | full                                      | full                                |                                                                                      |
| Tracker, Log sheet, quick add, edit entry     | full                                      | full                                |                                                                                      |
| Snap to log                                   | partial (library photo, mock AI)          | —                                   |                                                                                      |
| Progress / weigh-ins                          | full                                      | partial                             |                                                                                      |
| Meal plan, swap, regenerate, plan settings    | full                                      | full                                |                                                                                      |
| My weeks / history                            | full                                      | partial                             |                                                                                      |
| Shopping list                                 | full                                      | full (incl. offline ticks)          |                                                                                      |
| Pantry / "In my kitchen"                      | full                                      | partial                             |                                                                                      |
| AI Chef                                       | full                                      | partial (keyboard, one tool action) |                                                                                      |
| Cookbook / recipe detail                      | full                                      | partial                             |                                                                                      |
| Recipe form (create / edit / photo)           | full                                      | —                                   |                                                                                      |
| Import (link, video)                          | full                                      | partial (link only)                 | Paste-text and video not covered on Android.                                         |
| Cook mode                                     | full (except keep-awake)                  | partial                             |                                                                                      |
| Gym setup                                     | full                                      | full                                |                                                                                      |
| Workout logger                                | full                                      | full (incl. offline + kill)         |                                                                                      |
| Routine / editor / templates / archive        | full                                      | partial                             |                                                                                      |
| Exercise library + custom exercise            | full                                      | partial                             |                                                                                      |
| Stats                                         | full                                      | partial                             |                                                                                      |
| Gym settings / pause / reminders              | full                                      | partial                             | Android: notification permission already granted, so the deny path wasn't reachable. |
| Soft keyboard sweep                           | full (L3)                                 | partial (incidental)                |                                                                                      |
| Dark mode pass                                | done                                      | —                                   |                                                                                      |
| Large-text pass                               | done (accessibility-XL)                   | —                                   |                                                                                      |
| Offline                                       | — (simulator can't go offline per device) | gym full; shop partial              | Android Today/tracker offline not covered.                                           |

**Not tested at all, so it has to be tested on real devices (see §10):**

- Offline on iOS.
- Real push delivery. Local notification delivery was checked only for the Android rest timer.
- Real camera capture (photo library only).
- Cook-mode keep-awake.
- Real AI quality and latency, and AI capacity exhaustion (all AI was mocked).
- Legal web pages: `getWebUrl()` points at the local API, so they return 404 in this environment.
- Emoji rendering. The iOS 26.3 simulator draws every emoji as "?".
- Android dark mode and large text.
- On Android: account deletion, Household, Following, the recipe form, Snap to log, and a second account with
  allergies or a vegetarian diet.
- TestFlight / Play install, update and OTA behaviour.

**About Android performance:** the Android lanes ran three emulators on an overloaded host (load average 40–500).
There was input lag, environment-induced ANRs, one emulator crash and a `system_server` restart. No sluggishness from
those lanes is reported as an app performance issue. Timing-sensitive Android findings were re-checked. Two that
could still be environmental are flagged "re-check on a real device".

---

## 1. Executive summary

**Verdict: not ready for beta testers yet, but close.**

- The core loops work and several are excellent:
  - onboarding, then a first plan, then Today;
  - one-tap gym logging with offline-first sync;
  - privacy and consent flows;
  - the "shows its work" explanations.
- Two **S0** defects must be fixed before anyone else uses the app:
  1. A typed allergy is silently dropped while the screen says "Saved ✓".
  2. After sign-out, the next account sees and can overwrite the previous account's data, including allergies
     pre-filled into the new user's onboarding.
- Around fifteen **S1** defects corrupt data testers will look at every day:
  - tracker state and the week it reads;
  - calories doubled for "Two of us";
  - Regenerate rewriting meals already eaten;
  - diet "Checked" claims that aren't checked;
  - wrong plate maths;
  - lost onboarding on Android.
    Any of these will dominate beta feedback and hide the real product signal.
- The operational side isn't ready either:
  - no crash reporting;
  - no analytics;
  - no Android distribution path;
  - shared AI capacity that a few Premium testers will exhaust on the first morning.

**Counts after de-duplication.** 273 raw findings across 9 lanes became 172 report findings. A further 11 items are
withdrawn, environment-only or unconfirmed (§8).

| Severity    | Count   | Of which product / operations (PO) |
| ----------- | ------- | ---------------------------------- |
| S0 Blocker  | **2**   | 0                                  |
| S1 Major    | **28**  | 4                                  |
| S2 Moderate | **98**  | 5                                  |
| S3 Polish   | **44**  | 1                                  |
| **Total**   | **172** | 10                                 |

### Must fix before beta

App defects:

1. **UX-ACC-01**: an allergy typed in "Something else?" is dropped on Save ("Saved ✓" is shown). This affects
   Preferences, the Household member sheet and onboarding.
2. **UX-ACC-02**: sign-out keeps the previous account's cache. The next user sees their name and email, the onboarding
   is pre-filled with their allergies, diet and goal, and saves land on the wrong account.
3. **UX-ONB-01**: Android BACK, or the process being killed during onboarding, loses the wizard for good. Allergies and
   goal are never asked again.
4. **UX-PLAN-02**: "Cooking for: Two of us" doubles the user's own calories. Every day reads "over target", and
   "I ate this" logs a 2× portion.
5. **UX-FOOD-02**: the tracker reads next week's plan as soon as next week has been viewed. Wrong meals get logged and
   the rebalance edits the wrong week.
6. **UX-FOOD-01 + UX-FOOD-06**: tracker ticks never reconcile with the server after Undo or a failed write. The tracker
   and Today disagree.
7. **UX-PLAN-01**: Regenerate mid-week rewrites past days and meals already eaten, and Today then offers a second
   dinner.
8. **UX-REC-01**: paleo and keto are "Checked" on recipes that break them, and user recipes are flagged
   "Contains non-vegetarian" on plain oats.
9. **UX-REC-02**: Premium household servings multiply the owner's portion across the whole table (12 eggs for one
   breakfast).
10. **UX-GYM-01**: implausible weights (a 1025 kg typo) park a finished workout that can never sync. Setup shows raw
    Zod JSON.
11. **UX-GYM-02**: "Start workout" or "Do it today" silently reopens a different workout that is already in progress.
12. **UX-GYM-05**: gym setup ignores the Imperial choice from onboarding and flips the whole app back to metric.
13. **UX-GYM-06 + UX-GYM-07**: "End pause" does nothing on the day the pause started, and the plate calculator shows
    170 lb of plates for 180 lb. Both are small fixes.
14. **UX-X-01**: the iOS swipe-back bypasses the unsaved-changes guard, so recipe drafts and routine edits are lost.
15. **UX-FOOD-07**: the AI Chef composer and Send button sit under the keyboard on Android.

Configuration and operations, owner actions in the same week:

16. **UX-ONB-02**: turn on `ownTargetsFree` in production. A Free Track user can't save targets in onboarding.
17. **UX-PO-01**: add Sentry to the tester binary. It is native, so it must ship with the #99 build.
18. **UX-PO-03**: an AI capacity plan for the cohort (paid Groq tier or caps), plus honest "later today" copy.
19. **UX-PO-04**: create the Play Console account and an AAB pipeline. Android testers can't be onboarded otherwise.
20. **UX-PO-02**: at minimum a SQL beta dashboard. Mobile analytics is off.

### Top themes

1. **Data integrity in the food loop.**
   - The tracker, Today, Regenerate and the rebalance each have their own idea of "today's plan".
   - Four S1s come from the plan resolver, local tick state and the portion multipliers (FOOD-01/02/03, PLAN-01/02).
2. **State that outlives its owner.** The sign-out cache (ACC-02), the onboarding hydrated from a cache, and
   un-flushed text inputs (ACC-01, ONB-07).
3. **Keyboard handling.**
   - The shared `Sheet` and the forms double-compensate the keyboard on iOS.
   - Several screens have no keyboard-aware scroll.
   - Android edge-to-edge hides composers.
   - About 15 findings trace back to two primitives (§6.1).
4. **Back navigation and unsaved work.**
   - Android BACK and the iOS swipe bypass guards in onboarding, gym setup, the recipe form, the routine editor, import
     and cook mode (§6.2).
5. **Silent failures and raw errors.** Mutations without `onError`, failed loads that render as empty or "Loading…",
   and Zod JSON shown to users (§6.3).
6. **Units and locale.** Imperial support is partial (body metrics, Shop add-item, pantry, the plate maths), and units
   get silently flipped between food and gym (§6.4).
7. **Operations blind spots.** No crash reports, no analytics, a feedback box only in Food mode, no Play track, and
   shared AI capacity (§7).

---

## 2. S0 — Blockers

### UX-ACC-01 · An allergy typed in "Something else?" is silently dropped on Save while the button says "Saved ✓"

- **Severity:** S0 (wrong allergen information)
- **Platforms:** iOS (confirmed with a DB check), Android (the mechanism was seen in onboarding, but the save was
  never reached). The code is shared, so both platforms are affected.
- **Where:**
  - Preferences → Food safety.
  - Household → member sheet "Allergies & diet for …".
  - Onboarding Diet & safety.
  - Code: `src/features/safety/safety-picker.tsx:95-104,236-258`, `app/preferences.tsx:154`,
    `src/features/household/household-editor.tsx:145,563-566`.
- **Steps:**
  1. Settings → Allergies & diets.
  2. Tap Peanuts, then type "Mustard" (or "sesame") in "Something else?". Don't press "+" or Return.
  3. Tap "Save safety preferences". For a household member, tap Done → "Add to my table" instead.
- **Expected:** the typed term is added before saving, or Save asks "Add 'sesame' first?".
- **Actual:**
  - "Saved ✓" appears and the text is still sitting in the field.
  - The DB row has no new allergy.
  - The household member "Sam" was saved with Dairy only, although "sesame" (a recognised allergen) was typed. The
    table summary then promises to check Sam for Dairy only.
  - "Saved ✓" also stays visible after later unsaved edits.
  - On Android, onboarding Continue proceeded with "celery" left un-chipped in the field.
- **Evidence:** [evidence/UX-ACC-01-1.jpg](evidence/UX-ACC-01-1.jpg), [-2](evidence/UX-ACC-01-2.jpg),
  [-3](evidence/UX-ACC-01-3.jpg) (member saved with Dairy only). DB `dietary_preferences` and `household_members` rows
  for ux-l1-1.
- **Sources:** STATIC-22, L1-09, L1-14, A1-14
- **Recommendation:**
  - Lift the pending text out of `SafetyPicker` (through `onChange`, or an imperative `flush()`).
  - Every host's Save, Done or Continue should first run the same recognise/confirm flow on the pending text, or block
    with an inline prompt.
  - Reset "Saved ✓" whenever the picker value changes.
  - Add an E2E test: type a term, tap Save, assert it was stored. Apply this in Preferences, Household and onboarding.

### UX-ACC-02 · After sign-out the next account sees, and can overwrite, the previous account's data, including its allergies pre-filled into the new user's onboarding

- **Severity:** S0 (privacy leak, wrong allergen data, writes to the wrong account)
- **Platforms:** iOS (confirmed several times, by L1 and L4), Android (confirmed)
- **Where:**
  - Sign-out in `app/(food)/more.tsx:65-74` and `src/features/settings/settings-screen.tsx:149-158` calls `clearToken()`
    and then only `utils.invalidate()`.
  - The 401 auto-sign-out in `src/lib/trpc.ts:27-32` doesn't even invalidate.
  - Onboarding hydration in `src/features/onboarding/onboarding-wizard.tsx:136-180` reads the cached
    `preferences.get`.
- **Steps:**
  1. Account A completes onboarding with Peanuts, Vegan, Lose weight, 180 cm / 80 kg and four jobs.
  2. More → Sign out. Don't kill the app.
  3. Register account B and pick only "Plan my meals".
- **Expected:** B starts from an empty wizard that follows B's answers. Nothing of A is visible.
- **Actual:**
  - **iOS:**
    - B gets A's 8-step chain (training days, table).
    - Diet & safety comes up with **Peanuts and Vegan already ticked**, and Your goal with **Lose weight**.
    - Metrics come up as `86.1825503` kg.
    - Finishing writes A's safety data into B's account.
  - **Android:**
    - After A → sign-out → sign in as B, the avatar, Profile ("Ana · ux-a1-2@…") and Settings → "What you use Chefer
      for" all showed A for 4+ minutes. The API log shows no `user.me` fetch for B.
    - Save on the jobs screen was enabled and would write A's choices into B.
  - The persisted Food/Gym mode, module stores and (code) the in-progress workout owner check also carry over.
- **Evidence:** [evidence/UX-ACC-02-1.jpg](evidence/UX-ACC-02-1.jpg) (B on A's step chain),
  [-2](evidence/UX-ACC-02-2.jpg) (Peanuts + Vegan pre-filled), [-3](evidence/UX-ACC-02-3.jpg) (Lose weight),
  [-4](evidence/UX-ACC-02-4.jpg) (Android Profile shows the previous user), [-5](evidence/UX-ACC-02-5.jpg) (jobs with
  Save enabled).
- **Sources:** STATIC-13, L1-20, A1-03, L4 cross-check note
- **Recommendation:**
  - Add one `signOut()` used by More, Settings, account deletion and the 401 handler. In order: `cancelQueries()`, then
    `queryClient.clear()`, then reset the module stores, the mode/landing cache, the register draft and the gym
    reminders (see UX-ACC-12), and finally `clearToken()`.
  - Also `clear()` on `setToken` so a sign-in always starts from an empty cache.
  - Harden the wizard: hydrate only from data fetched after mount, and never build steps from cached `savedJobs`.

---

## 3. S1 — Major

### Account and onboarding

#### UX-ACC-03 · A failed Household load looks like "Just you", and saving "You" then wipes the stored allergies

- **Severity:** S1
- **Platforms:** both. **Code-confirmed, not reproduced on device** (needs offline; iOS can't go offline and Android
  didn't reach Household). L1 confirmed that with data loaded, saving "You" doesn't wipe allergies.
- **Where:** `src/features/household/household-editor.tsx:92-123,171,216-221,407,419-437`
- **Steps:**
  1. Open Household while `preferences.get` or `household.list` fails (slow or offline).
  2. Tap "You", pick one allergy, and Save once back online.
- **Expected:** an error state, and no editor seeded from data that hasn't loaded. Preferences already guards this
  (F-ONB-2-1).
- **Actual:**
  - The list error renders "Just you at the table for now."
  - The "You" draft is seeded from `data?.dietaryPreferences?.allergies ?? []`.
  - The save is a full replacement through `updateSafety`, so the stored allergies are erased.
  - Remove and save failures show nothing.
- **Evidence:** code only (`household-editor.tsx:100-104`).
- **Sources:** STATIC-28
- **Recommendation:**
  - Disable "You" until `preferences.get` succeeds.
  - On `isError`, show `ErrorState` with Retry.
  - Route every save, add and remove error through `userFacingErrorMessage`.

#### UX-ONB-01 · Onboarding is lost for good if the user presses Android BACK or the app process dies; Free users have no way back in

- **Severity:** S1
- **Platforms:** Android (confirmed: BACK on steps 1 and 2, and a process restart at step 6), iOS (confirmed: killing
  the app at step 1)
- **Where:**
  - `src/features/onboarding/onboarding-wizard.tsx` has no `BackHandler`.
  - `src/features/auth/pending-onboarding.ts` keeps an in-memory `let pending` ("a cold start never replays
    onboarding").
  - The redirect is in `app/(food)/_layout.tsx:46-49`.
  - The re-entry points are premium-only: `app/(food)/index.tsx:206`, `app/preferences.tsx:266`.
- **Steps:**
  1. Register. The wizard opens.
  2. Press hardware BACK on any step, or swipe the app away, or let Android kill it in the background.
  3. Reopen Chefer.
- **Expected:** BACK goes to the previous step (and asks "Set up later?" on step 1). A cold start resumes the wizard
  until it is finished or explicitly skipped.
- **Actual:**
  - BACK finishes the activity.
  - On reopen, the user lands on an empty Food Today with no jobs, diet, allergies, goal or body metrics saved. Nothing
    ever brings the wizard back.
  - A user who reached step 6 lost training days, Peanuts + Sesame, Pescatarian, goal and metrics when Android
    restarted the process.
  - The app's headline promise, "Allergies checked on every plan", is never asked of these users.
- **Evidence:** [evidence/UX-ONB-01-1.jpg](evidence/UX-ONB-01-1.jpg) (iOS relaunch mid-wizard → empty Today),
  [-2](evidence/UX-ONB-01-2.jpg) (Android BACK on step 1), [-3](evidence/UX-ONB-01-3.jpg) (reopen → Today). DB check:
  `dietary_preferences` empty.
- **Sources:** STATIC-43, L1-01, A1-01
- **Recommendation:**
  - Add `useFocusEffect` + `BackHandler`: when `step > 0`, go to the previous step; on step 0, confirm.
  - On iOS, add `gestureEnabled: false` or a `beforeRemove` confirm when the wizard is pushed.
  - Persist "onboarding incomplete" server-side (`onboardedAt`, or `jobs.length === 0`) and redirect from the Food
    layout while it is unset.
  - Persist wizard answers locally per step.
  - Show a "Finish setting up" card on Today for every tier.

#### UX-ONB-02 · "Your targets" can't be saved on Free in production — an onboarding dead end for Track users

- **Severity:** S1
- **Platforms:** both. Code plus the production flags; the error was also seen on iOS.
- **Where:**
  - The onboarding Targets step and Settings → Your targets (`src/features/preferences/targets-card.tsx:66-74`).
  - The server gate in `apps/api/src/application/targets/targets.service.ts:170-175`.
  - Production `profile.flags` returns `ownTargetsFree=false`.
- **Steps:**
  1. Register on Free and pick "Track what I eat".
  2. On "Your targets", choose your own numbers and tap Save.
- **Expected:** own targets save on every tier (B-35; the W1 default was ON), or the step shows a clear lock that opens
  the Premium sheet.
- **Actual:** a red error, "Setting your own targets requires a premium plan. Upgrade to unlock it.", with no Upgrade
  button.
- **Evidence:** [evidence/UX-ONB-02-1.jpg](evidence/UX-ONB-02-1.jpg)
- **Sources:** PO-03, L2-07 (screenshot)
- **Recommendation:**
  - Add `ownTargetsFree` to production `FEATURE_FLAGS` (env change and restart).
  - If it should stay Premium, render `LockedFeatureCard` / `openPremium('targets')` instead of a form that fails, and
    drop the step from the Free onboarding list.

### Food: Today, tracker, AI Chef

#### UX-FOOD-01 · Tracker ticks are copied from the server once a day, so Undo and logs made elsewhere leave the screen wrong

- **Severity:** S1
- **Platforms:** Android (confirmed, API log + DB), iOS (confirmed by L3, and the symptom was seen by L2)
- **Where:**
  - `app/tracker.tsx:124-150` initialises once per date (`if (!data || initialised === dateStr) return;`).
  - `:185-216`: the Undo handlers only call the server.
  - `:307-323`: totals come from local state.
- **Steps:**
  1. Today → See full day.
  2. Tick Breakfast. The snackbar reads "Logged breakfast · Undo".
  3. Tap Undo.
  4. Go back to Today.
- **Expected:** the row unticks, the totals drop, and the tracker and Today agree.
- **Actual:**
  - `unlogRecipe` succeeds (DB `totalKcal` 450).
  - The tracker still shows Breakfast ticked with 1,094 / 1,492 kcal, while Today shows 450.
  - "Removed … · Undo" re-logs on the server but leaves the row unticked.
  - A planned meal logged from the Log sheet is neither ticked nor counted.
  - Fast tick/untick sends two unordered requests.
- **Evidence:** [evidence/UX-FOOD-01-1.jpg](evidence/UX-FOOD-01-1.jpg) (still ticked after Undo),
  [-2](evidence/UX-FOOD-01-2.jpg) (Today shows 450), [-3](evidence/UX-FOOD-01-3.jpg) (iOS, ticked at 472 kcal while the
  DB has 227)
- **Sources:** STATIC-41, A2-05, L2-05, L3-03 (part)
- **Recommendation:**
  - Derive ticks from `data.log` on every refetch, overlaying only the in-flight mutations (or optimistic
    `setQueryData` with rollback).
  - Update `checkedMeals` inside both Undo handlers.
  - Fix this together with UX-FOOD-06.

#### UX-FOOD-02 · The tracker and the post-log rebalance use NEXT week's plan once next week has been opened

- **Severity:** S1
- **Platforms:** both (server). Confirmed on iOS with a DB check.
- **Where:**
  - `apps/api/src/application/tracker/tracker.service.ts:152,173,590` call
    `mealPlanRepository.findActiveWithDays(userId)`, which returns the newest ACTIVE plan of _any_ week.
  - The B-13 `findForWeek` fix was applied to Today, Plan and Shop, but not to the tracker.
- **Steps:**
  1. Have this week's plan.
  2. On Plan, tap → to next week. This silently creates a carry-forward plan, which becomes the newest ACTIVE one.
  3. Today → See full day.
- **Expected:** the tracker lists today's meals from this week's plan, the same ones Plan and Today show.
- **Actual:**
  - Alice (vegetarian), Friday: Plan shows Savory Oatmeal / Almond Butter Bowl / Thai Green Curry.
  - The tracker shows Greek Yogurt Parfait / Turkey Wrap / Herb-Crusted Salmon, which is Friday of the week of 5 Oct.
  - Ticking logs meat and fish meals she never planned.
  - Copy-day, the planned list and off-plan detection all key off the wrong week.
  - The rebalance after any log ("I adjusted Sunday dinner…") edits the wrong week.
- **Evidence:** [evidence/UX-FOOD-02-1.jpg](evidence/UX-FOOD-02-1.jpg) (tracker), [-2](evidence/UX-FOOD-02-2.jpg)
  (Plan, same Friday). DB: three ACTIVE plans, and the tracker shows the newest.
- **Sources:** L2-53 (related: L2-40)
- **Recommendation:**
  - Resolve the plan with `findForWeek(userId, mondayOf(dateStr))` in `getDay`, `plannedRecipeIdsFor` and
    `maybeRebalance`.
  - Add a regression test with two ACTIVE plans in adjacent weeks.

#### UX-FOOD-03 · A logged recipe that has left the plan can't be edited or removed — its calories are stuck for good

- **Severity:** S1
- **Platforms:** both. Confirmed on iOS; the code is shared.
- **Where:** `app/tracker.tsx:570-588`, the "Also eaten" off-plan rows, which are plain `View`s with no tap target and
  no bin.
- **Steps:**
  1. Log tonight's dinner ("I ate this").
  2. Regenerate the week, swap the meal, or "Copy yesterday".
  3. Tracker → Also eaten.
- **Expected:** the entry can be edited (portion, meal) and deleted with Undo, like custom entries.
- **Actual:** "Tofu Pad Thai · dinner · 603 kcal" is read-only. A tap or long-press does nothing. A mis-log can't be
  fixed and the day total stays inflated.
- **Evidence:** [evidence/UX-FOOD-03-1.jpg](evidence/UX-FOOD-03-1.jpg)
- **Sources:** L2-20
- **Recommendation:** render off-plan recipe rows with the custom-entry row component: tap to edit portion and meal,
  bin to delete with Undo. Key the row by `entryId`.

#### UX-FOOD-04 · "Rate it" on Today's "Dinner done" row is a dead button

- **Severity:** S1 (a dead button)
- **Platforms:** iOS (confirmed), Android (confirmed)
- **Where:** `src/features/dashboard/components/tonight-card.tsx:56-64`, where
  `onPress={() => setRated(true)}`; `rated` isn't used anywhere else.
- **Steps:**
  1. Evening, Today: "I ate this" on dinner.
  2. The row reads "✓ Dinner done · … Rate it".
  3. Tap Rate it.
- **Expected:** a rating sheet that writes `meal_ratings`. The weekly review says plans are "built from dishes you
  rated".
- **Actual:** the link disappears. There is no UI and no API call, and `meal_ratings` stays empty. The link comes back
  after a reload.
- **Evidence:** [evidence/UX-FOOD-04-1.jpg](evidence/UX-FOOD-04-1.jpg) (before), [-2](evidence/UX-FOOD-04-2.jpg) (after
  the tap)
- **Sources:** STATIC-10, L2-08, A2-11
- **Recommendation:**
  - Render the existing `StarRating` (cook mode's finish screen already saves ratings) inline.
  - Hide the link once `recipe.getMyRating` returns a value.
  - Until then, remove the link.

#### UX-FOOD-05 · Today shows a green "PLAN ON TRACK" pill while the user is 871 kcal over target

- **Severity:** S1 (badly misleading on the app's most important number)
- **Platforms:** both. Confirmed on iOS; the logic is in shared utils.
- **Where:** `packages/utils/src/day-nutrition.ts:10-21` (`planStatus(plannedKcal, target)` judges the _plan_ only),
  used in `src/features/dashboard/components/nutrition-summary.tsx:75`.
- **Steps:** a lose-weight user with a 1,701 kcal target logs meals plus a 900 kcal snack, then opens Today.
- **Expected:** the status reflects what was eaten plus what is still planned: on track, heading over, or "871 over".
- **Actual:**
  - The ring reads "2,572 of 1,701 kcal eaten · 871 over", and directly above it sits a green "PLAN ON TRACK" pill.
  - It also stays green at 1,672 eaten at 10:50 with a 759 kcal dinner still planned.
  - The macro bars stop at 100 % with no over-target state.
- **Evidence:** [evidence/UX-FOOD-05-1.jpg](evidence/UX-FOOD-05-1.jpg), [-2](evidence/UX-FOOD-05-2.jpg)
- **Sources:** L2-22
- **Recommendation:**
  - On Today, drive the pill from eaten plus remaining planned against the target ("On track" / "Heading over" /
    "Over by N").
  - Keep "Plan on track" for the Plan tab.
  - Add an over-target colour to the macro bars.

#### UX-FOOD-06 · Tracker writes fail silently while the UI shows success

- **Severity:** S1
- **Platforms:** both. **Code-confirmed, not reproduced on device**, because offline tracker writes weren't tested. The
  related silent failure in the Log-sheet search view was confirmed on Android (UX-FOOD-09).
- **Where:**
  - `app/tracker.tsx:154-170,185-216,229-260,266-286`: `logRecipe`, `unlogRecipe`, `copyDay`, `deleteCustomMeal`,
    `restoreCustomMeal` and `deleteEntries` have no `onError`.
  - `src/features/tracker/edit-entry-sheet.tsx:102-166`: Delete closes the sheet before mutating.
- **Steps:** with no connection or an API error, tick a planned meal, delete an entry, copy the day or tap Undo.
- **Expected:** roll back and say why.
- **Actual:** the tick and the green "Logged …" snackbar appear before the server answers, and stay when it fails. The
  totals include the failed log.
- **Evidence:** code (`tracker.tsx:154`: `useMutation({ onSuccess: … })` with no `onError`, and the snackbar is shown
  before the response).
- **Sources:** STATIC-42 (partial support: A2-02)
- **Recommendation:**
  - In `onError`, roll back `checkedMeals` and show a `userFacingErrorMessage` snackbar.
  - Show "Logged" only in `onSuccess`.
  - Fix this together with UX-FOOD-01.

#### UX-FOOD-07 · AI Chef on Android: the message box and Send button are hidden behind the keyboard

- **Severity:** S1 (a core Premium feature is unusable without a workaround)
- **Platforms:** Android (confirmed). iOS works: the composer rides above the keyboard (L3).
- **Where:** `app/chat.tsx:125-126`. `KeyboardAvoidingView behavior="height"` on Android doesn't resize under SDK 57
  edge-to-edge.
- **Steps:** Premium → AI Chef → tap "Message the chef…" → type.
- **Expected:** the composer rides on top of the keyboard.
- **Actual:**
  - uiautomator shows `chat-input` and `chat-send` at y≈2250, while the keyboard's top is at ≈1500.
  - The user types blind, and Return inserts a newline.
  - The only way to send is BACK (to close the keyboard), then Send. Every message needs this.
- **Evidence:** [evidence/UX-FOOD-07-1.jpg](evidence/UX-FOOD-07-1.jpg)
- **Sources:** A2-21
- **Recommendation:**
  - Use `react-native-keyboard-controller`'s `KeyboardStickyView` / `KeyboardAvoidingView`, which work under
    edge-to-edge, or an inset-driven bottom padding.
  - Add a Maestro assertion that `chat-send` is visible after focusing the input.
  - Use the same primitive for UX-X-02 and UX-X-05.

### Plan

#### UX-PLAN-01 · Regenerate mid-week rewrites past days and meals already eaten; Today then offers a second dinner

- **Severity:** S1
- **Platforms:** both (server + Today). Confirmed on iOS with a DB check.
- **Where:** Plan → Regenerate → "Regenerate 28 Sep – 4 Oct? This replaces the 21 planned meals."
- **Steps:**
  1. Friday: Today → dinner → I ate this.
  2. Plan → Regenerate → confirm.
  3. Go back to Today.
- **Expected:** only the remaining, uneaten meals are replaced (or the user is asked "From today / whole week").
  Logged meals and past days stay.
- **Actual:**
  - All 21 meals Mon–Sun are new, including Mon–Thu and today's eaten dinner.
  - Today shows "NEXT MEAL · DINNER · Creamy Tuscan Chicken · I ate this" although dinner is already logged (the ring
    includes the Pad Thai). "Dinner done" is lost, which invites a double log.
  - The past days no longer match what was eaten.
- **Evidence:** [evidence/UX-PLAN-01-1.jpg](evidence/UX-PLAN-01-1.jpg) (confirm copy), [-2](evidence/UX-PLAN-01-2.jpg)
  (plan after), [-3](evidence/UX-PLAN-01-3.jpg) (Today offers dinner again). DB: the old plan is ARCHIVED and a new
  one is ACTIVE.
- **Sources:** L2-09
- **Recommendation:**
  - Regenerate from today forward only, keeping past days and logged slots.
  - Say so in the confirm sheet: "Replaces 9 upcoming meals; meals you've logged stay".
  - Base "dinner done" on the log, not the slot's recipe id.

#### UX-PLAN-02 · "Cooking for: Two of us" doubles the user's own calories — every day is "over target" and "I ate this" logs 2×

- **Severity:** S1 (wrong health numbers for a common setting, from the first screen after onboarding)
- **Platforms:** both (server). Confirmed on Android with a DB check, and in code.
- **Where:**
  - `apps/api/src/application/meal-plan/curated-planner.ts:247-253,319`: `cookingForPortion = shape?.cookingFor === 2 ?
2 : null` _overrides_ the per-eater portion.
  - Totals in `nutrition-summary.tsx:75` and `rebalance.ts:256`.
  - `hero-meal-card.tsx:37` logs at the slot portion.
- **Steps:**
  1. Onboard with Lose weight (target 1,492 kcal) and How you cook → "Two of us".
  2. Open Today, then Plan.
- **Expected:** the user's portion follows their own 1,492 kcal target, and "two of us" scales only shopping, cost and
  cook quantities.
- **Actual:**
  - Every slot is stored with `portion: 2`.
  - Today's first screen reads "PLAN OVER TARGET · 2,802 planned". Plan says "About 1,310 kcal over" every day. The
    hero reads "858 kcal · 2× portion", and "I ate this" logs that.
  - The offered fix, "Smaller portions", shrinks the partner's food on the shopping list as well.
- **Evidence:** [evidence/UX-PLAN-02-1.jpg](evidence/UX-PLAN-02-1.jpg), [-2](evidence/UX-PLAN-02-2.jpg),
  [-3](evidence/UX-PLAN-02-3.jpg)
- **Sources:** A2-01
- **Recommendation:**
  - Keep `portion` as the eater's calorie-driven portion.
  - Carry "cooking for" as a separate household multiplier, the way `estimatedCost.portions` does for 3+ households.
    Use it only for shopping quantities, cost and cook-mode amounts.
  - Totals and "I ate this" must use the per-eater portion.
  - Use one shared helper with UX-REC-02.

#### UX-PLAN-03 · The Regenerate confirm has no busy state (multi-tap fires several generations) and swallows the free quota error

- **Severity:** S1
- **Platforms:** Android (confirmed with the API log). Not reproduced on iOS, where the local API answered in under
  1 s; it is still plausible on a slow network.
- **Where:**
  - `packages/ui-mobile/src/components/confirm-sheet.tsx:84-91`: the confirm button has no `loading`/`disabled`.
  - `app/(food)/meal-plan.tsx:250-262`: `generateMutation.onError` handles only `PRECONDITION_FAILED`.
  - The same ConfirmSheet is used by Copy day, Downgrade and health-data withdraw.
- **Steps:**
  1. On Free: Plan → Regenerate → tap the confirm button three times quickly.
  2. Regenerate again once the 3/day quota is used up.
- **Expected:** a spinner with extra taps ignored. When the quota is used: "You've used today's 3 free plan
  generations" with an Upgrade CTA, and the remaining count shown up front.
- **Actual:**
  - Two `mealPlan.generate` calls went out in one batch (one ok, one TOO_MANY_REQUESTS), burning the last free
    generation.
  - Later, the TOO_MANY_REQUESTS response left the sheet open with no message.
  - "Save and re-plan" in Plan settings also silently uses up a generation.
- **Evidence:** [evidence/UX-PLAN-03-1.jpg](evidence/UX-PLAN-03-1.jpg), [-2](evidence/UX-PLAN-03-2.jpg)
- **Sources:** STATIC-02, A2-13
- **Recommendation:**
  - Add `busy` and `error` props to `ConfirmSheet` and wire them for generate, copy day, downgrade and withdraw.
  - Map TOO_MANY_REQUESTS to the quota message with Upgrade.
  - Show "2 of 3 free regenerations left today".

### Recipes

#### UX-REC-01 · Diet checks rely on tags: AI recipes are "Checked for Paleo/Keto" when they aren't, and user recipes are flagged "Contains non-vegetarian" on plain oats

- **Severity:** S1 (the "Checked" shield, the app's core trust signal, is wrong in both directions)
- **Platforms:** both (server). Confirmed on iOS.
- **Where:** `apps/api/src/lib/curated-recipes/safety.ts:367-368` (`keto: { anyTag: ['keto'], forbidden: [] }`,
  `paleo: { anyTag: ['paleo'], forbidden: [] }`), and `RESTRICTION_RULES.vegetarian = { anyTag:
['vegetarian','vegan'], … }`, under which an untagged recipe fails.
- **Steps:**
  1. Alice (Vegetarian + Paleo): open the plan's lunch, "Mexican Quinoa Salad".
  2. Create your own recipe with just 60 g rolled oats and no diet tags, then open it.
- **Expected:**
  - Quinoa, corn and black beans aren't paleo, so the recipe should get a conflict chip, or at least no "Checked"
    claim.
  - Oats aren't "non-vegetarian".
- **Actual:**
  - (1) The shield reads "Checked for Vegetarian (you) · Paleo (you)", and the generator keeps feeding non-paleo meals.
    Keto has the same hole (a 110 g-carb recipe tagged keto passes).
  - (2) A red banner reads "Contains non-vegetarian, non-paleo. This recipe conflicts with your allergies or diet",
    and it is pinned on every cook-mode step.
  - Users will either stop trusting the safety system or tick tags blindly, which makes (1) worse.
- **Evidence:** [evidence/UX-REC-01-1.jpg](evidence/UX-REC-01-1.jpg) (quinoa "Checked for Paleo"),
  [-2](evidence/UX-REC-01-2.jpg) (oats "non-vegetarian")
- **Sources:** L2-38, L2-42
- **Recommendation:**
  - Give paleo a forbidden list (grains, legumes, dairy, refined sugar), and give keto a net-carb threshold computed
    from catalogue nutrition.
  - For user and imported recipes, derive diet tags from ingredient patterns (vegan auto-tagging already exists at
    `safety.ts:576`).
  - When a rule is tag-only, say "Tagged paleo (not verified)", never "Checked" or "Contains non-X".
  - Related copy: UX-PLAN-06.

#### UX-REC-02 · Premium household servings multiply the owner's gain-phase portion across the whole table — 12 eggs and 6 avocados for one breakfast

- **Severity:** S1
- **Platforms:** both (shared utils). Confirmed on iOS and in code.
- **Where:** `packages/utils/src/cook-mode.ts:30-36`, where `defaultCookServings` = `(portionSum ?? baseServings) ×
planPortion`; `app/recipe/[id].tsx:140-145`.
- **Steps:**
  1. Household: You (1), Mia (Kid, ½), Noah (Kid, 1). Goal is Gain muscle, so the plan marks meals "2× portion".
  2. Turn on Premium.
  3. Plan → Friday breakfast → recipe.
- **Expected:** 2 (you) + ½ + 1 = 3½ servings.
- **Actual:**
  - The stepper shows **6** (ceil(2.5)=3 × 2), and the list is 12 slices of bread, 6 avocados and 12 eggs.
  - Cook mode inherits it, and caps at 8.
  - On Free the same family shows 2 servings and Shop says "For 3 portions": three different numbers for one table.
- **Evidence:** [evidence/UX-REC-02-1.jpg](evidence/UX-REC-02-1.jpg), [-2](evidence/UX-REC-02-2.jpg), Free:
  [-3](evidence/UX-REC-02-3.jpg)
- **Sources:** L4-11
- **Recommendation:**
  - Table servings = owner plan portion + Σ member `portionFactor`. Round only for display.
  - Use one helper for the recipe page, cook mode and the shopping list (shared with UX-PLAN-02).
  - Show the breakdown, e.g. "You 2× · Mia ½ · Noah 1 = 3½".

### Cross-cutting

#### UX-X-01 · The iOS swipe-back bypasses the unsaved-changes guard: recipe drafts and routine edits are lost ("Keep editing" can't bring them back)

- **Severity:** S1 (data loss)
- **Platforms:** iOS (confirmed on the recipe form and the routine editor)
- **Where:** `app/recipe-form.tsx:257-268` and `app/gym/routine-editor.tsx:98-112` use
  `navigation.addListener('beforeRemove', e => e.preventDefault())`. On a native stack this can't cancel an
  interactive iOS swipe once it completes. The code comment claims it covers "the iOS swipe-back alike (AC9)".
- **Steps:**
  1. Cookbook → + New → type a name. Or: Routine → Edit → rename a day.
  2. Swipe from the left edge.
- **Expected:** the swipe is disabled while there are unsaved changes and the confirm appears, or "Keep editing"
  returns to the editor with the edits intact.
- **Actual:**
  - Recipe form: the screen pops straight back to the Cookbook and the draft is gone (2 out of 2 tries).
  - Routine editor: the editor slides away, the "Discard changes?" alert appears over the Routine screen, and "Keep
    editing" leaves the user on Routine with a clean editor.
  - The ← button path works.
- **Evidence:** [evidence/UX-X-01-1.jpg](evidence/UX-X-01-1.jpg) → [-2](evidence/UX-X-01-2.jpg) (recipe form),
  [-3](evidence/UX-X-01-3.jpg) → [-4](evidence/UX-X-01-4.jpg) (routine editor)
- **Sources:** L2-41, L1-37
- **Recommendation:**
  - Use `usePreventRemove(isDirty, …)` from React Navigation 7, which disables the native gesture while dirty, or
    `setOptions({ gestureEnabled: !dirty })`.
  - Apply the same guard to import (UX-REC-06), cook mode (UX-COOK-02), onboarding (UX-ONB-01) and gym setup
    (UX-GYM-03).
  - Add a Maestro swipe-back test.

### Gym

#### UX-GYM-01 · Implausible weights are accepted: a 1025 kg typo parks a finished workout that never syncs; setup shows raw Zod JSON

- **Severity:** S1. It is data loss of a finished workout, but conditional on a typo; the fix is a simple clamp.
- **Platforms:** iOS (confirmed end to end with a DB check). Android: the keypad was confirmed to accept "1025".
- **Where:**
  - `src/features/gym/workout/number-sheet.tsx:57-68`: the only limit is 5 digits.
  - The outbox validation in `src/features/gym/offline/outbox.ts:193-199`.
  - The setup wizard in `src/features/gym/setup/setup-wizard.tsx:232-262`.
- **Steps:**
  1. In a workout, enter "1025" for the set weight (meaning 102.5) and finish the workout.
  2. In setup, under "I know my weights", enter 4055 and tap Start training.
- **Expected:** input capped at the schema limits (≤ 1000 kg, ≤ 20 sets, ≤ 30 exercises), or a "1025 kg — are you
  sure?" check. Setup should validate each field inline.
- **Actual:**
  - The summary celebrates "1 PR" and says "next time starts from 520 kg", an average of 62.5 and 1025.
  - The server row stays `IN_PROGRESS`.
  - The only trace is in Gym settings → "Needs attention · invalid: Number must be less than or equal to 1000". Retry
    fails silently. After Discard, Today still shows "✓ Done today", so three places now disagree.
  - Setup: the "You're set" screen fills with `[{"code":"too_big","maximum":1000,…}]`.
- **Evidence:** [evidence/UX-GYM-01-1.jpg](evidence/UX-GYM-01-1.jpg) (keypad 1025), [-2](evidence/UX-GYM-01-2.jpg)
  ("starts from 520 kg"), [-3](evidence/UX-GYM-01-3.jpg) (parked), [-4](evidence/UX-GYM-01-4.jpg) (Today after
  Discard), [-5](evidence/UX-GYM-01-5.jpg) (setup Zod dump)
- **Sources:** STATIC-64, L1-35, L1-29
- **Recommendation:**
  - Clamp in `NumberSheet` and `nextLoad`, and confirm jumps larger than 2× the last weight.
  - Disable "Add set" at 20 and "Add exercise" at 30.
  - Validate setup fields inline on Next.
  - Let parked sessions open in edit mode, and surface them on Today ("Upper A didn't save — fix it").
  - Never average mismatched sets into a target.

#### UX-GYM-02 · "Start workout" / "Do it today" silently reopens a different workout that is already in progress

- **Severity:** S1
- **Platforms:** iOS (confirmed). Android: not attempted (the emulator crashed); the code is shared.
- **Where:** `src/features/gym/today/today-screen.tsx:149-167`; `use-active-workout.ts:69-72` returns the existing
  session ("the caller should offer Resume / Discard first"). Food's `todays-workout-card.tsx:48` already guards this.
- **Steps:**
  1. Start Upper A and log 2 sets.
  2. Kill and relaunch the app. Today shows the Resume card.
  3. Tap "Do it today" on Lower A, or Start workout, or Freestyle.
- **Expected:** "You have Upper A in progress — Resume / Finish it / Discard and start Lower A".
- **Actual:** the user lands in Upper A's logger. Lower A is never started, and the chosen day and "Time today" are
  dropped without explanation.
- **Evidence:** [evidence/UX-GYM-02-1.jpg](evidence/UX-GYM-02-1.jpg), [-2](evidence/UX-GYM-02-2.jpg)
- **Sources:** STATIC-62, L1-32
- **Recommendation:** while `activeWorkout.isActive`, replace the start actions with a ConfirmSheet offering Resume /
  Finish & start / Discard & start.

#### UX-GYM-03 · Hardware BACK in the gym setup wizard closes it and throws away every answer

- **Severity:** S1
- **Platforms:** Android (confirmed twice). Not reproduced on iOS, where setup is a gesture-disabled modal.
- **Where:** `src/features/gym/setup/setup-wizard.tsx:215-226` (`goBack` is wired to the on-screen chevron only).
- **Steps:**
  1. Fill steps 1–6, including weekdays, the reminder and starting weights.
  2. Press hardware BACK.
- **Expected:** BACK goes to the previous step, and asks "Leave setup?" on the first step.
- **Actual:** the wizard pops to "Set up your training". Reopening it starts at step 1 with defaults. Coming from
  onboarding, the training-day answers are lost too.
- **Evidence:** [evidence/UX-GYM-03-1.jpg](evidence/UX-GYM-03-1.jpg) (step 6 filled) →
  [-2](evidence/UX-GYM-03-2.jpg) (after BACK)
- **Sources:** STATIC-67, A3-01
- **Recommendation:**
  - Add a `BackHandler` / `usePreventRemove`: when `step > firstStep`, call `goBack()`; on the first step, confirm.
  - Keep the answers in state that survives a pop.

#### UX-GYM-04 · Gym reminders show "On · 07:00" although notifications are denied — nothing will ever fire

- **Severity:** S1 (the user believes reminders are set)
- **Platforms:** iOS (confirmed). Android: the deny path wasn't reachable. The code is shared.
- **Where:** `src/features/gym/settings/settings-screen.tsx:275-284`
  (`if (enabled) void ensureGymReminderPermission();` discards the result); `setup/setup-wizard.tsx:500-506`.
- **Steps:**
  1. Deny notifications for Chefer earlier in the session.
  2. Gym setup → Remind me 07:00.
  3. Open Gym settings.
- **Expected:** "Notifications are off for Chefer · Open Settings", with the toggle reflecting reality.
- **Actual:** reminders show On · 07:00 and the quiet-days nudge is selected, with no prompt and no warning.
  "Last sync: Never" also shows right after a successful setup.
- **Evidence:** [evidence/UX-GYM-04-1.jpg](evidence/UX-GYM-04-1.jpg)
- **Sources:** STATIC-66, L1-31 (related: UX-GYM-11)
- **Recommendation:**
  - Await the permission result. On denial, set the toggle Off and show a notice with `Linking.openSettings()` (the
    pattern is in `scan-meal-card.tsx:233`).
  - Re-check permission on foreground.

#### UX-GYM-05 · Gym setup ignores the Imperial choice made in onboarding and silently flips the whole app back to metric

- **Severity:** S1 (wrong units across food and gym for every US user and every non-locale user)
- **Platforms:** both (shared JS + API). Confirmed on iOS with a DB check.
- **Where:**
  - `src/features/gym/setup/setup-wizard.tsx:129-141` reads the cached `preferences.get` (`staleTime: 60_000`), then
    falls back to a locale guess.
  - `completeSetup` → `apps/api/src/application/gym/gym-profile.service.ts:234 syncPreferredUnits`.
- **Steps:**
  1. Register with Train + Plan meals. In How you cook, pick Imperial.
  2. Continue to "Next: set up training" → Units.
- **Expected:** lb is pre-selected. The copy under it says it is the same setting.
- **Actual:**
  - kg is pre-selected.
  - Start training writes `KG`, and the API mirrors it to `chef_profiles.preferredUnits = METRIC`. The DB showed
    IMPERIAL before and METRIC right after.
  - Recipes, shopping and weigh-ins silently switch to grams and kg.
  - The mirror case also happens: a European on a US-locale phone gets lb.
- **Evidence:** [evidence/UX-GYM-05-1.jpg](evidence/UX-GYM-05-1.jpg)
- **Sources:** L4-01
- **Recommendation:**
  - `await utils.preferences.get.fetch()` (or invalidate after onboarding's save) before defaulting.
  - Fall back to the locale only when `preferredUnits` is null.
  - Don't sync gym→food units when food units were set explicitly.

#### UX-GYM-06 · "End pause" does nothing on the day the pause started — the user stays "Training paused" with no way to start a workout

- **Severity:** S1 (a trapped state)
- **Platforms:** both (server). Confirmed on iOS with a DB check, and in code.
- **Where:** `apps/api/src/application/gym/training-pause.service.ts:38-47`. `end()` sets `endDate = today`, and the
  range is inclusive, so a pause started today can't be ended today.
- **Steps:**
  1. Gym settings → Pause training → 1 week → Pause.
  2. Gym Today → End pause. Tap it again.
- **Expected:** the pause is gone and Start workout is back.
- **Actual:** the card still reads "Training paused · Resumes 2026-10-02" (today), and further taps do nothing. There
  is no Start, no "Do another day" and no Freestyle, and today's reminders are suppressed.
- **Evidence:** [evidence/UX-GYM-06-1.jpg](evidence/UX-GYM-06-1.jpg), [-2](evidence/UX-GYM-06-2.jpg)
- **Sources:** L4-06
- **Recommendation:**
  - Delete the pause when `startDate >= today`; otherwise set `endDate = yesterday`.
  - Drop `activePause` optimistically on the client.
  - Add a test for "pause today → end today".

#### UX-GYM-07 · The plate calculator shows the wrong plates for 180 lb (45+10+5+2.5 per side = 170 lb)

- **Severity:** S1 (the lifter loads 170 and logs 180; progression builds on a weight never lifted)
- **Platforms:** both (shared utils). Confirmed on iOS and in code.
- **Where:** `packages/utils/src/gym/loads.ts:433-460`. `platesPerSide` is greedy, while `achievableLoads` uses subset
  sums, so the "nearest loadable" hint is suppressed.
- **Steps:**
  1. Units lb with the stock rack.
  2. The routine suggests Back Squat 180 lb.
  3. Open the weight keypad.
- **Expected:** 35 + 25 + 5 + 2.5 per side.
- **Actual:** "45 · 10 · 5 · 2.5" (62.5 per side) with no warning.
- **Evidence:** [evidence/UX-GYM-07-1.jpg](evidence/UX-GYM-07-1.jpg)
- **Sources:** L4-10
- **Recommendation:**
  - Compute plates with the same bounded subset-sum search as `plateTotals`, preferring the fewest plates.
  - Always show any remainder.
  - Add unit tests for 135/180/225/275 lb.

#### UX-GYM-08 · Exercises tab (Android): the filter chips slide up over the search box, so search can't be tapped — this survives a cold relaunch

- **Severity:** S1 (the library search is unusable). It was seen on the overloaded emulator but persisted after a cold
  relaunch; **re-check on a real Android device.**
- **Platforms:** Android
- **Where:** `src/features/gym/library/collapsible-chip-filters.tsx` (`Animated.View layout={LinearTransition}` +
  FadeIn/FadeOut), `library-screens/exercises-tab.tsx:111-141`.
- **Steps:**
  1. Use the add/swap pickers, which show the keyboard.
  2. Open Exercises.
  3. Force-stop and relaunch, then open Exercises again.
- **Expected:** the search box sits above the chips, as on the first visit.
- **Actual:** the chip block is drawn ~100 px higher, on top of the search field. Tapping the search selects "Chest".
- **Evidence:** [evidence/UX-GYM-08-1.jpg](evidence/UX-GYM-08-1.jpg) (correct first visit),
  [-2](evidence/UX-GYM-08-2.jpg) (overlap), [-3](evidence/UX-GYM-08-3.jpg) (a tap on search selects Chest)
- **Sources:** A3-06
- **Recommendation:**
  - Drop the `LinearTransition` layout animation on the chip container (at least on Android).
  - Keep the `TextInput` outside animated siblings.
  - Add a Maestro tappability assertion.

### Product and operations (beta readiness)

#### UX-PO-01 · No crash or JS-error reporting in the mobile app

- **Severity:** S1
- **Platforms:** both
- **Where:** `src/components/root-error-boundary.tsx:14` only calls `console.error`. `@sentry/react-native` isn't
  installed, and `EXPO_PUBLIC_SENTRY_DSN` is declared but unused (`src/lib/env.ts:13`).
- **Actual:** tester render errors and failed screens never reach the owner. Only native crashes surface, through App
  Store Connect, TestFlight or Play vitals.
- **Sources:** PO-01
- **Recommendation:**
  - Install Sentry in the 1.0.1 tester binary. It is native, so bundle it with #99.
  - Set the DSN in `eas.json` and the `mobile-update` env.
  - Capture in `RootErrorBoundary` and for 5xx responses.
  - Declare Diagnostics in App Privacy and Data safety.

#### UX-PO-02 · Mobile analytics is off in every production build, and the food funnel isn't instrumented

- **Severity:** S1 (the beta's learning goal can't be measured)
- **Platforms:** both
- **Where:**
  - There is no PostHog key in `eas.json`, `scripts/common.sh`, `publish-update.sh` or `deploy.yml`.
  - `plan_generated` and `meal_logged` exist only on web.
  - Mobile tracks only `app_opened`, premium prompts, consent, Following and gym events.
- **Sources:** PO-02
- **Recommendation:**
  1. Today: a SQL beta dashboard (daily actives; activation = a value event on 2 days within 7).
  2. Via OTA: add the key and the events `signup_completed`, `onboarding_completed{jobs}`, `plan_generated`,
     `meal_logged`, `list_opened/shared` and `cook_finished`. Update the privacy labels first.

#### UX-PO-03 · Premium-for-everyone on a free-only AI chain: about 12 AI weeks a day shared by all testers, with misleading copy when it runs out

- **Severity:** S1 (load-dependent; not observable with mock AI)
- **Platforms:** both
- **Where:**
  - `packages/types/src/plan-features.ts:101-106`: Premium chat is unlimited.
  - `apps/api/src/lib/ai/routing.ts`: Groq → Cloudflare free tiers.
  - `lib/ai/friendly-error.ts:10-11`: "give it a minute", although the real reset is daily.
- **Actual:** the first testers to flip Premium drain the shared pool. Later testers get "over capacity" on chat, scan
  and import, which will become the dominant bug theme and contaminate the "is Premium worth it" signal.
- **Sources:** PO-06
- **Recommendation:**
  - Fund the Groq Developer plan for the beta (≈ $0.012 a plan).
  - Or add per-user Premium chat caps and an org-level guard.
  - Change the copy to "try again later today".
  - Add a daily AI-failure alert, and size the Premium cohort to capacity.

#### UX-PO-04 · Play internal testing can't start: no Play Console account and no AAB pipeline

- **Severity:** S1 (Android testers can't be onboarded on schedule)
- **Platforms:** Android
- **Where:** `docs/app-store/release-1-checklist.md:31` (A6); `apps/mobile/scripts/release-android.sh` builds a
  sideload APK; there is no Play listing.
- **Sources:** PO-12
- **Recommendation:**
  - Create the Play developer account now; identity checks take days.
  - Build with `eas build -p android --profile production` (AAB).
  - Fill in Data safety and the content rating.
  - On a personal account, start the mandatory closed test (12+ testers for 14 days) in parallel.

---

## 4. S2 — Moderate (by area)

Format: **ID · title** — platform. What happens. **Fix.** _Sources._

### Account, settings, auth (ACC)

- **UX-ACC-04 · The Settings hub has no back button; 13 rows open only 3 screens, always at the top; "Emails" opens
  Profile** — both, confirmed on both.
  - Settings is the only stack screen with no back control (iOS has only the edge swipe).
  - Six Food rows all land on Preferences, scrolled to Food safety.
  - "Emails" and "Plan & Premium" open Profile, which has no email controls.
  - "How you cook" goes to a screen with no cooking section.
  - Training rows open "Set up your training first" with no action.
  - "Workout history" opens the Gym tab group on top of Food.
  - Settings has no Notifications, Legal, Version or Delete-account rows.
  - **Fix:**
    - Add the shared back row.
    - Use `?section=` anchors that scroll to and highlight the card, and title the screen after the row.
    - Point Emails to Weekly updates.
    - Add Notifications, Legal and Account rows.
    - Show a "Set up training" CTA for food-only users.
  - _STATIC-14, STATIC-25, L1-08, A1-09, L4-13 (part)._ Evidence:
    [evidence/UX-ACC-04-1.jpg](evidence/UX-ACC-04-1.jpg)
- **UX-ACC-05 · "What you use Chefer for" can't scroll, has no back control, and swipe-back drops changes** — iOS
  confirmed (S1-level at large text), Android (no back).
  - The six job cards sit in a plain `View`, and the last one is under the Save bar even at default size.
  - At accessibility-XL, three jobs can't be reached at all.
  - It spins forever on a load error, and save errors are silent.
  - **Fix:** wrap the list in a `ScrollView` with a sticky footer, add a back row and `ErrorState`, and either
    auto-save or confirm on leave.
  - _STATIC-24, L1-15, A1-09._ Evidence: [evidence/UX-X-08-3.jpg](evidence/UX-X-08-3.jpg)
- **UX-ACC-06 · The allergen list stops at 9; mustard, celery, lupin, sulphites and molluscs (EU-14) can only be kept
  as an unchecked note** — both.
  - The welcome screen promises "Allergies checked on every plan".
  - The field placeholder ("e.g. aubergine") is itself unsupported.
  - **Fix:**
    - Add the missing EU-14 allergens to the taxonomy and recogniser, and split crustaceans from molluscs.
    - Change the placeholder.
    - Before beta, at least list which allergens are checked.
  - _L1-10._
- **UX-ACC-07 · An email with a trailing space (QuickType or Gboard suggestion, autofill) is rejected as "Invalid
  email address"** — both, confirmed.
  - The space is invisible, and the old server error stays on screen at the same time.
  - **Fix:** use `z.string().trim().min(1).email()` in the shared schema and the API inputs, and clear the server error
    on change.
  - _STATIC-49, L1-04, A1-06._
- **UX-ACC-08 · Password managers are disabled on Register and Reset, while iOS offers to save a failed sign-in** —
  iOS confirmed.
  - `textContentType="oneTimeCode"` (an E2E workaround) means no strong-password suggestion and no save prompt after
    registering.
  - The wrong password is offered for saving after a failed login.
  - There is no `webcredentials` associated domain.
  - (L3's sweep noted a strong-password suggestion on Register, which contradicts the code; verify on a device.)
  - **Fix:**
    - Ship `newPassword` and gate the opt-out to E2E builds.
    - Clear the password on a failed sign-in.
    - Add the associated domain.
  - _STATIC-51, L1-03._
- **UX-ACC-09 · An expired or used reset link is a dead end; headings go stale; returning to login shows the old wrong
  password in clear text** — iOS confirmed.
  - "Request a new one." is plain text with no button.
  - The success card sits under "Choose a new password".
  - **Fix:**
    - Render the missing-token card (it has a button) on UNAUTHORIZED.
    - Swap the title on success.
    - Reset the login form on focus and prefill the email.
  - _STATIC-50, L1-07._
- **UX-ACC-10 · An expired session bounces the user silently to sign-in, and chat and scan handle 401 differently** —
  both, code-confirmed.
  - Unsaved input is lost.
  - Chat shows "Unauthorized", and scan shows "Sign in again to add photos".
  - **Fix:** export `handleUnauthorized`, use it from `chat-stream` and `media-client`, and show a "Session expired"
    snackbar on sign-in.
  - _STATIC-48._
- **UX-ACC-11 · Delete account: the wrong-password error renders below the fold of the sheet, and there is no
  confirmation after deletion** — iOS confirmed.
  - The field just clears itself.
  - After deletion the user drops onto "Welcome back" without a word. The deletion itself works.
  - **Fix:** show the error under the password field and refocus it, and show a one-time "Your account and data have
    been deleted".
  - _L1-27._
- **UX-ACC-12 · Sign-out and account deletion leave gym reminders and local gym data on the device** — both,
  code-confirmed.
  - Up to 14 days of "Push A is up next" keep firing.
  - The SQLite outbox, active session and `gym.*` keys survive deletion.
  - **Fix:** call `cancelAllGymReminders()` on sign-out and deletion, wipe the owner's local gym data on deletion, and
    warn before signing out with unsynced workouts.
  - _STATIC-70._
- **UX-ACC-13 · The post-upgrade CTA is always "Regenerate this week", whatever the user came for** — both, confirmed
  (L1, L2, L4).
  - Coming from Snap to log or AI Chef, the main button is a destructive regenerate (see UX-PLAN-01).
  - With no plan, it lands on an empty Plan tab.
  - **Fix:** make the CTA source-aware (Snap → open the picker; no plan → "Plan my week" that generates directly).
  - _L1-17, L2-23, L4-17 (part)._

### Onboarding (ONB)

- **UX-ONB-03 · Dismissing the health-consent sheet (Android BACK or ✕) silently clears every allergy, diet and
  dislike just picked** — Android confirmed (✕ behaves the same on both).
  - BACK counts as "Don't save it".
  - **Fix:** treat BACK, ✕ and the backdrop as cancel (keep the step and the selections). Only "Don't save it"
    declines.
  - _A1-04._ Evidence: [evidence/UX-ONB-03-1.jpg](evidence/UX-ONB-03-1.jpg) →
    [-2](evidence/UX-ONB-03-2.jpg)
- **UX-ONB-04 · "How you cook" resets units and currency to the region default each time the step re-mounts, and the
  region default overrides the metric body metrics just typed** — Android confirmed, both.
  - The flag is local `regionApplied` state.
  - Labels can read "70 cm" while 177.8 is saved.
  - An en-US phone flips a metric user to lb.
  - **Fix:** apply the region default once, in the wizard's initial state.
  - _STATIC-47, A1-05, A2-12 (units part)._
- **UX-ONB-05 · Body metrics: imperial height only as total inches; Preferences "Goal & body" is metric-only; no
  plausibility bounds** — both, confirmed.
  - "1,80" saves `heightCm: 1.8`, and an 8 kg weight produces a calorie target.
  - **Fix:**
    - Pass `units` to `MetricsStep` in Preferences, and use ft + in fields.
    - Validate height ~100–250 cm and weight 20–400 kg inline, and hide the estimate until values are plausible.
  - _STATIC-26, L1-11, A1-11._
- **UX-ONB-06 · On the numeric pad, the "Next" bar works only on Age, and a tap where it was changes the Activity
  level** — iOS confirmed.
  - Three inputs share one `inputAccessoryViewID`, and the bar vanishes or becomes a dead chip.
  - A second tap landed on "Lightly active" and changed the calorie target.
  - Gym setup weights also never show the bar.
  - **Fix:** one accessory id per input, or a stable label with the logic inside `onPress`. Add a Maestro test for
    Age → Next → Next → Done.
  - _L3-06._ Evidence: [evidence/UX-ONB-06-1.jpg](evidence/UX-ONB-06-1.jpg)
- **UX-ONB-07 · The onboarding Continue button is under the keyboard on every step with a field, and Continue drops a
  typed but not-added household member** — iOS and Android confirmed.
  - "Mia" was typed, Continue tapped, and no member was saved.
  - On Android, "Something else?" sits under the keyboard.
  - **Fix:** wrap the wizard in `KeyboardAwareScrollView footer=…`; on Continue, add the pending name or confirm it.
  - _L3-07, A1-10 (part)._ Evidence: [evidence/UX-ONB-07-1.jpg](evidence/UX-ONB-07-1.jpg)
- **UX-ONB-08 · A re-opened onboarding doesn't pre-fill the saved jobs and builds its steps from the old jobs;
  hydrated weights show raw floats** — both, code-confirmed, with raw floats seen on iOS ("86.1825503").
  - **Fix:** hydrate `jobs`, build the steps from the current choice, and round to 1 decimal.
  - _STATIC-45, L4 note._
- **UX-ONB-09 · Finish can fail silently and can be tapped again mid-save** — both, code-confirmed.
  - Four mutations have no `onError`, and the `catch {}` assumes the error was already shown.
  - **Fix:** `setError(userFacingErrorMessage(err))` and a single saving flag.
  - _STATIC-46._

### Food: Today, tracker, progress, AI Chef (FOOD)

- **UX-FOOD-08 · Today weight card: the keyboard covers the field and "+"; "Done" only closes the keyboard;
  submitting leaves the text, which leads to duplicate weigh-ins** — iOS and Android confirmed.
  - The first "+" tap is swallowed (UX-X-04).
  - **Fix:**
    - Make Today a keyboard-aware scroll.
    - Make the accessory button "Log", wired to submit.
    - Clear the field and show a "Logged · Undo" snackbar.
    - Dedupe same-value weigh-ins within a minute.
  - _L3-01, A2-12, L2-04._ Evidence: [evidence/UX-FOOD-08-1.jpg](evidence/UX-FOOD-08-1.jpg)
- **UX-FOOD-09 · Log sheet search: no loading, empty or error states; log failures are invisible in the search view;
  no gram limit** — Android confirmed, both.
  - 99,999 g of banana previews "88999 kcal". The server rejects it, and the button just stops spinning.
  - No debounce, so the results flicker.
  - **Fix:** debounce at 250 ms, add `placeholderData`, a loading row and "No matches — enter calories yourself",
    clamp the grams, and render mutation errors in the search view.
  - _STATIC-44, A2-02._
- **UX-FOOD-10 · Quick add (manual): with the keyboard up, errors render off-screen or behind the footer, so Log
  "does nothing"; fixed errors don't clear** — iOS and Android confirmed.
  - **Fix:** scroll the focused field above the footer, focus the first invalid field on submit, and clear an error on
    change.
  - _A2-04, L3-12, L2-25._
- **UX-FOOD-11 · "These don't add up" fires when only some macros are entered (e.g. calories + protein) and greys out
  Log** — both, confirmed.
  - Blank macros count as 0 g.
  - The edit sheet turns blanks into "0.0" and says "Log anyway".
  - **Fix:** skip the check when any macro is blank, keep Log enabled, store unknown macros as null, and say "Save
    anyway" in edit.
  - _A2-03, A2-08 (part)._
- **UX-FOOD-12 · Ingredient search "chicken" misses chicken breast and ranks egg (through an alias) and schmaltz
  above it** — both (server).
  - **Fix:** rank name-prefix matches and commonness first, demote alias-only matches, and add "Show more".
  - _L2-03._
- **UX-FOOD-13 · Today is stuck pulled down, with a spinning refresh and ~60 % blank screen, after returning from the
  tracker** — iOS confirmed.
  - **Fix:** bind `RefreshControl.refreshing` only to a user pull, not to focus refetches.
  - _L2-06._
- **UX-FOOD-14 · First-run "Target changed" banners with the wrong reason; "Keep mine" silently converts a Free user
  to fixed OWN targets** — iOS and Android confirmed.
  - The onboarding targets step shows the default 2,000 kcal, not the computed number.
  - On the first tracker visit: "A new weigh-in changed your targets 2000 → 1492", though the user never weighed in.
  - There are also ±1 g DAY_KIND notices.
  - **Fix:**
    - Compute the preview from the metrics entered.
    - Emit no notice when "from" is the pre-onboarding default, and none below a threshold.
    - "Keep" must not switch the mode silently.
  - _L2-07, A2-06._
- **UX-FOOD-15 · Today hero "I ate this": the card advances to the next meal under the thumb, so a double tap logs
  dinner at 11 am** — Android confirmed.
  - **Fix:** hold a disabled "Logged ✓ · Undo" state for about 2 s and debounce.
  - _A2-10._
- **UX-FOOD-16 · After Save in Edit entry the numeric keyboard stays up with nothing focused, and BACK then leaves the
  tracker** — Android confirmed.
  - **Fix:** call `Keyboard.dismiss()` in the shared `Sheet` close path.
  - _A2-07._
- **UX-FOOD-17 · Custom tracker entries are deleted by array index, so the wrong entry can be deleted** — both,
  code-confirmed.
  - **Fix:** add an optional `entryId` to `deleteCustomMeal` (an additive API change).
  - _STATIC-54._
- **UX-FOOD-18 · Tonight "Swap" opens next week's plan on Friday and Saturday evenings; Plan keeps yesterday's day
  after midnight** — both, code-confirmed.
  - **Fix:** push with `week=0&day=…&swap=dinner` params, and reset the day on focus when the date has changed.
  - _STATIC-11._
- **UX-FOOD-19 · Today and Plan name different sessions for the same training day; the "Why" sheet shows the
  rest-day target on a training day** — iOS confirmed.
  - **Fix:** one "today's session" selector, and show the training-day target.
  - _L2-32._
- **UX-FOOD-20 · Progress charts: the calorie axis goes negative (-149.6); empty days count as "Days logged"; odd
  ticks; the last label is clipped; a fixed 28-day window** — iOS confirmed.
  - **Fix:** clamp the axis at 0 with nice ticks, count only days with entries, add an empty-state macro chart and a
    range control.
  - _L2-28._
- **UX-FOOD-21 · AI Chef:**
  - The thread is wiped on leave.
  - Tool actions have no "View / Undo" chip.
  - Errors are raw ("Chat failed (502)", "Unauthorized"), and a failed message can't be resent.
  - The stream can't be stopped and continues after leaving.
  - 690-character messages render as 20-line walls.
  - Premium opens with no starter prompts.

  Both; iOS and Android confirmed.
  - **Fix:**
    - Persist the last thread per day.
    - Render action chips with Undo.
    - Map statuses to friendly copy, and restore the draft or offer "Tap to retry".
    - Use an AbortController and a Stop button.
    - Collapse long bubbles.
    - Reuse the free-tier example prompts as starters.
  - _STATIC-53, L2-26, L4-17, A2-22._

- **UX-FOOD-22 · After a cold start the Today calorie ring and macro bars are empty although 1,909 kcal is logged** —
  Android, seen twice on the overloaded emulator. **Re-check on a real device, and raise to S1 if it reproduces.**
  - It may share a cause with UX-X-10: a Reanimated value applied at mount.
  - **Fix:** initialise the shared value to the target when data is present at mount, and add an E2E assertion after
    relaunch.
  - _A2-15._ Evidence: [evidence/UX-FOOD-22-1.jpg](evidence/UX-FOOD-22-1.jpg)

### Plan (PLAN)

- **UX-PLAN-04 · Undoing a swap leaves the slot pinned as "Your pick"** — iOS confirmed with a DB check.
  - A later "keep my picks" regenerate keeps meals the user never picked.
  - **Fix:** restore the previous `pinned` value, or add a `restoreSlot` mutation.
  - _L3-04._
- **UX-PLAN-05 · The Lunch swap picker leads with breakfasts; every row loses a third of its width to an identical
  "Checked for 1" pill; no protein, time or sort** — iOS confirmed.
  - **Fix:** rank by slot type, state the safety check once in the header, show "kcal · g protein · min", and allow
    2-line names.
  - _L2-13._
- **UX-PLAN-06 · Diet-conflict copy is backwards: "⚠ Contains Paleo", "this recipe contains Vegetarian, which
  conflicts…"; own-recipe rows show no conflict before tapping** — iOS confirmed.
  - **Fix:** run conflicts through `restrictionWarningLabel` ("Not paleo"), name the recipe in the error, show conflict
    chips on rows, and explain thin pools.
  - _L2-30, L2-52._
- **UX-PLAN-07 · Cost labels don't match what they cover** — iOS and Android confirmed.
  - "Mon–Sun" sits on a today-to-Sunday estimate, and identical carried-forward weeks are priced 2–2.6× apart.
  - The summary pill is precise ("≈ 958,66 RON", "$303.94") and says "this week" for next week.
  - The share text says "This week's dinners" for next week.
  - Shop's "Est. total" is for the whole week next to a Fri–Sun list.
  - **Fix:**
    - Label the covered days.
    - Check the carry-forward multiplier (it may be applied twice).
    - Use `formatPriceRange` everywhere, and derive this/next week copy from `weekOffset`.
  - _L2-15, A2-16, A2-20 (part)._
- **UX-PLAN-08 · "36 g short on protein → See options" only offers "Bigger portions (+503 kcal)" to a weight-loss
  user** — iOS confirmed.
  - **Fix:** for protein gaps, offer a higher-protein swap or a protein snack, and never a kcal fix that overshoots by
    more than 10 % on a loss goal.
  - _L2-10._
- **UX-PLAN-09 · Logging one meal silently rewrites four future meals ("I adjusted Sunday dinner…"); the banner text
  is squeezed into a narrow column** — iOS confirmed.
  - Currently it acts on the wrong week too (UX-FOOD-02).
  - **Fix:** make rebalancing opt-in, or "Preview · Apply" with a diff; keep it reachable from Plan; stack the actions
    under the text.
  - _L2-40._
- **UX-PLAN-10 · My Weeks:**
  - Save and rename need two taps with the keyboard up.
  - The rename field on cards 3–4 opens under the keyboard, and rename can't be cancelled.
  - Rename silently truncates at 40 characters.
  - A failed unfollow is silent.
  - Confirms use native `Alert`s.

  Both, confirmed.
  - **Fix:** `keyboardShouldPersistTaps`, `onSubmitEditing`, Cancel, `maxLength` with a counter, an unfollow error,
    and ConfirmSheet.
  - _STATIC-29, L2-17, A2-17, L2-16 (truncation part)._

- **UX-PLAN-11 · Past weeks can only be restored into their own past week; the history view is read-only and shows the
  plan, not what was eaten** — both, confirmed.
  - **Fix:** add "Use this week again" (into this or next week) and "Save as a week", and overlay logged ticks.
  - _STATIC-31, L2-34._
- **UX-PLAN-12 · Household of 3, but "Cooking for: Just me"; "Checked for 2" reads like a head count; kids have no
  age** — iOS confirmed.
  - The "Set up your table" link pushes Household out of the wizard.
  - **Fix:**
    - When members exist, show a read-only "You + 2 — Edit table".
    - Label the chip "2 checks passed".
    - Add an optional age band for kids.
  - _L4-12._

### Shop and pantry (SHOP)

- **UX-SHOP-01 · "Add item" understands metric only: "2 lb chicken thighs" becomes "Lb chicken · 2 pcs" (and loses
  "thighs")** — iOS and Android confirmed.
  - The placeholder teaches kg to imperial users.
  - **Fix:** one shared unit parser (lb, oz, cup, tbsp, tsp, fl oz, can, pack), keep the remaining text as the name,
    and a units-aware placeholder.
  - _STATIC-17, L2-18, A2-18._
- **UX-SHOP-02 · Shop failures are silent; removing an item has no undo; categories always start collapsed; adding an
  item offline gives no feedback, which leads to duplicates** — both, confirmed.
  - **Fix:** `onError` snackbars, "Removed · Undo", persisted expansion state, and an optimistic insert with a pending
    marker plus an offline pill.
  - _STATIC-18, L2-18 (part), A2-19._
- **UX-SHOP-03 · Quantities you can't shop for** — iOS and Android confirmed.
  - Examples: "0.8 avocado", "5.5 cloves garlic", "Lemon zest 27 ml" and "Lemon juice 27 ml" on separate lines,
    "Onion 3.2 oz".
  - Eggs are under Proteins.
  - The header "Fri–Sun · For 7 dinners" contradicts itself.
  - Prices are precise to the bani.
  - **Fix:** round up to purchasable units, merge derived items, move eggs to Dairy & Eggs, and compute "For N" from
    the days covered.
  - _L2-19, A2-20 (part)._
- **UX-SHOP-04 · The same item isn't merged: "Egg · 4 pcs · ~€6.56" and "Eggs · 4 large · ~€12.70"** — iOS confirmed.
  - **Fix:** aggregate on the catalogue `ingredientId` with unit normalisation, and use one price source.
  - _L2-51._
- **UX-SHOP-05 · Pantry:**
  - The Free "In my kitchen" list only grows, because remove is premium-only.
  - The Pantry screen is reachable only by deep link.
  - "-5 g" silently becomes "some left".
  - Rows can't be edited, and there is no expiry and no undo.
  - Imperial users see grams.

  Both, confirmed.
  - **Fix:** allow remove on Free (or auto-expire), validate qty > 0, add an edit sheet with "use by", Undo, user
    units, and a link from Shop or More.
  - _STATIC-30, L2-27, A2-23._

- **UX-SHOP-06 · The Shop tab is unavailable offline on a cold start (supermarket basement)** — both,
  code-confirmed.
  - Ticks made during a live session did queue and sync correctly on Android.
  - **Fix:** persist `shoppingList.getForWeek` and `mealPlan.getForWeek` (plus `recipe.get` for cook mode) with a
    7-day maxAge.
  - _PO-07._

### Recipes, import, cookbook (REC)

- **UX-REC-03 · The recipe page shows "Recipe not found." for any error, including offline, with no retry; back is a
  no-op on a cold deep link** — both, code-confirmed.
  - **Fix:** `ErrorState` with Retry unless the error is NOT_FOUND; use `canGoBack() ? back() : replace('/')`.
  - _STATIC-06._
- **UX-REC-04 · Your own recipes can never be deleted; ⋯ on your own recipe only offers "Report a safety problem"** —
  both, confirmed.
  - **Fix:** add `recipe.deleteMine` (a soft delete), and an owner ⋯ menu with Edit, Duplicate, Share and Delete
    (confirm + Undo).
  - _STATIC-07, L2-44._
- **UX-REC-05 · Cookbook lists stop at 30 with no "load more"; "Mine" excludes the user's AI recipes, which "All"
  search finds** — iOS confirmed.
  - **Fix:** `useInfiniteQuery` with the existing cursor, and clear tab definitions.
  - _STATIC-08, L2-36._
- **UX-REC-06 · Import:**
  - An invalid link shows raw Zod JSON.
  - AI consent is asked before the link is validated.
  - BACK or swipe throws away a finished AI preview without asking.
  - An empty submit does nothing.
  - Save shows no confirmation.

  iOS and Android confirmed.
  - **Fix:** validate the URL client-side before consent, use `userFacingErrorMessage`, `usePreventRemove` while a
    preview exists, and on save `router.replace` to the recipe with a snackbar.
  - _STATIC-09, L2-45, A2-29._ Evidence: [evidence/UX-REC-06-1.jpg](evidence/UX-REC-06-1.jpg)

- **UX-REC-07 · A recipe imported from a YouTube video has no link or embed back to the video; after Save the app
  returns to an unrelated screen; spoon units become ml when scaled** — iOS confirmed.
  - **Fix:** always show the source (link chip, or the existing guarded embed), `replace` to the new recipe, and keep
    spoon units.
  - _L2-47._
- **UX-REC-08 · The recipe page has no "Add to my week", "Add to shopping list" or Share; ⋯ jumps straight to a
  safety report** — both, confirmed.
  - **Fix:** offer "Add to week" for every recipe (the sheet exists), add ingredients to the list, and use native
    Share; make ⋯ a menu.
  - _L2-33, A2-28._
- **UX-REC-09 · Discover is completely empty for a Vegetarian + Paleo user and says "Try clearing the filters" with
  no filter set** — iOS confirmed.
  - **Fix:** show `FilteredForLine` (hidden count + link to diets) in the empty state.
  - _L2-35._
- **UX-REC-10 · A failed recipe image leaves a blank white hero or thumbnail; the ← and ⋯ buttons sit on white and
  scroll away** — iOS confirmed (the image host intermittently returns 402).
  - **Fix:** a placeholder `onError`, and a sticky translucent header.
  - _L2-31._
- **UX-REC-11 · Recipe form: Qty accepts letters ("60rolled oats"); a 1-serving recipe opens at "2" with doubled
  ingredients but 1-serving nutrition and no note** — iOS confirmed.
  - **Fix:** `decimal-pad` plus sanitising, and "Cooking for 2 (recipe makes 1)" with nutrition scaled the same way.
  - _L2-43._
- **UX-REC-12 · Tapping Save while the photo is still uploading saves the recipe without its photo** — both,
  code-confirmed.
  - **Fix:** `onUploadingChange` from `PhotoField`, and block or queue Save until the upload finishes.
  - _STATIC-12._

### Cook mode (COOK)

- **UX-COOK-01 · A step timer dies when you change step, gives no alert at zero, and drifts in the background** —
  iOS confirmed.
  - **Fix:** keep timers at screen level as `endsAt` timestamps, show running timers in the header, and fire a haptic
    plus a local notification (reuse the rest-timer helper).
  - _STATIC-03, L2-39._
- **UX-COOK-02 · Leaving cook mode loses the step and ingredient ticks without asking** — iOS and Android confirmed.
  - Android BACK with the ingredients panel open exits completely.
  - The iOS swipe exits mid-cook.
  - Re-entering starts at step 1.
  - **Fix:** BACK closes the panel first, then confirms leaving when step > 0; persist the step and ticks per recipe
    for the session.
  - _A2-26, L2-39 (part)._
- **UX-COOK-03 · Cook mode spins forever on a load error (no close button) and breaks on a recipe with no steps ("Step
  0 of 0", NaN% progress)** — both, code-confirmed.
  - **Fix:** split loading from errors, with `ErrorState` + Close; when there are no steps, go to the ingredients
    view.
  - _STATIC-04._
- **UX-COOK-04 · Steps never show amounts; "Log this meal" picks the slot by the clock (a second "lunch" at 15:40)
  with no chooser or undo** — Android confirmed.
  - **Fix:** list each step's matched ingredients with scaled amounts, and add a meal-slot control next to Log.
  - _A2-27._

### Gym (GYM)

- **UX-GYM-09 · The rest timer vanishes when the workout is minimised and ends with no alert; TalkBack re-announces
  it every second** — both, code-confirmed.
  - **Fix:** show the countdown on the Resume and Today cards, schedule the notification at rest start, and announce
    only start, 10 s and end.
  - _STATIC-69._
- **UX-GYM-10 · The Android "Rest is over" notification arrives ~2 minutes late in the background** — Android
  confirmed (`dumpsys alarm` shows an inexact alarm).
  - **Fix:** exact alarms (`USE_EXACT_ALARM`), or a foreground-service chronometer notification like Hevy and Strong.
  - _A3-03._
- **UX-GYM-11 · The rest-timer "Allow notifications" button does nothing when notifications were denied earlier** —
  iOS confirmed.
  - **Fix:** check `getPermissionsAsync()` first and route to `openSettings()`.
  - _L1-34._
- **UX-GYM-12 · The first Gym Today scolds a brand-new user for "missed" sessions before they signed up, and shows
  competing workouts** — iOS and Android confirmed.
  - Examples: "0 of 4 this week" with 2 days left, "Lower A hasn't happened yet", "Upper A — Planned for Monday".
  - **Fix:** ignore planned days before setup, pro-rate the first week, and never show "Still time" and an overdue
    card together.
  - _L1-33, A3-02._
- **UX-GYM-13 · The "Your month in review" card can only be dismissed — there is no way to open the recap** — iOS and
  Android confirmed.
  - **Fix:** a primary "See September" button to Stats with the month pre-selected; require ≥2 sessions.
  - _L4-02, A3-04._
- **UX-GYM-14 · My routines → From a template → Create instantly replaces the active routine with no preview or
  confirm, and keeps the old weekly goal** — iOS confirmed.
  - **Fix:** a template preview, "Create" vs "Create and switch", and recompute the goal.
  - _L4-03._
- **UX-GYM-15 · Archiving the active routine gives a generic warning; Today then hides the week ring, Recent and "Log a
  workout you already did"** — iOS confirmed.
  - **Fix:** special-case the confirm, keep the history sections, and move Archive into a ⋯ menu.
  - _L4-04._
- **UX-GYM-16 · Pause training:** it always starts today and doesn't explain what pausing does. Dates are ISO, the end
  date is contradictory ("Paused until 10-08" / "Resumes 10-08"), and the reason shows as a raw enum. iOS confirmed.
  - **Fix:** a start choice, a one-line explanation, Intl dates, and reason labels.
  - _L4-07._
- **UX-GYM-17 · "Strength per kg of body weight" plots the raw e1RM in kg when no weigh-in exists, and ignores the
  onboarding weight** — iOS confirmed.
  - **Fix:** fall back to the profile weight or disable the toggle, and label it "× body weight".
  - _L4-08._
- **UX-GYM-18 · Editing a routine rep range throws away the starting weight from setup (40 kg → "Starting guess:
  25 kg") and awards a PR on the first session** — iOS confirmed.
  - **Fix:** keep the known weight and re-estimate through e1RM; no PRs on a first session.
  - _L1-40._
- **UX-GYM-19 · Dumbbell weights never say whether they are per dumbbell or the total** — both.
  - **Fix:** use "kg each" everywhere, and document the volume maths.
  - _A3-05._
- **UX-GYM-20 · The Food/Gym pill shows "Food" on Gym tabs (Stats after "All history", and Exercises after a
  relaunch)** — Android confirmed.
  - **Fix:** derive the pill from the route group, not the pathname.
  - _A3-07._
- **UX-GYM-21 · Custom exercise form:**
  - Raw enum chips (TREADMILL, SKI_ERG).
  - Raw Zod errors at the bottom of the form ("Array must contain at least 1 element(s)").
  - No maxLength, and a muscle cap that isn't enforced.
  - It spins offline.
  - Editing right after creating can overwrite the exercise with defaults.
  - Empty swap search offers no "Create 'T-bar'".

  iOS confirmed plus code.
  - **Fix:** human labels, field-level errors, limits, seed state when the data resolves, and a create-from-search
    shortcut.
  - _STATIC-74, L1-39._

- **UX-GYM-22 · Many gym mutations fail silently (routines, settings, Today actions, archive)** — both,
  code-confirmed.
  - The helpful "keep up to 30 routines" error is never shown, and offline stepper taps send stale values.
  - **Fix:** `onError` snackbars and optimistic saves with rollback.
  - _STATIC-68._
- **UX-GYM-23 · In the offline outbox, an ack for an older copy deletes a newer edit or delete queued meanwhile** —
  both, code-confirmed. A3 tried it and couldn't hit the in-flight window (not reproduced, not disproved).
  - **Fix:** compare the sent `clientUpdatedAt` before dropping an entry, and add a unit test.
  - _STATIC-63._
- **UX-GYM-24 · When the gym bootstrap fails online, Today spins forever, Stats shows "Loading…" and Exercises says
  "No exercises match"** — both, code-confirmed.
  - **Fix:** branch on `isError || paused`, with Retry and pull-to-refresh.
  - _STATIC-65._
- **UX-GYM-25 · A batch that keeps failing server-side retries forever, blocks other workouts and never shows its
  error** — both, code-confirmed.
  - **Fix:** after about 3 rounds, send one-by-one and park the failing item; show "N waiting · last error · Sync
    now".
  - _STATIC-71._
- **UX-GYM-26 · "Remove last set" and "Remove exercise" (log/edit modes) have no Undo; logging or editing a past
  session isn't crash-safe** — both, code-confirmed.
  - **Fix:** route through the Undo snackbar path, and persist drafts per mode.
  - _STATIC-72, STATIC-78._
- **UX-GYM-27 · History shows bodyweight and assisted loads wrongly ("0 kg × 12")** — both, code-confirmed.
  - **Fix:** pass `loadType` to `formatLoad`.
  - _STATIC-73._
- **UX-GYM-28 · The Routine-tab target sheet steps 2.5 kg / 5 lb from unrounded lb values (132.3 → 137.3), with no
  typing (40 → 150 kg takes 44 taps)** — both, code-confirmed.
  - **Fix:** reuse the summary Adjust sheet.
  - _STATIC-75._
- **UX-GYM-29 · "All history" opens Stats on Overview if Stats was visited; the week strip is colour-only for screen
  readers; online-only buttons don't react to connectivity** — both, code-confirmed.
  - **Fix:** sync the segment to the param, add labels like "Monday, done", and use `useIsOnline()`.
  - _STATIC-76._

### Following (SOC) — feature flag OFF in production

- **UX-SOC-01 · "Activity" lists only follow requests; there is no feed of what followed people cooked or trained** —
  iOS confirmed.
  - **Fix:** add friend events (workout finished / PRs, week planned, recipe added) that respect the sharing toggles,
    before the flag is turned on.
  - _L4-15._

### Cross-cutting (X)

- **UX-X-02 · The shared `Sheet` double-compensates the keyboard on iOS: sheets with a text field scroll their content
  away** — iOS confirmed.
  - "Log something" from the tracker opens blank.
  - The Log sheet hides its Meal selector.
  - The workout note field scrolls out of view.
  - A ~90 pt blank band appears in other sheets.
  - **Fix:** use one mechanism (KAV padding _or_ `automaticallyAdjustKeyboardInsets`), drop the bottom inset while the
    keyboard is up, and don't autofocus before the open animation. See §6.1.
  - _L3-02, L3-10, L2-01._ Evidence: [evidence/UX-X-02-1.jpg](evidence/UX-X-02-1.jpg),
    [-2](evidence/UX-X-02-2.jpg)
- **UX-X-03 · Every bottom sheet shows a grabber but can't be dragged down to dismiss** — both.
  - **Fix:** add a gesture-handler pan on the header and grabber, or remove the grabber until it works.
  - _L1-02, L2-02._
- **UX-X-04 · The first tap on a button next to a focused field only dismisses the keyboard** — iOS and Android
  confirmed.
  - Seen on the Today weight "+", the onboarding activity cards, Pantry "+", import Preview and My Weeks.
  - **Fix:** `keyboardShouldPersistTaps="handled"` on every form ScrollView (lint for it).
  - _L2-04, STATIC-29, L2-17, L2-27, L2-45, A2-17._
- **UX-X-05 · The keyboard covers fields on Preferences (budget, targets), Household and More; number pads have no
  Done or Next** — iOS and Android confirmed.
  - **Fix:** `KeyboardAwareScrollView` plus `NumericReturnBar` (one id per field).
  - _STATIC-27, L3-09, A1-10 (part)._
- **UX-X-06 · Server validation errors reach users as raw Zod JSON** — confirmed on iOS (import, gym setup, custom
  exercise).
  - `userFacingErrorMessage` passes BAD_REQUEST messages through verbatim.
  - **Fix:** map JSON-looking or `zodError` messages to "Check the value you entered", and mirror the bounds
    client-side.
  - _STATIC-23 (+ L2-45, L1-29, L1-39)._
- **UX-X-07 · The app is light-only, but `userInterfaceStyle: 'automatic'` makes the keyboard, alerts, the share sheet
  and pickers dark over light screens** — iOS confirmed.
  - **Fix:** set `userInterfaceStyle: 'light'` in the next native build, and plan dark mode later.
  - _L1-26, L2-50, PO-08._ Evidence: [evidence/UX-X-07-1.jpg](evidence/UX-X-07-1.jpg),
    [-2](evidence/UX-X-07-2.jpg)
- **UX-X-08 · Large text (accessibility-XL) breaks safety and data UI** — iOS confirmed.
  - Allergen and diet chips truncate ("⚠ Contains no…").
  - Fixed `h-11` inputs clip typed text (a half "72").
  - Segmented labels wrap ("Breakfa/st").
  - Gym exercise names truncate, and chart labels don't scale.
  - The jobs list can't be reached (UX-ACC-05).
  - **Fix:**
    - Let safety chips wrap.
    - Use `min-h-11 py-2` on inputs.
    - Use short segment labels or `adjustsFontSizeToFit`.
    - Cap `maxFontSizeMultiplier` on dense numeric UI.
  - _STATIC-52 (large-text part), L2-49, L3-14, L4-18._ Evidence: [evidence/UX-X-08-1.jpg](evidence/UX-X-08-1.jpg),
    [-2](evidence/UX-X-08-2.jpg)
- **UX-X-09 · Accessibility basics** — both.
  - Inputs are named only by their placeholder: auth fields, height and weight, chat, shop and search fields, gym
    setup weights ("kg"), routine fields.
  - Chips are 36 pt with colour-only selection (tracker portion and meal, pantry units).
  - Text links are smaller than 44 pt (Welcome Terms, login/register).
  - Shop category headers don't announce expanded or collapsed.
  - **Fix:** `accessibilityLabel` and `accessibilityState` everywhere, and `min-h-11`.
  - _STATIC-52, STATIC-55, STATIC-77, STATIC-18 (a11y part), STATIC-32 (chips), A1-02 (size), A1-12 (part)._
- **UX-X-10 · Segmented controls draw the white "selected" pill under the first option instead of the saved one** —
  Android confirmed.
  - Seen on Plan settings "Cooking for" and "How long".
  - **Fix:** compute the clamp inside the worklet from a shared width, and add a test with the value at index 1.
  - _A2-14._ Evidence: [evidence/UX-X-10-1.jpg](evidence/UX-X-10-1.jpg)
- **UX-X-11 · A cold start reopens the last-tapped mode, so a food-only user who once peeked at Gym lands on "Set up
  your training" every launch** — iOS confirmed both directions.
  - **Fix:** persist the mode only once that side is set up; otherwise land by jobs.
  - _L4-14._

### Product (PO)

- **UX-PO-05 · The feedback channel lacks context, isn't reachable from Gym mode, and alerts nobody** — both.
  - The path is hard-coded (`mobile/more`), with no build, OS or screen attached.
  - Feedback is read through Prisma Studio and cascade-deleted with the account.
  - **Fix:** attach `CURRENT_BUILD`, the OS and the route; add a Gym entry point and a "Report this" button on the
    error boundary; email or webhook each submission.
  - _PO-04._
- **UX-PO-06 · Free recipe variety is too thin for a multi-week beta, especially for restricted diets, and has no
  Romanian dishes** — both.
  - The pool has 64 recipes. Vegan has 6 dinners, and vegan + GF has 4.
  - **Fix:** at least 14 dinners per common diet, plus 10–15 Romanian staples.
  - _PO-05._
- **UX-PO-07 · The production API and the legal and support URLs live on `chefer.duckdns.org`, hard-coded into every
  binary** — both.
  - It also leaks into the UI ("Large histories export best from chefer.duc…").
  - **Fix:** register a domain now and keep duckdns as an alias.
  - _PO-09, L1-19 (part)._
- **UX-PO-08 · No food-side re-engagement, and no notifications hub** — both, confirmed on iOS and in code.
  - Food reminders: only an opt-in Monday/Sunday pair at the bottom of Preferences.
  - Nothing is offered in onboarding, and there are no log or weigh-in reminders.
  - Email confirmation opens the web app.
  - **Fix:** a one-question opt-in at the end of onboarding, a Settings → Notifications screen, and a universal link
    for email confirmation.
  - _PO-10, L4-13._
- **UX-PO-09 · The app and the store listing are English-only for a Romania-first beachhead** — both.
  - **Fix:** a Romanian store listing (metadata only), the language question in the exit survey, and Romanian
    staples.
  - _PO-13._

---

## 5. S3 — Polish

| ID         | Title                                                                                                                                                                                                                                                                                                  | Platform     | Fix                                                                                                          | Sources                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| UX-ACC-14  | Auth forms re-centre vertically, so the fields jump when errors appear or clear                                                                                                                                                                                                                        | Both         | Top-align, or reserve the error-line height                                                                  | L1-05                                            |
| UX-ACC-15  | Register "An account with this email already exists" is a dead end and stays visible after the email changes                                                                                                                                                                                           | Both         | Sign in / Reset links; clear on change                                                                       | L1-06                                            |
| UX-ACC-16  | A stale "Passwords do not match" appears under identical passwords (3 of 3 on iOS)                                                                                                                                                                                                                     | iOS          | Re-validate confirm on change                                                                                | L1-21                                            |
| UX-ACC-17  | An abandoned sign-up keeps the email and password in memory and pre-fills them for the next person                                                                                                                                                                                                     | Both         | Exclude passwords from the draft; clear on unmount                                                           | STATIC-56, A1-07                                 |
| UX-ACC-18  | Login and register can be submitted twice from the keyboard                                                                                                                                                                                                                                            | Both         | Guard on `isPending`; `editable={!isPending}`                                                                | STATIC-57                                        |
| UX-ACC-19  | Legal links: Welcome, More, Profile and the consent sheets open the browser while Register opens in-app; an unknown `/legal/x` shows Terms; More signs out without a confirm; Household and Following share one icon                                                                                   | Both         | `router.push('/legal/…')` everywhere; the Settings ConfirmSheet; a distinct icon                             | STATIC-36, STATIC-60, L1-18, L1-28, A1-02, A1-08 |
| UX-ACC-20  | Notifications denied: the text says "turn them on in Settings" with no Open Settings button; no re-check on foreground                                                                                                                                                                                 | Both         | `Linking.openSettings()` button                                                                              | STATIC-35, L1-13                                 |
| UX-ACC-21  | Saving Goal & body leaves "Your targets" on the same screen showing the old number                                                                                                                                                                                                                     | Both         | Invalidate the targets and the dashboard on save                                                             | L1-12                                            |
| UX-ACC-22  | "Your export is ready." shows even when the share sheet was cancelled                                                                                                                                                                                                                                  | iOS          | Toast only on `sharedAction`                                                                                 | STATIC-37                                        |
| UX-ACC-23  | Weekly budget: "abc" erases the saved budget with "Saved ✓"; 5000 is silently stored as 2000                                                                                                                                                                                                           | Both         | Inline validation; show the cap                                                                              | STATIC-39                                        |
| UX-ACC-24  | Premium sheet terms say "unlocks every feature below", but the list is above                                                                                                                                                                                                                           | Both         | "everything listed above"                                                                                    | L1-16 (copy part)                                |
| UX-ACC-25  | More → Feedback: Send is under the keyboard (iOS and Android); an empty Send does nothing                                                                                                                                                                                                              | Both         | Keyboard-aware; `disabled={!text.trim()}`                                                                    | L3-08, A1-10 (part), A1-13                       |
| UX-ACC-26  | Delete-account sheet: with the password keyboard up, the first tap on Cancel only closes the keyboard                                                                                                                                                                                                  | iOS          | Fix R-03 for the secure field (`onPressIn` dismiss)                                                          | L3-11                                            |
| UX-ACC-27  | Card text clipped mid-word instead of wrapping ("…or dele", "chefer.duc", "Sent. Check your inbox for the confirmation l…")                                                                                                                                                                            | iOS          | `min-w-0` / full-width wrapper in Card rows                                                                  | L1-19, L4-13 (part)                              |
| UX-ONB-10  | Onboarding nits: "1 days a week"; "Run or ride?" with no ride; the "Profile → Household" path is wrong; teal Android switches; emoji goal icons next to Ionicons; a lone "Sun" chip on its own row                                                                                                     | Both         | Pluralise; fix the copy; token colours; Ionicons                                                             | STATIC-58, A1-12, L1-22 (design part)            |
| UX-FOOD-23 | Returning to Today after the hour changes swaps the dashboard for a full-screen spinner                                                                                                                                                                                                                | Both         | `placeholderData: keepPreviousData`                                                                          | STATIC-19                                        |
| UX-FOOD-24 | The ring caption "of 1,701 kcal eaten" collides with the ring stroke on 390 pt screens                                                                                                                                                                                                                 | iOS          | Shorter caption / maxWidth                                                                                   | L2-11                                            |
| UX-FOOD-25 | Tracker polish: two stacked "ALSO EATEN" headers; "Copied 0 entries" / "Copied 1 entries"; unlabelled macro fields; off-plan entries lose their meal slot and sit under the Snap upsell; "This week's plan" lists one day; chat "resets at midnight UTC"                                               | Both         | Merge the sections; pluralise; labels; group by meal; local reset time                                       | L2-21, STATIC-61, A2-08, A2-09                   |
| UX-FOOD-26 | Snap result: no photo thumbnail, the name is truncated, kcal can't be edited, there is no "Logged" confirmation, and there is no request timeout                                                                                                                                                       | iOS          | Thumbnail, 2-line name, success snackbar + Undo, 30 s timeout                                                | L2-24, STATIC-59                                 |
| UX-FOOD-27 | The Today weight sparkline renders as two flat blocks with no labels                                                                                                                                                                                                                                   | iOS          | Mini line chart or "78.4 → 70.8 kg"                                                                          | L2-29                                            |
| UX-FOOD-28 | Progress: one consent Modal per weigh-in row; the weight card disappears when the calorie summary fails                                                                                                                                                                                                | Both         | Lift consent; render the weight card outside the error branch                                                | STATIC-38                                        |
| UX-PLAN-13 | The meal-card badge row overflows ("Your pick" is cut by the portion chip)                                                                                                                                                                                                                             | iOS, Android | `flex-wrap` + `min-w-0`                                                                                      | L2-14, A2-24                                     |
| UX-PLAN-14 | Undo-after-Regenerate and pin mutations fail silently; the Plan day view has no pull-to-refresh                                                                                                                                                                                                        | Both         | `onError` snackbars; `RefreshControl`                                                                        | STATIC-20                                        |
| UX-PLAN-15 | Leftover "History" copy after the merge into My weeks                                                                                                                                                                                                                                                  | Both         | Rename                                                                                                       | STATIC-34                                        |
| UX-SHOP-07 | Pantry form: qty "abc" saved as "some left"; 36 pt unit chips with colour-only selection; metric-only units; a load error shows the empty copy                                                                                                                                                         | Both         | Inline error, `min-h-11`, `accessibilityState`, `ErrorState`                                                 | STATIC-32                                        |
| UX-REC-13  | Cookbook cards are ~395 pt tall (1.3 per screen); duplicates can't be told apart                                                                                                                                                                                                                       | iOS          | Compact rows or a 2-column grid; show the source or date                                                     | L2-37                                            |
| UX-REC-14  | Import preview: a disabled "Cheferized for you" card looks selectable; "3 piece garlic — No weight for 'piece'" leaves the fix to the user                                                                                                                                                             | Both         | Fold it into the banner; add piece weights to the catalogue                                                  | L2-46                                            |
| UX-REC-15  | Link and text import use a read-only preview while video uses an editable form                                                                                                                                                                                                                         | Both         | Use the editable review everywhere                                                                           | L2-48                                            |
| UX-COOK-05 | Servings chosen on recipe detail are dropped when tapping Cook; the stepper is 31–36 pt and capped at 8 (cook mode allows 20)                                                                                                                                                                          | Both         | Pass `servings`; `h-11` stepper; the same max                                                                | STATIC-05, A2-25 (part)                          |
| UX-GYM-30  | Setup "Starting weights" opens at the stale scroll offset of the previous step                                                                                                                                                                                                                         | iOS          | `scrollTo({y:0})` on step change                                                                             | L1-30                                            |
| UX-GYM-31  | Gym Today and Routine disagree on what's next                                                                                                                                                                                                                                                          | Both         | One `nextSession()` selector                                                                                 | L1-38                                            |
| UX-GYM-32  | "Next time changed after your edit" names the session's old weekday after its date was changed                                                                                                                                                                                                         | Both         | Use the edited `localDate`                                                                                   | L4-05                                            |
| UX-GYM-33  | Stats polish: 12 muscles share 6 legend colours; odd axis ticks; "Load more" shown when there is nothing more; the exercise history chart is unlabelled with ISO dates; "Last 1 sessions"; the summary and detail disagree on the PR                                                                   | Both         | Distinct colours or top-5; nice ticks; `hasNextPage`; labels; shared PR rule                                 | L4-09, A3-09, A3-10                              |
| UX-GYM-34  | Gym polish: ISO dates in session detail and settings; archived routines and exercises have no clear Restore or Delete; the Stats "More" placeholder; duplicate list keys; iOS number pads with no Done; the rest bar covers "Finish workout"; recap error copy                                         | Both         | Intl dates; an Archived section; drop the placeholder; key on the session-exercise id; pad by the bar height | STATIC-80, L1-41                                 |
| UX-GYM-35  | "No technique video yet" is a full-width button that does nothing; the exercise notes field sits under the keyboard and is one line                                                                                                                                                                    | Both         | Muted text; keyboard-aware; `min-h-11 h-auto`                                                                | STATIC-79, A3-08                                 |
| UX-SOC-02  | The Following badge double-counts one request ("2")                                                                                                                                                                                                                                                    | iOS          | Exclude request rows from the unread-activity count                                                          | L1-23                                            |
| UX-SOC-03  | Following polish: duplicate "Invite someone"; "Report and block Chefer"; search doesn't show who is private; the invite link is a bare origin; "avg 3,002 kcal/day" shown although targets sharing is off; the accept toast says "meals and workouts" to a food-only user; follow-back isn't suggested | Both         | Per the item                                                                                                 | L1-25, L4-16                                     |
| UX-X-12    | Failed loads render as "Loading…" or an empty state (Targets card, Plan settings, Replace picker "No recipes match", Consent history "Nothing recorded yet", Profile "—", Following gate)                                                                                                              | Both         | Branch on `isError` → `ErrorState` + Retry                                                                   | STATIC-21, STATIC-33                             |
| UX-X-13    | Two confirm-dialog systems (native `Alert` vs `ConfirmSheet`)                                                                                                                                                                                                                                          | Both         | Migrate to ConfirmSheet after UX-PLAN-03                                                                     | STATIC-16                                        |
| UX-X-14    | Text below 12 px and low-contrast labels (11 px gray-400 under the ring; 10 px in gym settings)                                                                                                                                                                                                        | Both         | `text-xs` / `text-muted-foreground` minimum                                                                  | STATIC-15                                        |
| UX-X-15    | Hard-coded `en-GB` / `en-US` dates and number formats                                                                                                                                                                                                                                                  | Both         | Shared `formatDate` / `formatKcal` using the device locale                                                   | STATIC-40                                        |
| UX-X-16    | Snackbar Undo: the 8 s timer isn't paused on touch, and a tap as it fades falls through to the control underneath (opens a picker, ticks another row)                                                                                                                                                  | Both         | Pause on touch; ~10 s; ignore taps in the bar's area for 300 ms after it hides                               | L2-12 (downgraded from S1), L3-03                |
| UX-X-17    | Search fields: no clear button, a generic return key, and scrolling the list doesn't dismiss the keyboard (Cookbook, Exercises, Replace picker)                                                                                                                                                        | iOS          | Shared `SearchField` (`returnKeyType="search"`, `clearButtonMode`, `keyboardDismissMode="on-drag"`)          | L3-13                                            |
| UX-PO-10   | The context-aware landing (B-04) is half wired: no live training-day or in-progress-workout input, and no 30-minute foreground re-landing                                                                                                                                                              | Both         | Feed the active session and training state into `landingFor`                                                 | PO-11                                            |

---

## 6. Cross-cutting themes, each with the one structural fix that removes most of its findings

### 6.1 Keyboard handling (≈15 findings)

**Findings:** UX-FOOD-07, UX-X-02, UX-X-04, UX-X-05, UX-FOOD-08, UX-FOOD-10, UX-FOOD-16, UX-ONB-06, UX-ONB-07, UX-PLAN-10,
UX-ACC-25, UX-ACC-26, UX-GYM-35, and part of UX-X-08.

**Root causes:**

1. On iOS, the shared `Sheet` and `KeyboardAwareScrollView` apply KAV padding _and_ `automaticallyAdjustKeyboardInsets`.
2. Plain `ScrollView`s on Today, Preferences, Household, More, the onboarding wizard and My weeks have no
   keyboard-aware scrolling and no `keyboardShouldPersistTaps`.
3. Under SDK 57 edge-to-edge, Android doesn't resize, so `KeyboardAvoidingView behavior="height"` does nothing (chat).
4. A shared `inputAccessoryViewID` with a changing label breaks the numeric "Next" bar.

**Structural fix:**

- Adopt `react-native-keyboard-controller` (`KeyboardAwareScrollView`, `KeyboardStickyView`) as the _only_ keyboard
  primitive, inside `Sheet`, `Screen` forms and chat.
- Make `keyboardShouldPersistTaps="handled"` the default in the shared scroll component.
- Use one `NumericReturnBar` per input.
- Add a Maestro "focus every input on every screen, assert the primary action is visible and tappable once" sweep on
  both platforms (L3's matrix is the checklist).

### 6.2 Back navigation and unsaved-work guards (≈9 findings)

**Findings:** UX-X-01, UX-ONB-01, UX-GYM-03, UX-REC-06, UX-COOK-02, UX-ACC-05, UX-ONB-03, UX-FOOD-16, UX-X-11.

**Root cause:** `beforeRemove.preventDefault()` can't stop a completed iOS native-stack swipe. Android hardware BACK
isn't intercepted outside the workout screens. Wizard progress lives only in memory.

**Structural fix:**

- Write one `useUnsavedGuard(isDirty, { onBack })` hook. It wraps `usePreventRemove` (which disables the iOS gesture
  while dirty), `BackHandler` (Android: step back or close the inner panel first, then confirm), and a shared
  ConfirmSheet.
- Apply it to onboarding, gym setup, the recipe form, the routine editor, import, cook mode, settings/jobs and the
  workout log/edit modes.
- Persist wizard drafts (onboarding and gym setup) to storage per step.
- Add a Maestro swipe-back and BACK test per guarded screen.

### 6.3 Silent failures, raw errors and "Loading…" forever (≈20 findings)

**Findings:** UX-FOOD-06, UX-FOOD-09, UX-PLAN-03, UX-PLAN-14, UX-SHOP-02, UX-GYM-22, UX-GYM-24, UX-GYM-25, UX-ONB-09,
UX-ACC-03, UX-ACC-10, UX-X-06, UX-X-12, UX-REC-03, UX-COOK-03, UX-FOOD-21, UX-GYM-21, UX-REC-06.

**Root causes:**

- Mutations without `onError`.
- Queries that branch on `isLoading || !data` instead of `isError`.
- `userFacingErrorMessage` passes BAD_REQUEST/Zod text through.
- `ConfirmSheet` has no busy or error props.

**Structural fix:**

- A default `MutationCache.onError` that shows a `userFacingErrorMessage` snackbar unless the mutation opts out with
  `meta.silent`.
- A `useQueryState(query)` helper that returns `loading | error | empty | data` (lint against `isLoading || !data`).
- Map Zod and JSON messages to plain copy, and mirror schema bounds client-side.
- `ConfirmSheet` `busy`/`error`.
- Ship Sentry at the same time (UX-PO-01), so the owner sees what testers saw.

### 6.4 Units, locale and numbers (≈12 findings)

**Findings:** UX-GYM-05, UX-ONB-04, UX-ONB-05, UX-SHOP-01, UX-SHOP-03, UX-SHOP-05, UX-GYM-07, UX-GYM-17, UX-GYM-19,
UX-PLAN-07, UX-X-15, UX-REC-07, UX-FOOD-20.

**Root cause:** each surface reads units from a different source (cached prefs, locale guess, gym profile), and the
gym→food sync overwrites the food setting. Parsing and formatting are per-screen.

**Structural fix:**

- One `useUnits()` hook backed by a freshly fetched `preferredUnits`, never synced gym→food without asking.
- One shared quantity parser (with imperial and spoon units) and one formatter set (`formatQty`, `formatPriceRange`,
  `formatDate`, `formatKcal` using the device locale) in `@chefer/utils`.
- Plausibility bounds for body metrics and loads defined once and shared by the client and the API.

### 6.5 Portion and plan resolution in the food loop (5 S1s)

**Findings:** UX-PLAN-02, UX-REC-02, UX-FOOD-02, UX-FOOD-01, UX-PLAN-01 (plus UX-PLAN-09, UX-FOOD-03, UX-FOOD-15).

**Root cause:** "Which plan is today's?" and "how much does _this eater_ eat versus how much do we _cook_?" are each
answered in several places.

**Structural fix:**

- One server-side `planForDate(userId, date)`, used by the tracker, the rebalance, Today, Plan and Shop.
- One `portions(eater, table)` helper that returns `{ eaterPortion, cookServings, shopMultiplier }`, used by the
  planner, the dashboard, recipe/cook and the shopping list.
- Tracker UI state derived from the server log.
- Regenerate scoped from today forward.
- Write contract tests for these first; most S1 food bugs disappear.

### 6.6 Light-only theme

**Findings:** UX-X-07.

The app is light-only, but it declares automatic appearance, so system UI renders dark over light screens.

**Fix:** set `userInterfaceStyle: 'light'` in the next binary (together with Sentry and #99) and schedule dark mode
(B-23) after the beta. Gym users at night are the most likely to ask for it.

### 6.7 Large text and accessibility

**Findings:** UX-X-08, UX-X-09, UX-ACC-05, UX-X-14, UX-GYM-09 (TalkBack).

**Root cause:** fixed `h-11` inputs, `numberOfLines={1}` on safety text, chips at 36 pt, and placeholder-only labels.

**Structural fix:**

- `Input` becomes `min-h-11`.
- The shared `Chip`/`SegmentedControl` get `accessibilityState` and a 44 pt hit area.
- Safety chips always wrap.
- Add a lint rule for a `TextInput` without `accessibilityLabel`.
- Run a VoiceOver/TalkBack smoke pass on onboarding, the tracker and the workout logger before public launch. It
  wasn't run in this audit.

### 6.8 Notifications and permissions

**Findings:** UX-GYM-04, UX-GYM-11, UX-GYM-10, UX-ACC-20, UX-ACC-12, UX-PO-08, UX-COOK-01, UX-GYM-09.

**Root cause:** the permission result is discarded, there is no "denied" UI, and notifications are scheduled only on
background.

**Structural fix:**

- One `useNotificationPermission()` that returns `granted | denied | undetermined`, with a standard "Off for Chefer ·
  Open Settings" row and a foreground re-check.
- Schedule timer notifications at start and cancel them on change.
- A single Settings → Notifications screen.
- On Android, exact alarms for the rest timer.

---

## 7. Product Owner view

### 7.1 What's lacking (consolidated)

- **The food day-2 hook.**
  - There are no meal, log or weigh-in reminders.
  - The weekly pair is opt-in and buried, and onboarding offers nothing (UX-PO-08).
  - Food-only testers are the predicted churn segment.
- **Recipe breadth.** 64 curated recipes, thin for restricted diets, and no Romanian food (UX-PO-06). Users can't
  delete their own recipes (UX-REC-04), and Cookbook paging stops at 30 (UX-REC-05).
- **Using a recipe you found.** No "Add to my week", "Add to shopping list" or Share on recipes (UX-REC-08), and no way
  to reuse a past week (UX-PLAN-11).
- **Tracking table stakes.** No barcode and no branded foods (by design, B-29), no goal weight or ETA, no water, and
  generic search ranking (UX-FOOD-12). Snap can't be corrected before logging.
- **Safety coverage.** Only 9 allergens (UX-ACC-06), and paleo and keto aren't really checked (UX-REC-01).
- **Household.** Portions are muddled (UX-PLAN-02, UX-REC-02, UX-PLAN-12), kids have no ages, and there is no
  co-access to a shared list.
- **AI Chef.** No thread persistence, no action chips and no starters (UX-FOOD-21).
- **Following** (dormant in production): no activity feed (UX-SOC-01). Keep it off for cohort 1.
- **Offline food.** Shop and Plan don't load on a cold start without a connection (UX-SHOP-06).
- **Accounts.** No Sign in with Apple or Google, and password managers are disabled on register (UX-ACC-08).

### 7.2 Competitive table stakes (testers will compare)

| Expectation (who sets it)                                      | Chefer today                                        | Beta impact                                     |
| -------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Barcode + branded database (MyFitnessPal, Yazio)               | ✗ (about 1,085 generic foods with Romanian aliases) | High for Track testers. Tell them in the brief. |
| Meal and log reminders (all trackers)                          | ✗                                                   | Medium–high (day-2 hook)                        |
| Recipe catalogue breadth (Mealime, Samsung Food)               | 64 curated, plus import and create                  | High within 1–2 weeks                           |
| Dark mode (Hevy, MyFitnessPal, Yazio)                          | ✗                                                   | Medium (gym users at night)                     |
| Add recipe to plan or list, share (Mealime, Paprika)           | ✗                                                   | Medium                                          |
| Apple Health / Health Connect                                  | ✗ (D-12, out of scope)                              | Medium (runners)                                |
| Live Activity / ongoing-notification rest timer (Hevy, Strong) | ✗ (local notification, late on Android)             | Medium for lifters                              |
| Gym logger quality (Hevy, Strong)                              | ✓ at par or better                                  | Differentiator. Protect it.                     |
| Offline shopping list                                          | ✗ on cold start                                     | Medium                                          |
| Sign in with Apple / Google                                    | ✗                                                   | Medium (sign-up friction)                       |
| Romanian language                                              | ✗                                                   | High outside the English-comfortable segment    |

### 7.3 Beta operations readiness

| Capability                   | State                                                                                     | Needed before beta                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Crash and JS-error reporting | None on mobile (UX-PO-01)                                                                 | Sentry in the tester binary, with #99                                                                                    |
| Analytics                    | Off, and the food funnel isn't instrumented (UX-PO-02)                                    | A SQL dashboard now; PostHog key + 6 events via OTA                                                                      |
| Feedback channel             | Text box in Food › More only; no context, no alerts (UX-PO-05)                            | Attach build/OS/route, a Gym entry point and an email or webhook. Tell iOS testers about TestFlight screenshot feedback. |
| AI capacity                  | About 12 AI weeks a day for everyone; Premium is a free toggle (UX-PO-03)                 | Paid Groq tier or caps; "later today" copy; a usage alert                                                                |
| Android distribution         | No Play account, APK only (UX-PO-04)                                                      | Account + AAB + Data safety + internal track; on a personal account, the 14-day closed test                              |
| Localisation                 | English only (UX-PO-09)                                                                   | Recruit English-comfortable testers; add the language question to the survey; a Romanian store listing                   |
| Domain                       | duckdns hard-coded (UX-PO-07)                                                             | Decide before more binaries spread                                                                                       |
| Feature flags                | `ownTargetsFree` off (UX-ONB-02); `cardioLogging` and `trainingBumpFree` off              | Turn on `ownTargetsFree`. Decide the other two consciously.                                                              |
| Release channel              | OTA to the production channel on every merge                                              | Fine for a closed beta. Add a `preview` channel before public launch.                                                    |
| Native-binary items          | Sentry, `userInterfaceStyle: 'light'`, exact-alarm permission (Android), `webcredentials` | Batch them into the one tester binary                                                                                    |

### 7.4 Recommended order

**Before beta (about 1–1.5 weeks).** Most items are JS/OTA. Native items are batched into one binary.

1. Both S0s: UX-ACC-01 and UX-ACC-02.
2. The food-loop data integrity package (§6.5): UX-FOOD-01/02/03/06, UX-PLAN-01/02/03 and UX-REC-02.
3. UX-ONB-01 (persisted onboarding + BACK) and the shared unsaved-guard hook (§6.2): UX-X-01, UX-GYM-03.
4. UX-REC-01 (diet checks), UX-FOOD-04 (Rate it), UX-FOOD-05 (status pill), and UX-FOOD-07 together with the
   keyboard primitive (§6.1, at least chat and `Sheet`).
5. Gym: UX-GYM-01/02/04/05/06/07, and UX-GYM-08 after a device re-check.
6. Operations: UX-ONB-02 flag, UX-PO-01 Sentry, UX-PO-03 AI plan, UX-PO-04 Play, a UX-PO-02 SQL dashboard, the
   feedback context (UX-PO-05), and `userInterfaceStyle: 'light'` (UX-X-07).
7. The real-device pass in §10.

**During beta (OTA).**

- The rest of S2, in this order:
  - silent failures (§6.3);
  - Settings navigation (UX-ACC-04/05);
  - onboarding keyboard and consent (UX-ONB-03..07);
  - Shop units and quantities (UX-SHOP-01/03/04);
  - recipe actions (UX-REC-04/05/08);
  - cook timers (UX-COOK-01/02);
  - gym S2s.
- Product: the food reminder opt-in (UX-PO-08), Shop/Plan offline persistence (UX-SHOP-06), the curated pool and
  Romanian staples (UX-PO-06), PostHog events, and the Romanian store listing.

**After beta (decide with data).**

- Dark mode.
- Barcode and branded foods (only if Track retention is low).
- Apple Health / Health Connect.
- A Live Activity rest timer and widgets.
- A Following feed and its launch.
- Romanian UI.
- Household co-access.
- Payments (D-9).

---

## 8. Withdrawn, environment-only and unconfirmed items (don't chase these)

| Raw ID(s)                                                            | What was reported                                                               | Disposition                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1-22, L1-36, L2-39 (part), L3-05                                    | Emoji render as "?" boxes (goal cards, PR trophy, cook-mode 🎉)                 | **Environment.** The iOS 26.3 simulator's own emoji keyboard draws "?" too, and the app uses no custom fonts. Emoji will render on devices. The design point (emoji next to Ionicons) is kept as S3 in UX-ONB-10.                                 |
| L2-16 (emoji part)                                                   | A week name saved as mojibake ("Cut week üî•")                                  | **Environment.** The harness pasteboard already held the mangled bytes. The 40-character silent truncation is real (UX-PLAN-10).                                                                                                                  |
| L2-12                                                                | Snackbar "Undo" not tappable on iOS (S1)                                        | **Downgraded to S3, UX-X-16.** L3 re-tested with timed taps: Undo works within its 8 s window on Plan and the tracker (API log + DB). Failures were taps landing as the bar faded at 7–8 s (harness latency). A2 confirmed Undo fires on Android. |
| STATIC-01                                                            | Undo after a swap rewrites the currently selected day                           | **Not reproduced.** L3 swapped Sunday, switched to Saturday and tapped Undo: Sunday was restored and Saturday untouched (DB). The handler closes over the swap-time render. L3 found a different real issue (the slot stays pinned, UX-PLAN-04).  |
| L1-16 (accordion part)                                               | Premium sheet "Also included" never expands                                     | **Unconfirmed.** The code path (`premium-sheet.tsx:142-170`) is a plain `Pressable` toggling local state and looks correct. The simulator harness had tap-delivery issues. Re-test on a device. The copy issue is real (UX-ACC-24).               |
| L1-24                                                                | "Follow back" in the post-accept snackbar did nothing                           | **Unconfirmed, likely the snackbar-timing artefact** (tapped 5–8 s after it appeared; see UX-X-16). The Followers tab button works.                                                                                                               |
| A3-11                                                                | After "Remove exercise", an invisible sheet swallowed all taps until BACK       | **Unconfirmed.** Seen once on the overloaded emulator, and the second attempt worked. Worth a stress test of the `Sheet` close → reopen guard on a slow device.                                                                                   |
| A2-25                                                                | ANR after tapping the servings stepper ~20 times                                | **Unconfirmed / environment** (host load average 60–85). The stepper size and cap issue is kept in UX-COOK-05. Re-check on a mid-range Android.                                                                                                   |
| A2-15 → UX-FOOD-22                                                   | Empty ring and bars after a cold start                                          | **Kept as S2 pending a real-device re-check** (overloaded emulator). Raise to S1 if it reproduces.                                                                                                                                                |
| A3-06 → UX-GYM-08                                                    | Exercises chips overlap search                                                  | **Kept as S1**, because it persisted across a cold relaunch, but re-check on a real Android device.                                                                                                                                               |
| L1-18 / A1 env note                                                  | Legal pages show "Couldn't load" or 404                                         | **Environment.** `getWebUrl()` resolves to the local API (`localhost:3041`), which doesn't serve the web pages. The in-app error state itself is correct. The real inconsistency (browser vs in-app) is UX-ACC-19.                                |
| L4-16 (4), L4 note                                                   | UISwitch toggles (Following settings) don't flip on tap                         | **Environment.** The simulator harness needs a drag to flip a UISwitch.                                                                                                                                                                           |
| L2 env note, L3 note                                                 | "No soft keyboard on iOS"                                                       | **Environment.** The harness's text injection attaches a hardware keyboard. L3 re-ran with the soft keyboard.                                                                                                                                     |
| A1, A2, A3 environment notes                                         | Lag, "System UI isn't responding", an emulator crash, a `system_server` restart | **Environment** (host load average 40–500). Not app performance.                                                                                                                                                                                  |
| L3-12 (sub-point)                                                    | The calories field showed "Enter the calories." while filled                    | **Unconfirmed** (seen once, not on a retry).                                                                                                                                                                                                      |
| STATIC-28 → UX-ACC-03, STATIC-42 → UX-FOOD-06, STATIC-63 → UX-GYM-23 | Need offline or a server error                                                  | **Code-confirmed, not reproduced on device.** Kept at their stated severity. Verify with the §10 offline pass.                                                                                                                                    |
| STATIC-67 on iOS                                                     | Gym setup swipe-back loses answers                                              | **Not reproduced on iOS** (setup is a gesture-disabled modal). Confirmed on Android (UX-GYM-03).                                                                                                                                                  |
| STATIC-02 on iOS                                                     | Regenerate double-submit                                                        | **Not reproduced on iOS** (the local API answered in under 1 s). Confirmed on Android (UX-PLAN-03).                                                                                                                                               |

---

## 9. What works well (protect it)

- **The gym logger is at or above Hevy and Strong.**
  - One-tap sets, supersets (A1/A2), warm-ups, a plate helper, RIR prompts, swap scopes, and a custom keypad that
    sidesteps locale-decimal and keyboard issues.
  - The "Why? / Next time" explanations and believable progression.
  - Kind design: week streaks, skip "won't count as a miss", save for later, the short version.
- **Offline-first workouts are solid.** A full offline workout with swaps, a skip, a removed exercise and a note, then a
  force-stop, an offline edit of the finished session, and a reconnect: the sync was exactly-once and full-fidelity
  (A3). A kill mid-workout resumes at the right set with the timer intact (L1). Hardware BACK in a workout offers
  Minimise / Save for later / Discard.
- **Privacy and consent.**
  - Named AI processors, health-data consent with honest withdraw (which really wipes the data, verified in the DB),
    consent history, JSON and CSV export, and in-app deletion with password + "DELETE".
  - No account enumeration on login.
- **Safety explainers.** "We'll keep out" examples (peanuts → satay, granola bars), "Checked for …" read-backs, and
  allergen banners kept visible in cook mode. Fix the bugs (UX-ACC-01, UX-REC-01), but don't remove the pattern.
- **First-session value.** Onboarding by job, then a curated week generated in the background, then a useful Today
  (ring, next meal with "I ate this", Tonight, week outlook) within a minute.
- **Logging basics.**
  - Catalogue search with gram chips and live macros, and decimal commas accepted almost everywhere.
  - Copy yesterday, edit and delete with Undo.
  - Friendly validation copy ("Name what you ate.").
- **Nutrition provenance.** Computed from catalogue ingredients, with "Computed from 7 ingredients" and sane numbers.
- **Video import review.** "Amount not heard — please check" and "What we guessed: 'a good glug' read as 3 tbsp".
- **Shopping list.**
  - Grouping and tick-off with progress, plus "What's left to buy" vs "Everything" share.
  - Offline ticks queue and sync correctly (A2).
  - Removing a household member rescales Shop immediately.
- **Following** (when it launches): public/private, request → accept, a "See what followers see" preview, per-section
  privacy toggles that really hide data, block/unblock, and clear confirms.
- **Free-tier gates** name the job, show an example, and point to free alternatives. Upgrading is one tap.
- **Register and login keyboard behaviour** (both platforms), and Android BACK closing sheets correctly almost
  everywhere.
- **Release plumbing.** OTA on every merge, fingerprint guards and API-level gating mean fixes reach testers within a
  day.

---

## 10. Recommended pre-beta pass on real devices

Run it on one physical iPhone (iOS 18+ or 26) and one mid-range physical Android (not a Pixel flagship), using the
tester binary that carries Sentry and #99, against production-like AI.

1. **Re-verify the fixed S0/S1s end to end:**
   - type an allergen without "+" and Save;
   - sign out → register a new account → check onboarding and Profile;
   - "Two of us" totals;
   - view next week, then open the tracker;
   - Regenerate mid-week;
   - the iOS swipe-back on the recipe form and routine editor;
   - Android BACK in onboarding and gym setup;
   - a 1025 kg entry;
   - End pause today;
   - 180 lb plates.
2. **Offline (both platforms, including iOS in airplane mode):**
   - tick, log and delete in the tracker;
   - add a Shop item;
   - cold-start Shop and Plan;
   - Household with a failed load (UX-ACC-03);
   - a gym workout + edit + reconnect (STATIC-63 timing).
3. **Notifications:**
   - deny, then allow, the permission in onboarding, gym setup, the rest timer and weekly updates;
   - lock the phone during a 2:00 rest and measure the delivery delay (especially on Android);
   - check that reminders stop after sign-out.
4. **Camera and keep-awake:**
   - Snap to log with the real camera (permission deny → Open Settings);
   - cook mode with the screen left idle for 5+ minutes.
5. **AI for real:**
   - generate a Premium week, chat with tool actions, scan and import against the real provider chain;
   - then exhaust the quota on a test account and read the copy.
6. **Rendering:**
   - emoji (goal cards, PR, cook done);
   - Android dark mode and font scale 1.3 / display size large;
   - iOS accessibility-XL on onboarding, the tracker and Plan chips;
   - UX-GYM-08 (Exercises search) and UX-FOOD-22 (ring after a cold start) on Android.
7. **Legal and links:**
   - Terms/Privacy from Welcome, Register, More and the consent sheets against the real web host;
   - the password-reset and email-confirm links opening the app;
   - the invite share link.
8. **Store paths:** a TestFlight install and update, an OTA update while the app is open, and a Play internal-track
   install from an AAB.
9. **A VoiceOver / TalkBack smoke pass:** register, onboarding, tick a meal, log a set.

---

## Appendix — raw ID → report ID

W = withdrawn, environment or unconfirmed (§8).

| Raw       | Report              | Raw       | Report              | Raw       | Report           | Raw       | Report     |
| --------- | ------------------- | --------- | ------------------- | --------- | ---------------- | --------- | ---------- |
| STATIC-01 | W (not reproduced)  | STATIC-21 | UX-X-12             | STATIC-41 | UX-FOOD-01       | STATIC-61 | UX-FOOD-25 |
| STATIC-02 | UX-PLAN-03          | STATIC-22 | UX-ACC-01           | STATIC-42 | UX-FOOD-06       | STATIC-62 | UX-GYM-02  |
| STATIC-03 | UX-COOK-01          | STATIC-23 | UX-X-06             | STATIC-43 | UX-ONB-01        | STATIC-63 | UX-GYM-23  |
| STATIC-04 | UX-COOK-03          | STATIC-24 | UX-ACC-05           | STATIC-44 | UX-FOOD-09       | STATIC-64 | UX-GYM-01  |
| STATIC-05 | UX-COOK-05          | STATIC-25 | UX-ACC-04           | STATIC-45 | UX-ONB-08        | STATIC-65 | UX-GYM-24  |
| STATIC-06 | UX-REC-03           | STATIC-26 | UX-ONB-05           | STATIC-46 | UX-ONB-09        | STATIC-66 | UX-GYM-04  |
| STATIC-07 | UX-REC-04           | STATIC-27 | UX-X-05             | STATIC-47 | UX-ONB-04        | STATIC-67 | UX-GYM-03  |
| STATIC-08 | UX-REC-05           | STATIC-28 | UX-ACC-03           | STATIC-48 | UX-ACC-10        | STATIC-68 | UX-GYM-22  |
| STATIC-09 | UX-REC-06           | STATIC-29 | UX-PLAN-10, UX-X-04 | STATIC-49 | UX-ACC-07        | STATIC-69 | UX-GYM-09  |
| STATIC-10 | UX-FOOD-04          | STATIC-30 | UX-SHOP-05          | STATIC-50 | UX-ACC-09        | STATIC-70 | UX-ACC-12  |
| STATIC-11 | UX-FOOD-18          | STATIC-31 | UX-PLAN-11          | STATIC-51 | UX-ACC-08        | STATIC-71 | UX-GYM-25  |
| STATIC-12 | UX-REC-12           | STATIC-32 | UX-SHOP-07, UX-X-09 | STATIC-52 | UX-X-09, UX-X-08 | STATIC-72 | UX-GYM-26  |
| STATIC-13 | UX-ACC-02           | STATIC-33 | UX-X-12             | STATIC-53 | UX-FOOD-21       | STATIC-73 | UX-GYM-27  |
| STATIC-14 | UX-ACC-04           | STATIC-34 | UX-PLAN-15          | STATIC-54 | UX-FOOD-17       | STATIC-74 | UX-GYM-21  |
| STATIC-15 | UX-X-14             | STATIC-35 | UX-ACC-20           | STATIC-55 | UX-X-09          | STATIC-75 | UX-GYM-28  |
| STATIC-16 | UX-X-13             | STATIC-36 | UX-ACC-19           | STATIC-56 | UX-ACC-17        | STATIC-76 | UX-GYM-29  |
| STATIC-17 | UX-SHOP-01          | STATIC-37 | UX-ACC-22           | STATIC-57 | UX-ACC-18        | STATIC-77 | UX-X-09    |
| STATIC-18 | UX-SHOP-02, UX-X-09 | STATIC-38 | UX-FOOD-28          | STATIC-58 | UX-ONB-10        | STATIC-78 | UX-GYM-26  |
| STATIC-19 | UX-FOOD-23          | STATIC-39 | UX-ACC-23           | STATIC-59 | UX-FOOD-26       | STATIC-79 | UX-GYM-35  |
| STATIC-20 | UX-PLAN-14          | STATIC-40 | UX-X-15             | STATIC-60 | UX-ACC-19        | STATIC-80 | UX-GYM-34  |

| Raw   | Report    | Raw   | Report                    | Raw   | Report          | Raw   | Report    |
| ----- | --------- | ----- | ------------------------- | ----- | --------------- | ----- | --------- |
| L1-01 | UX-ONB-01 | L1-12 | UX-ACC-21                 | L1-23 | UX-SOC-02       | L1-34 | UX-GYM-11 |
| L1-02 | UX-X-03   | L1-13 | UX-ACC-20                 | L1-24 | W (unconfirmed) | L1-35 | UX-GYM-01 |
| L1-03 | UX-ACC-08 | L1-14 | UX-ACC-01                 | L1-25 | UX-SOC-03       | L1-36 | W (env)   |
| L1-04 | UX-ACC-07 | L1-15 | UX-ACC-05                 | L1-26 | UX-X-07         | L1-37 | UX-X-01   |
| L1-05 | UX-ACC-14 | L1-16 | UX-ACC-24 + W (accordion) | L1-27 | UX-ACC-11       | L1-38 | UX-GYM-31 |
| L1-06 | UX-ACC-15 | L1-17 | UX-ACC-13                 | L1-28 | UX-ACC-19       | L1-39 | UX-GYM-21 |
| L1-07 | UX-ACC-09 | L1-18 | UX-ACC-19                 | L1-29 | UX-GYM-01       | L1-40 | UX-GYM-18 |
| L1-08 | UX-ACC-04 | L1-19 | UX-ACC-27, UX-PO-07       | L1-30 | UX-GYM-30       | L1-41 | UX-GYM-34 |
| L1-09 | UX-ACC-01 | L1-20 | UX-ACC-02                 | L1-31 | UX-GYM-04       |       |           |
| L1-10 | UX-ACC-06 | L1-21 | UX-ACC-16                 | L1-32 | UX-GYM-02       |       |           |
| L1-11 | UX-ONB-05 | L1-22 | W (env) + UX-ONB-10       | L1-33 | UX-GYM-12       |       |           |

| Raw   | Report                | Raw   | Report                 | Raw   | Report                            | Raw   | Report     |
| ----- | --------------------- | ----- | ---------------------- | ----- | --------------------------------- | ----- | ---------- |
| L2-01 | UX-X-02               | L2-15 | UX-PLAN-07             | L2-29 | UX-FOOD-27                        | L2-43 | UX-REC-11  |
| L2-02 | UX-X-03               | L2-16 | W (emoji) + UX-PLAN-10 | L2-30 | UX-PLAN-06                        | L2-44 | UX-REC-04  |
| L2-03 | UX-FOOD-12            | L2-17 | UX-PLAN-10             | L2-31 | UX-REC-10                         | L2-45 | UX-REC-06  |
| L2-04 | UX-X-04, UX-FOOD-08   | L2-18 | UX-SHOP-01, UX-SHOP-02 | L2-32 | UX-FOOD-19                        | L2-46 | UX-REC-14  |
| L2-05 | UX-FOOD-01            | L2-19 | UX-SHOP-03             | L2-33 | UX-REC-08                         | L2-47 | UX-REC-07  |
| L2-06 | UX-FOOD-13            | L2-20 | UX-FOOD-03             | L2-34 | UX-PLAN-11                        | L2-48 | UX-REC-15  |
| L2-07 | UX-FOOD-14, UX-ONB-02 | L2-21 | UX-FOOD-25             | L2-35 | UX-REC-09                         | L2-49 | UX-X-08    |
| L2-08 | UX-FOOD-04            | L2-22 | UX-FOOD-05             | L2-36 | UX-REC-05                         | L2-50 | UX-X-07    |
| L2-09 | UX-PLAN-01            | L2-23 | UX-ACC-13              | L2-37 | UX-REC-13                         | L2-51 | UX-SHOP-04 |
| L2-10 | UX-PLAN-08            | L2-24 | UX-FOOD-26             | L2-38 | UX-REC-01                         | L2-52 | UX-PLAN-06 |
| L2-11 | UX-FOOD-24            | L2-25 | UX-FOOD-10             | L2-39 | UX-COOK-01, UX-COOK-02, W (emoji) | L2-53 | UX-FOOD-02 |
| L2-12 | UX-X-16 (downgraded)  | L2-26 | UX-FOOD-21             | L2-40 | UX-PLAN-09                        |       |            |
| L2-13 | UX-PLAN-05            | L2-27 | UX-SHOP-05, UX-X-04    | L2-41 | UX-X-01                           |       |            |
| L2-14 | UX-PLAN-13            | L2-28 | UX-FOOD-20             | L2-42 | UX-REC-01                         |       |            |

| Raw   | Report     | Raw   | Report     | Raw   | Report    | Raw   | Report                         |
| ----- | ---------- | ----- | ---------- | ----- | --------- | ----- | ------------------------------ |
| L3-01 | UX-FOOD-08 | L3-08 | UX-ACC-25  | L4-01 | UX-GYM-05 | L4-10 | UX-GYM-07                      |
| L3-02 | UX-X-02    | L3-09 | UX-X-05    | L4-02 | UX-GYM-13 | L4-11 | UX-REC-02                      |
| L3-03 | UX-X-16    | L3-10 | UX-X-02    | L4-03 | UX-GYM-14 | L4-12 | UX-PLAN-12                     |
| L3-04 | UX-PLAN-04 | L3-11 | UX-ACC-26  | L4-04 | UX-GYM-15 | L4-13 | UX-PO-08, UX-ACC-04, UX-ACC-27 |
| L3-05 | W (env)    | L3-12 | UX-FOOD-10 | L4-05 | UX-GYM-32 | L4-14 | UX-X-11                        |
| L3-06 | UX-ONB-06  | L3-13 | UX-X-17    | L4-06 | UX-GYM-06 | L4-15 | UX-SOC-01                      |
| L3-07 | UX-ONB-07  | L3-14 | UX-X-08    | L4-07 | UX-GYM-16 | L4-16 | UX-SOC-03                      |
|       |            |       |            | L4-08 | UX-GYM-17 | L4-17 | UX-FOOD-21, UX-ACC-13          |
|       |            |       |            | L4-09 | UX-GYM-33 | L4-18 | UX-X-08                        |

| Raw   | Report             | Raw   | Report               | Raw   | Report                 | Raw   | Report                       |
| ----- | ------------------ | ----- | -------------------- | ----- | ---------------------- | ----- | ---------------------------- |
| A1-01 | UX-ONB-01          | A1-08 | UX-ACC-19            | A2-01 | UX-PLAN-02             | A2-16 | UX-PLAN-07                   |
| A1-02 | UX-ACC-19, UX-X-09 | A1-09 | UX-ACC-04, UX-ACC-05 | A2-02 | UX-FOOD-09             | A2-17 | UX-PLAN-10                   |
| A1-03 | UX-ACC-02          | A1-10 | UX-ONB-07, UX-ACC-25 | A2-03 | UX-FOOD-11             | A2-18 | UX-SHOP-01                   |
| A1-04 | UX-ONB-03          | A1-11 | UX-ONB-05            | A2-04 | UX-FOOD-10             | A2-19 | UX-SHOP-02                   |
| A1-05 | UX-ONB-04          | A1-12 | UX-ONB-10, UX-X-09   | A2-05 | UX-FOOD-01             | A2-20 | UX-PLAN-07, UX-SHOP-03       |
| A1-06 | UX-ACC-07          | A1-13 | UX-ACC-25            | A2-06 | UX-FOOD-14             | A2-21 | UX-FOOD-07                   |
| A1-07 | UX-ACC-17          | A1-14 | UX-ACC-01            | A2-07 | UX-FOOD-16             | A2-22 | UX-FOOD-21                   |
|       |                    |       |                      | A2-08 | UX-FOOD-25, UX-FOOD-11 | A2-23 | UX-SHOP-05                   |
|       |                    |       |                      | A2-09 | UX-FOOD-25             | A2-24 | UX-PLAN-13                   |
|       |                    |       |                      | A2-10 | UX-FOOD-15             | A2-25 | W (unconfirmed) + UX-COOK-05 |
|       |                    |       |                      | A2-11 | UX-FOOD-04             | A2-26 | UX-COOK-02                   |
|       |                    |       |                      | A2-12 | UX-FOOD-08, UX-ONB-04  | A2-27 | UX-COOK-04                   |
|       |                    |       |                      | A2-13 | UX-PLAN-03             | A2-28 | UX-REC-08                    |
|       |                    |       |                      | A2-14 | UX-X-10                | A2-29 | UX-REC-06                    |
|       |                    |       |                      | A2-15 | UX-FOOD-22             |       |                              |

| Raw   | Report    | Raw   | Report          | Raw   | Report     |
| ----- | --------- | ----- | --------------- | ----- | ---------- |
| A3-01 | UX-GYM-03 | A3-07 | UX-GYM-20       | PO-01 | UX-PO-01   |
| A3-02 | UX-GYM-12 | A3-08 | UX-GYM-35       | PO-02 | UX-PO-02   |
| A3-03 | UX-GYM-10 | A3-09 | UX-GYM-33       | PO-03 | UX-ONB-02  |
| A3-04 | UX-GYM-13 | A3-10 | UX-GYM-33       | PO-04 | UX-PO-05   |
| A3-05 | UX-GYM-19 | A3-11 | W (unconfirmed) | PO-05 | UX-PO-06   |
| A3-06 | UX-GYM-08 |       |                 | PO-06 | UX-PO-03   |
|       |           |       |                 | PO-07 | UX-SHOP-06 |
|       |           |       |                 | PO-08 | UX-X-07    |
|       |           |       |                 | PO-09 | UX-PO-07   |
|       |           |       |                 | PO-10 | UX-PO-08   |
|       |           |       |                 | PO-11 | UX-PO-10   |
|       |           |       |                 | PO-12 | UX-PO-04   |
|       |           |       |                 | PO-13 | UX-PO-09   |

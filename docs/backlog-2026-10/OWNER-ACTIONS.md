# Owner actions and decisions

These are things only the owner can do: accounts, money, production config, binaries and product calls. Each has a
recommendation. Tick them off here, because agents read this file.

## Ops before the beta (this week)

| #    | Action                                                                                                                                                                                            | Audit     | Recommendation                                                                                                                                                                                                 | Done |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| OA-1 | Turn on `ownTargetsFree` in production `FEATURE_FLAGS` (env change + API restart)                                                                                                                 | UX-ONB-02 | **Do it now.** A Free Track user hits a dead end in onboarding today. If it must stay Premium, ask for a WP to render `LockedFeatureCard` instead                                                              | ☐    |
| OA-2 | Analytics: (a) the SQL beta dashboard (WP-13 writes the queries); (b) decide on a PostHog key for mobile and update the privacy labels                                                            | UX-PO-02  | (a) now. (b) yes, with consent-gated events via OTA in WP-13                                                                                                                                                   | ☐    |
| OA-3 | AI capacity for the cohort                                                                                                                                                                        | UX-PO-03  | Fund the Groq Developer tier for the beta (≈ $0.012 a plan). Otherwise ask for a WP adding per-user Premium chat caps. Size the Premium cohort to capacity. Copy fix "try again later today" in WP-02 or WP-10 | ☐    |
| OA-4 | Create the Google Play developer account (identity checks take days); then an AAB build, Data safety, content rating, internal track. A personal account needs the 12-tester / 14-day closed test | UX-PO-04  | Start the account today. It gates every Android tester                                                                                                                                                         | ☐    |
| OA-5 | Register a real domain and keep duckdns as an alias before more binaries spread                                                                                                                   | UX-PO-07  | Before the tester binary, because URLs are baked into binaries                                                                                                                                                 | ☐    |
| OA-6 | Romanian store listing (metadata only), plus a language question in the exit survey                                                                                                               | UX-PO-09  | During beta                                                                                                                                                                                                    | ☐    |
| OA-7 | Decide on `cardioLogging` and `trainingBumpFree`. WP-07 makes training-day nutrition free anyway, so `trainingBumpFree` becomes moot                                                              | §7.3      | Keep `cardioLogging` off until WP-17                                                                                                                                                                           | ☐    |
| OA-8 | The real-device pass from audit §10, on the tester binary, after Wave 1                                                                                                                           | §10       | One physical iPhone plus one mid-range Android                                                                                                                                                                 | ☐    |
| OA-9 | Housekeeping: drop stale local DBs (`chefer_w0_*`, `chefer_w1_*`, `chefer_ss_*`, …) and stale worktrees listed in memory, before running parallel WPs                                             | —         | It frees disk and avoids confusion                                                                                                                                                                             | ☐    |

## App Store 1.0.0 (asked 2026-10-02)

**Facts:**

- App Store Connect has **1.0.0 (5)** "Waiting for Review", and TestFlight has **1.0.1 (6)**.
- 1.0.0 runs the old runtime (iOS `3b4fb9f1…`). Since #91 (1.0.1), OTA updates are published only for the new runtime
  (`5d826a15…`).
- So if 1.0.0 is released, App Store users get **frozen JS** that never receives a fix. That includes the S0s: a typed
  allergy dropped, and one account's data leaking to the next.
- 1.0.1 (6) does receive OTAs, so it picks up WP-01 and the following packages as they merge.

**Recommendation:**

1. **Don't release 1.0.0.** Check its release option in App Store Connect.
   - If it is "Automatically release", remove it from review (Developer Reject; there's no penalty).
   - If it is "Manually release", you can leave it in review to get App Review's feedback early, but never press Release.
2. **Don't wait for the whole backlog.** Everything after WP-01 is JS and ships over the air to any build on the
   current runtime.
3. **Submit one new binary after Wave 1 merges** (WP-01..04, about Tue 6 Oct). It should carry the native batch below,
   including #99's unused-permission-string fix.
   - Use it for both the TestFlight beta and the App Store submission, with manual release.
   - Bumping to 1.0.2 is cleanest, because it carries native changes.
4. Meanwhile, keep TestFlight testers on 1.0.1 (6). They get each fix via OTA as soon as you merge it.

## Native batch

These need **one new tester binary**, because they can't ship over the air. The owner builds manually; agents never run
EAS. Bundle them with #99 (unused permission strings).

| Item                                                                                                                                                 | Why                                                                               | Audit     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| `@sentry/react-native` + DSN in `eas.json` and the `mobile-update` env, capture in `RootErrorBoundary` and on 5xx, Diagnostics in the privacy labels | Crash and JS-error reporting                                                      | UX-PO-01  |
| `userInterfaceStyle: 'light'`                                                                                                                        | System UI renders dark over light screens                                         | UX-X-07   |
| `react-native-keyboard-controller` (then migrate `Sheet`, forms and chat onto it in a follow-up OTA)                                                 | The real fix behind audit §6.1. WP-01 and WP-03 ship JS workarounds meanwhile     | §6.1      |
| `react-native-gesture-handler`                                                                                                                       | Smooth drag-to-dismiss sheets (if WP-03's PanResponder version isn't good enough) | UX-X-03   |
| Android exact alarm (`USE_EXACT_ALARM`) or a foreground-service rest timer                                                                           | The rest alert is about 2 minutes late                                            | UX-GYM-10 |
| `webcredentials` associated domain                                                                                                                   | Password manager save and fill                                                    | UX-ACC-08 |
| Universal link for email confirmation                                                                                                                | It opens the web app today                                                        | UX-PO-08  |
| _Rows added by WP sessions_                                                                                                                          |                                                                                   |           |

**Later, as separate native projects:** Health Connect / Apple Health sync (B-38; the tester uses Google Health), dark
mode (B-23), a Live Activity rest timer.

## Product decisions (signed off by the owner, 2026-10-02)

| #   | Question                                                       | Decision                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Start the class-goer work (WP-05) before more interviews?      | **Yes** (default). The tester's answers support Gym 1 + 2. Run the timed check-in test on the WP-05 build                                                                                                                                         |
| D-2 | The tester's "reached the calories needed"                     | **Calories burned** (watch). WP-05 adds an optional weekly burn goal, summed from watch kcal entered on check-ins and workouts. It is shown on the gym week view and never added to food targets                                                  |
| D-3 | Text size                                                      | **Default:** bigger defaults + higher OS-scale caps (WP-04). An in-app setting comes only if readability is still reported                                                                                                                        |
| D-4 | Make rebalance and training-day nutrition free during the beta | **Yes** (default), in WP-07                                                                                                                                                                                                                       |
| D-5 | Protein-only target                                            | **Default:** about 1.6 g/kg, or the effective protein target, shown as a per-meal range                                                                                                                                                           |
| D-6 | Following (SOC-01..03)                                         | **Default:** the flag stays off for cohort 1; fix the SOC items before turning it on                                                                                                                                                              |
| D-7 | Trainer platform                                               | **Top priority among new features**, once Phase A (fixes and consolidation) is done. Discovery and design (WP-18 Phase 0, docs only) may run earlier in its own worktree. Building starts after Phase A. See [WP-18](./WP-18-trainer-platform.md) |

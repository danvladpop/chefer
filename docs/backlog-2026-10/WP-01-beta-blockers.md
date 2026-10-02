# WP-01 · Beta blockers (the audit's "must fix before beta")

|                   |                                                                                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 0 / P0, the highest                                                                                                                                                                                                                                                                     |
| Size              | XL: about 1–1.5 days with 3 lanes                                                                                                                                                                                                                                                       |
| Branch / worktree | `fix/mobile-ux-beta-blockers` / `../chefer-wp01`                                                                                                                                                                                                                                        |
| DB / ports        | `chefer_wp01` / API 3201, web 3301, Metro 8101                                                                                                                                                                                                                                          |
| Depends on        | nothing                                                                                                                                                                                                                                                                                 |
| Can run alongside | **WP-04**. Stay out of WP-04's files: `apps/mobile/tailwind.config.js`, `packages/ui-mobile/src/components/{text,button,value-stepper}.tsx`, `features/gym/workout/{set-row,exercise-card,workout-sheets}.tsx`. If you need one of them, coordinate through the live coordination file. |
| Blocks            | WP-02, WP-03 and every later package                                                                                                                                                                                                                                                    |

This is the owner's original must-fix prompt, refined with code facts found while planning. The prompt at the end
reproduces the owner's rules in full.

## Scope

**Audit §1 must-fix list.** Each item has a full block in audit §2–3.

| ID              | One line                                                              | Where to start                                                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-ACC-01 (S0)  | A typed "Something else?" allergy is dropped on Save                  | `src/features/safety/safety-picker.tsx:95-104,236-258`; hosts `app/preferences.tsx:154`, `src/features/household/household-editor.tsx:145,563-566`, onboarding diet step                                                                                |
| UX-ACC-02 (S0)  | Data leaks between accounts after sign-out                            | `app/(food)/more.tsx:65-75`, `src/features/settings/settings-screen.tsx:149-158`, 401 handler `src/lib/trpc.ts:27-32`, `src/lib/auth-store.ts` (`setToken` :44, `clearToken` :85), wizard hydration `onboarding-wizard.tsx:136-180`                     |
| UX-ONB-01       | Onboarding is lost on Android BACK or process kill                    | `src/features/auth/pending-onboarding.ts` (in-memory), `app/(food)/_layout.tsx:46-49`, the wizard (no BackHandler)                                                                                                                                      |
| UX-GYM-03       | Gym setup is lost on Android BACK                                     | `src/features/gym/setup/setup-wizard.tsx:215-226`                                                                                                                                                                                                       |
| UX-PLAN-02      | "Two of us" doubles the user's own calories                           | `apps/api/src/application/meal-plan/curated-planner.ts:247-253,319`; totals in `nutrition-summary.tsx:75`, `rebalance.ts:256`; `hero-meal-card.tsx:37`                                                                                                  |
| UX-REC-02       | Household servings multiply the owner's portion                       | `packages/utils/src/cook-mode.ts:30-36` (`defaultCookServings`). Used by mobile `cook/[id].tsx:175`, `recipe/[id].tsx:143` and web `recipes/[id]/page.tsx:241`, `cook-mode.tsx:160`                                                                     |
| UX-FOOD-02      | Tracker reads next week's plan                                        | Replace `findActiveWithDays` at **every** call site: `tracker.service.ts:152,173,590`, `coach.service.ts:370`, `pantry.service.ts:220`, `shopping-list.service.ts:887`. Use `findForWeek` (`meal-plan.repository.ts:421/436`) or a shared `planForDate` |
| UX-FOOD-01 + 06 | Tracker ticks are stale after Undo; failed writes look like successes | `apps/mobile/app/tracker.tsx:124-150,154-170,185-216,229-286,307-323`; `src/features/tracker/edit-entry-sheet.tsx:102-166`                                                                                                                              |
| UX-PLAN-01      | Regenerate rewrites past and eaten meals                              | `meal-plan.service.ts` generate path; Today "dinner done" in `packages/utils/src/today.ts` (`isSlotEaten` :105)                                                                                                                                         |
| UX-REC-01       | Diet checks trust tags only                                           | `apps/api/src/lib/curated-recipes/safety.ts:334` (`RESTRICTION_RULES`; keto/paleo `forbidden: []`), `isRecipeSafe` :441; vegan auto-tagging :576                                                                                                        |
| UX-GYM-01       | A 1025 kg typo parks the workout                                      | `src/features/gym/workout/number-sheet.tsx:57-68`, `offline/outbox.ts:193-199`, `setup/setup-wizard.tsx:232-262`                                                                                                                                        |
| UX-GYM-02       | Start silently resumes a different workout                            | `src/features/gym/today/today-screen.tsx:149-167`, `use-active-workout.ts:69-72`; the guard to copy is in food's `todays-workout-card.tsx:48`                                                                                                           |
| UX-GYM-05       | Gym setup ignores Imperial                                            | `setup-wizard.tsx:129-141`, `apps/api/src/application/gym/gym-profile.service.ts:234` (`syncPreferredUnits`)                                                                                                                                            |
| UX-GYM-06       | End pause does nothing on the day it started                          | `apps/api/src/application/gym/training-pause.service.ts:38-47`                                                                                                                                                                                          |
| UX-GYM-07       | Plate calculator in lb gives wrong plates                             | `packages/utils/src/gym/loads.ts:433-460`                                                                                                                                                                                                               |
| UX-X-01         | iOS swipe-back bypasses the unsaved guard                             | `app/recipe-form.tsx:257-268`, `app/gym/routine-editor.tsx:98-112`                                                                                                                                                                                      |
| UX-FOOD-07      | AI Chef composer is under the keyboard on Android                     | `app/chat.tsx:125-126`                                                                                                                                                                                                                                  |
| UX-X-02         | Shared `Sheet` double-compensates the keyboard (§6.1)                 | `packages/ui-mobile` Sheet + `KeyboardAwareScrollView`                                                                                                                                                                                                  |

**S1 and S2 items on the same code paths (fix in this WP):**

- **UX-ACC-03:** Household seeded from a failed load wipes allergies.
- **UX-ACC-12:** sign-out leaves gym reminders and local gym data.
- **UX-ACC-17:** the register draft keeps the password.
- **UX-ONB-08:** wizard hydration from stale jobs and raw floats.
- **UX-FOOD-03:** off-plan logged rows can't be edited or deleted.
- **UX-FOOD-17:** custom entries are deleted by index. Add an optional `entryId`, additively.
- **UX-PLAN-03:** Regenerate confirm has no busy state and swallows the quota error.
- **UX-PLAN-06:** diet-conflict copy, together with REC-01.
- **UX-PLAN-09:** rebalance acts on the wrong week. This is fixed by FOOD-02; the opt-in UX is in WP-07.
- **UX-X-06:** raw Zod, gym setup and keypad part.

**Out of scope:**

- the owner items ONB-02 and PO-01 to 04, which belong in [OWNER-ACTIONS](./OWNER-ACTIONS.md);
- other §6.1/§6.2 screens, which belong to WP-03;
- silent failures outside the tracker, which belong to WP-02.

## Facts found while planning (these override the audit's recommendations)

1. **`react-native-keyboard-controller` is not installed**, and adding it is native. For UX-FOOD-07 and UX-X-02, use a
   small shared hook in `@chefer/ui-mobile`, e.g. `useKeyboardInset()`:
   - it is built on RN core `Keyboard.addListener('keyboardDidShow'/'keyboardDidHide')` (Android) and
     `keyboardWillShow/Hide` (iOS), plus `useSafeAreaInsets`;
   - it drives the bottom padding of the chat composer and the Sheet;
   - the Sheet uses **one** mechanism on iOS: drop `automaticallyAdjustKeyboardInsets` **or** the KAV padding, not both.
   - Record "adopt keyboard-controller" in the native batch.
2. **`usePreventRemove`** (React Navigation 7, already present through expo-router) disables the native iOS swipe while
   dirty. Build the shared `useUnsavedGuard(isDirty, { onBack })` hook here, because X-01, ONB-01 and GYM-03 need it.
   WP-03 then reuses it on the remaining screens.
3. **Sign-out:** there is no zustand or MMKV. All persisted state goes through the expo-sqlite KV
   (`src/features/gym/offline/kv.ts`; keys in `gym/offline/keys.ts`). The keys to clear on sign-out are:
   - `app.mode`;
   - `gym.*`, including `gym.query-cache` (the gym TanStack persister), the outbox and the active session. **Warn before
     sign-out if the outbox has unsynced workouts.**
   - `landing.jobs`, `landing.has-gym-profile`;
   - `chefer.pantry-check-week`, `premium.nudge-cap`, `privacy.health-consent-declined`, `shop.share-list.prefs.v1`,
     `chefer.rebalance.pending`;
   - the per-exercise notes and the meal-plan dismissals.

   Keep `analytics.consent` and the SecureStore `chefer_has_signed_in_before`, because they belong to the device.

   One `signOut()` must do all of this in order: cancel queries, `queryClient.clear()`, clear the KV keys, cancel gym
   reminders, reset the register draft, then `clearToken()`. Use it from More, Settings, account deletion and the 401
   handler. `setToken` also clears the cache.

4. **Portions:** use one helper in `@chefer/utils`, e.g. `portionsFor({ eaterPortion, members, cookingFor })` →
   `{ eaterPortion, cookServings, shopMultiplier }`.
   - The planner stores `portion` as the eater's calorie-driven portion only. "Cooking for 2" becomes a table multiplier
     (as `estimatedCost.portions` already does for 3+).
   - Plans already stored with `portion: 2` from `cookingForPortion` keep working: decide whether to normalise them on
     read, and state this in the PR.
5. **Diet rules (REC-01):**
   - paleo forbids grains, legumes, dairy and refined sugar;
   - keto gets a net-carb threshold from catalogue nutrition, with a recipe-level fallback;
   - untagged **user and imported** recipes derive diet tags from ingredients instead of failing;
   - a tag-only pass says "Tagged paleo (not verified)", never "Checked".

## Suggested lanes (Sonnet, max 3 at a time)

| Lane                     | Items                                                      | Owns                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, account/onboarding    | ACC-01, 02, 03, 12, 17, ONB-01, 08                         | `apps/mobile/src/features/{safety,household,onboarding,auth,settings}`, `app/(food)/{more,_layout}.tsx`, `app/preferences.tsx`, `src/lib/{auth-store,trpc}.ts`, the new `src/lib/sign-out.ts`; web equivalents of safety-picker and household       |
| B, food/plan/tracker     | FOOD-01, 02, 03, 06, 17, PLAN-01, 02, 03, 09               | `apps/api/src/application/{tracker,meal-plan,coach,pantry,shopping-list}`, `packages/database/src/repositories/meal-plan.repository.ts`, `apps/mobile/app/{tracker,(food)/meal-plan}.tsx`, `src/features/{tracker,dashboard}`, web tracker and plan |
| C, recipes/portions/diet | REC-01, 02, PLAN-06                                        | `apps/api/src/lib/curated-recipes/safety.ts`, `packages/utils/src/{cook-mode,portions}.ts`, recipe and cook screens (mobile and web)                                                                                                                |
| D, gym                   | GYM-01, 02, 03, 05, 06, 07, X-06 (gym part)                | `apps/mobile/src/features/gym/{setup,today,workout/number-sheet.tsx,offline/outbox.ts}`, `apps/api/src/application/gym/{gym-profile,training-pause}.service.ts`, `packages/utils/src/gym/loads.ts`, web gym setup and pause                         |
| E, keyboard/sheet/guards | X-01, X-02, FOOD-07, `useUnsavedGuard`, `useKeyboardInset` | `packages/ui-mobile/src/components/sheet*`, new hooks in `packages/ui-mobile`, `app/{chat,recipe-form}.tsx`, `app/gym/routine-editor.tsx`                                                                                                           |

**Order:**

1. Start A, B and E.
2. When one finishes, start C. Lane C conflicts with B on the planner, so it starts after B or must rebase on it.
3. When the next one finishes, start D. Lane D uses E's guard hook.

Lane B owns `planForDate`. Lane C owns the portions helper, and B consumes it in totals.

## Acceptance (each one is a test plus device evidence)

- **ACC-01:** type "sesame", tap Save → it is stored, in Preferences, Household and onboarding.
- **ACC-02:** A signs out and B registers → B's wizard is empty, nothing of A is visible anywhere, and no A data is
  written. Covered by Jest plus Maestro.
- **ONB-01 / GYM-03:**
  - Android BACK steps back through both wizards.
  - Killing the app mid-wizard resumes it. Persist the pending flag and answers per step in KV, plus a server-derived
    "onboarding incomplete" (`jobs.length === 0` or an additive `onboardedAt`).
- **PLAN-02 / REC-02:**
  - "Two of us" keeps the user's own kcal, and Shop doubles.
  - Owner portion 2× plus Mia ½ plus Noah 1 gives 3½ servings everywhere.
- **FOOD-02:** with two ACTIVE plans in adjacent weeks, the tracker, rebalance, coach, pantry and shop use the
  current week. Covered by a contract test.
- **FOOD-01/06:** Undo and a failed write reconcile with the server.
- **PLAN-01:** a mid-week regenerate keeps past days and logged slots, and the confirm copy says so.
- **REC-01:**
  - Quinoa salad is not "Checked for Paleo".
  - User oats aren't "non-vegetarian".
- **GYM-01:**
  - The keypad clamps to the schema bounds and confirms a jump of more than 2×.
  - Setup validates inline, and no Zod text is shown anywhere.
- **GYM-02:** a ConfirmSheet offers Resume / Finish & start / Discard & start.
- **GYM-05:** Imperial carries into setup, and there is no gym→food unit sync once food units are explicit.
- **GYM-06:** pause today, then end today, gives a working Start.
- **GYM-07:** 135, 180, 225 and 275 lb give the correct plates, and any remainder is shown.
- **X-01:** an iOS swipe on a dirty recipe form or routine editor is blocked and confirms.
- **FOOD-07 / X-02:** on Android the chat input stays visible over the keyboard, and on iOS sheets don't scroll their
  content away.

## Kickoff prompt (paste into a fresh Opus 5.5 session in `/Users/danpop/work/git-projects/chefer`)

```
You are the orchestrator for WP-01 "Beta blockers". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-01-beta-blockers.md
3. CLAUDE.md
Then execute WP-01 end to end.

Owner rules (verbatim intent from the original must-fix brief):
- Fix the audit's "must fix before beta" app defects listed in WP-01 §Scope, plus every other S1 on the same code
  path. Prefer the structural fixes from audit §6 over one-off patches.
- Out of scope: UX-ONB-02 and UX-PO-01..04 (owner decisions). List them in your final summary as owner actions with
  your recommendation.
- Fresh worktree off origin/master. Never touch the main checkout (it has uncommitted work).
- The audit is already on master at docs/mobile-ux-audit-2026-10/. First commit: add a "Fix status" table at its
  top (per finding: fixed / partially fixed / deferred / open, with WP, PR and reason).
- Follow CLAUDE.md: layered API, shared logic in @chefer/types / @chefer/utils, platform parity (same fix on web or a
  mobile_parity_backlog.md row), docs in the same PR.
- API changes must be additive and backward compatible (1.0.1 binaries are in the field).
- OTA-safe only: no new native modules, no native config. If a fix truly needs native, stop and ask the owner.
  Note: react-native-keyboard-controller and react-native-gesture-handler are NOT installed. Use the RN-core approach
  in WP-01 "Facts found while planning".
- A regression test for every fix (unit/Jest), plus a contract test wherever the API changes.
- Before the PR: lint, typecheck, unit tests, pnpm format:check, and the no-DB API tests
  (DATABASE_URL=postgresql://nobody:x@127.0.0.1:1/none npx vitest run in apps/api).
- Verify user-facing fixes on the iOS simulator AND on ONE Android emulator. Never run more than one emulator.
- Cloned DB plus local API with AI_MOCK_ENABLED=true. Never make real AI calls.
- Parallel Sonnet lane agents in their own worktrees, at most 3 at a time, integrated on one branch.
- Open ONE PR to master. Don't merge it. No EAS builds and no store submissions.
Final summary: what was fixed and how each fix was verified; what was deferred and why; owner actions (with your
recommendation for ONB-02 and PO-01..04); cleanup still pending.
```

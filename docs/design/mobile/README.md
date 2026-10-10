# Chefer mobile — design boards

A snapshot of the **Chefer App Design** canvas (https://claude.ai/artifact/SBQUh2dcY14U3p4gcnJ4xj), taken 2026-10-10 from master `e5a8ca22`.
Each `*.dc.html` file is one screen or sheet of `apps/mobile`, drawn as it renders in the **revamp shell** (`mobileShellV2` on, light theme), with real copy, colours and sizes.
The canvas is the working copy; this folder is a versioned record of it. Re-export after significant design changes.

- `canvas.json` — canvas index: pages, board positions/sizes, titles.
- `Main.dc.html` — design foundations: the revamp colour roles, text styles, radius, `@chefer/ui-mobile` primitives and shell chrome, plus the legacy tokens screens still use.
- The boards load `./support.js` from the canvas runtime, so they render properly only on the canvas. The markup itself is plain HTML with inline styles and reads fine as a spec.

## Conventions used in the boards

- iPhone width 390pt. Spacing uses NativeWind's 14px rem (`p-4` = 14px, `h-11` pinned to 44px); revamp radius classes are px (`rounded-inner` 8, `control` 12, `card` 16, `sheet` 24).
- Light theme only. System font, Ionicons outline/filled glyphs via `src/components/icon.tsx` (drawn as inline SVG).
- Photos are labelled placeholders.
- Each board shows one representative state (premium user unless the board is about a gated state; onboarding follows the free food + train path). Transient banners, sync errors and most confirm sheets are omitted.
- Phase 1 of the revamp: only You is fully rebuilt; Today, Plan, Shop and Train are existing screens inside `ShellTopBar`; recipe, cook, tracker and settings screens still use the older headers. The boards show that mixed state as it is.

## Board → route

| Page              | Board                                                                                                                       | Route                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth              | Welcome, Login, Register, ForgotPassword (+ ForgotSent), ResetPassword                                                      | `/(auth)/welcome`, `/login`, `/register`, `/forgot-password`, `/reset-password`                                                            |
| Onboarding        | OnbStart → OnbTrainingDays → OnbDiet → OnbHowYouCook → OnbGoal → OnbMetrics → OnbTargets → OnbNudge                         | `/onboarding` (food + train path)                                                                                                          |
| Today             | Home (+ AddSheet, QuickAddSheet), Tracker, Chat, ChatLocked, AiConsentSheet                                                 | `/(main)/home`, `/tracker`, `/chat`, global AI-consent sheet                                                                               |
| Plan & Shop       | Plan (+ WeekOptionsSheet, WeekSummarySheet, RecipePickerSheet, PlanSettingsSheet), Shop (+ ShareListSheet)                  | `/(main)/plan`, `/(main)/shop`                                                                                                             |
| Recipes & cooking | Cookbook, RecipeDetail, CookStep / CookIngredients / CookFinished, RecipeForm, ImportRecipe, ImportPreview                  | `/cookbook`, `/recipe/[id]`, `/cook/[id]`, `/recipe-form`, `/import-recipe`                                                                |
| Train             | Train, TrainingRoutine, TrainingExercises, TrainingStats                                                                    | `/(main)/train`, `/training/routine`, `/training/exercises`, `/training/stats`                                                             |
| Train             | Workout (+ NumberSheet, WorkoutMenuSheet), Summary, Session                                                                 | `/gym/workout`, `/gym/summary/[id]`, `/gym/session/[id]`                                                                                   |
| Train             | GymSetup, ExerciseDetail, ExerciseForm, Routines, RoutineEditor, GymSettings                                                | `/gym/setup`, `/gym/exercise/[id]`, `/gym/exercise-form`, `/gym/routines`, `/gym/routine-editor`, `/gym/settings`                          |
| You & settings    | You (+ SignOutSheet), Progress, MyWeeks, HistoryWeek, Household, Profile                                                    | `/(main)/you`, `/progress`, `/my-weeks`, `/history/[planId]`, `/household`, `/profile`                                                     |
| You & settings    | Settings, SettingsJobs, SettingsNotifications, Preferences, Legal                                                           | `/settings`, `/settings/jobs`, `/settings/notifications`, `/preferences?section=safety`, `/legal/terms`                                    |
| Following         | FriendsIntro, Friends, FriendProfile, FriendsRequests, FriendsActivity, FriendsSuggestions, FriendsSettings, FriendsBlocked | `/friends`, `/friends/[userId]`, `/friends/requests`, `/friends/activity`, `/friends/suggestions`, `/friends/settings`, `/friends/blocked` |

Old tab URLs forward in the revamp shell: `/` → Today, `/meal-plan` → Plan, `/shopping-list` and `/pantry` → Shop, `/recipes` → Cookbook, `/more` and `/gym-more` → You, `/today` → Train, `/routine` `/exercises` `/stats` → `/training/*`.

## Workflow

1. Change the design on the canvas (edit in place or comment).
2. Ask an agent to implement the changed boards in `apps/mobile`. Colour changes go to `packages/tokens/src/color.ts` and `apps/mobile/global.css` (kept identical by `tests/unit/color-sync.test.ts`).
3. Follow the platform-parity rule in `CLAUDE.md`: the web app or `mobile_parity_backlog.md` must follow.
4. Re-export the changed boards into this folder and run `pnpm exec prettier --write "docs/design/mobile/*.{json,md}"`.

## Observations from redrawing master

- `Button` size `lg` is `min-h-12` = 42px, shorter than the default 44px.
- `docs/mobile-ux-revamp/plan.md` describes a Week · Recipes segment in Plan; the build ships a Recipes header button instead.
- Most non-rebuilt screens still use legacy tokens (`primary`, `accent`, `border` #E2E8F0, Tailwind grays) next to the revamp roles.
- How-you-cook's "Weekends can take longer" switch has no `trackColor` (iOS green) while the auto-plan switch is brand-coloured.
- Some small text is below the 14px floor: routine editor step captions (`text-[13px]`) and chart axis labels (10px).

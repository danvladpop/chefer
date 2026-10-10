# Chefer mobile — design boards

A snapshot of the **Chefer App Design** canvas (https://claude.ai/artifact/SBQUh2dcY14U3p4gcnJ4xj), first taken 2026-10-10 from master `e5a8ca22`; re-exported 2026-10-10 with the **10 Oct redesign** (owner feedback in `docs/design/feedback/2026-10-10/`). The redesigned boards replaced the originals in place; the originals live on as `<Board>Before.dc.html` on the canvas page "Before — 10 Oct".
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
- After the 10 Oct redesign the tab roots, Your day, Stats, Meal settings, Cookbook, Routine, workout header/summary, Training settings, program setup, New exercise, Account and Goals & diet are rebuilt; recipe, cook and the remaining settings screens still use the older headers.
- Foundations (`Main.dc.html`) has a "Shared components" section: CalorieGauge, MacroRow, MediaTile/MediaRow, EntryCard, StatTile, DayStrip, TabTopBar.

## Board → route

| Page              | Board                                                                                                                                              | Route                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth              | Welcome, Login, Register, ForgotPassword (+ ForgotSent), ResetPassword                                                                             | `/(auth)/welcome`, `/login`, `/register`, `/forgot-password`, `/reset-password`                                                            |
| Onboarding        | OnbStart → OnbTrainingDays → OnbDiet → OnbHowYouCook → OnbGoal → OnbMetrics → OnbTargets → OnbNudge                                                | `/onboarding` (food + train path)                                                                                                          |
| Today             | Home, HomeDone (evening state) (+ AddSheet, QuickAddSheet), Tracker ("Your day"), Progress ("Stats"), Chat, ChatLocked, AiConsentSheet             | `/(main)/home`, `/tracker`, `/chat`, global AI-consent sheet                                                                               |
| Meals & Shop      | Plan ("Meals") (+ WeekOptionsSheet "Change week", WeekSummarySheet, RecipePickerSheet), Shop (+ ShareListSheet)                                    | `/(main)/plan`, `/(main)/shop`                                                                                                             |
| Recipes & cooking | Cookbook, RecipeDetail, CookStep / CookIngredients / CookFinished, RecipeForm, ImportRecipe, ImportPreview                                         | `/cookbook`, `/recipe/[id]`, `/cook/[id]`, `/recipe-form`, `/import-recipe`                                                                |
| Train             | Train, TrainingRoutine, TrainingExercises, TrainingStats                                                                                           | `/(main)/train`, `/training/routine`, `/training/exercises`, `/training/stats`                                                             |
| Train             | LogWorkoutSheet, Workout (+ NumberSheet, WorkoutMenuSheet), Summary, Session                                                                       | `/gym/workout`, `/gym/summary/[id]`, `/gym/session/[id]`                                                                                   |
| Train             | GymSetup, ExerciseDetail, ExerciseForm, Routines, RoutineEditor, GymSettings                                                                       | `/gym/setup`, `/gym/exercise/[id]`, `/gym/exercise-form`, `/gym/routines`, `/gym/routine-editor`, `/gym/settings`                          |
| You & settings    | You (+ SignOutSheet), PlanSettingsSheet ("Meal settings", `/settings/meals`), MyWeeks, HistoryWeek, Household, Profile                             | `/(main)/you`, `/progress`, `/my-weeks`, `/history/[planId]`, `/household`, `/profile`                                                     |
| You & settings    | Settings ("Account"), GymSettings ("Training settings", `/gym/settings`), SettingsJobs, SettingsNotifications, Preferences ("Goals & diet"), Legal | `/settings`, `/settings/jobs`, `/settings/notifications`, `/preferences?section=safety`, `/legal/terms`                                    |
| Following         | FriendsIntro, Friends, FriendProfile, FriendsRequests, FriendsActivity, FriendsSuggestions, FriendsSettings, FriendsBlocked                        | `/friends`, `/friends/[userId]`, `/friends/requests`, `/friends/activity`, `/friends/suggestions`, `/friends/settings`, `/friends/blocked` |

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

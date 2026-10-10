# Chefer mobile — design boards

A snapshot of the **Chefer App Design** canvas (https://claude.ai/artifact/SBQUh2dcY14U3p4gcnJ4xj), taken 2026-10-10.
Each `*.dc.html` file is one screen or sheet of `apps/mobile` (v1.0.x), redrawn as it is built today, with real copy, colors and sizes.
The canvas is the working copy; this folder is a versioned record of it. Re-export after significant design changes.

- `canvas.json` — canvas index: pages, board positions/sizes, titles.
- `Main.dc.html` — design foundations: tokens and `@chefer/ui-mobile` components.
- The boards load `./support.js` from the canvas runtime, so they render properly only on the canvas. The markup itself is plain HTML with inline styles and reads fine as a spec.

## Conventions used in the boards

- iPhone width 390pt. Spacing uses NativeWind's 14px rem (`p-4` = 14px, `h-11` pinned to 44px).
- Light theme only, system font, Ionicons outline icons (drawn as inline SVG).
- Photos are labelled placeholders.
- Each board shows one representative state, usually a premium user. Transient banners and sync errors are omitted.

## Board → route

| Board                                                                                     | Route                                                                                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Login, Register, ForgotPassword (+ ForgotSent), ResetPassword                             | `/(auth)/login`, `/register`, `/forgot-password`, `/reset-password`                                               |
| OnbIntent → OnbGoal → OnbMetrics → OnbDiet → OnbCuisine                                   | `/onboarding` (premium step order)                                                                                |
| FoodToday, MealPlan (+ RecipePickerSheet, WeekSummarySheet), ShoppingList, Cookbook, More | `/(food)` tabs: index, `meal-plan`, `shopping-list`, `recipes`, `more`                                            |
| Tracker (+ QuickAddSheet), Progress, Pantry, MyWeeks, HistoryWeek                         | `/tracker`, `/progress`, `/pantry`, `/my-weeks`, `/history/[planId]`                                              |
| RecipeDetail, CookStep / CookIngredients / CookFinished, RecipeForm                       | `/recipe/[id]`, `/cook/[id]`, `/recipe-form`                                                                      |
| ImportRecipe, ImportPreview, Chat, ChatLocked, AiConsentSheet                             | `/import-recipe`, `/chat`, global AI-consent sheet                                                                |
| GymToday, GymRoutine, GymExercises, GymStats                                              | `/(gym)` tabs: `today`, `routine`, `exercises`, `stats`                                                           |
| Workout (+ NumberSheet, WorkoutMenuSheet), Summary, Session                               | `/gym/workout`, `/gym/summary/[id]`, `/gym/session/[id]`                                                          |
| GymSetup, ExerciseDetail, ExerciseForm, Routines, RoutineEditor, GymSettings              | `/gym/setup`, `/gym/exercise/[id]`, `/gym/exercise-form`, `/gym/routines`, `/gym/routine-editor`, `/gym/settings` |
| Profile (+ PostUpgradeSheet, DeleteAccountSheet), Preferences, Household                  | `/profile`, `/preferences`, `/household`                                                                          |

## Workflow

1. Change the design on the canvas (edit in place or comment).
2. Ask an agent to implement the changed boards in `apps/mobile`. Token changes go to `apps/mobile/global.css`, `packages/ui-mobile/src/components/theme.ts` and `@chefer/tokens`.
3. Follow the platform-parity rule in `CLAUDE.md`: the web app or `mobile_parity_backlog.md` must follow.
4. Re-export the changed boards into this folder.

## Known issues spotted while redrawing

- `Button` size `lg` is `h-12` = 42px, shorter than the default 44px.
- The "back" muscle-group chip renders lowercase (missing key in `MUSCLE_LABELS`).
- The Cookbook "Mine" empty state still says recipe creation "arrives on mobile soon".
- Onboarding chips (allergies, diet, cuisine) are 31.5px tall, under the 44px touch target.
- Gym settings is reachable only from the sync pill on Gym Today.

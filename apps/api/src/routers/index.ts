import { mergeRouters, router } from '../lib/trpc.js';
import { authRouter } from './auth.router.js';
import { coachRouter } from './coach.router.js';
import { dashboardRouter } from './dashboard.router.js';
import { feedbackRouter } from './feedback.router.js';
import { friendsRouter } from './friends/index.js';
import { gymRouter } from './gym/index.js';
import { householdRouter } from './household.router.js';
import { importRouter } from './import.router.js';
import { ingredientsRouter } from './ingredients.router.js';
import { mealPlanRouter } from './meal-plan.router.js';
import { notificationsRouter } from './notifications.router.js';
import { pantryRouter } from './pantry.router.js';
import { preferencesRouter } from './preferences.router.js';
import { privacyRouter } from './privacy.router.js';
import { profileRouter } from './profile.router.js';
import { recipeRouter } from './recipe.router.js';
import { safetyRouter } from './safety.router.js';
import { shoppingListRouter } from './shopping-list.router.js';
import { targetsRouter } from './targets.router.js';
import { trackerRouter } from './tracker.router.js';
import { trainingRouter } from './training.router.js';
import { userRouter } from './user.router.js';

export const appRouter = router({
  auth: authRouter,
  coach: coachRouter,
  dashboard: dashboardRouter,
  feedback: feedbackRouter,
  // Following (docs/friends/implementation-plan.md §4.1) — dark behind the
  // `friends` flag + FRIENDS_ALLOWLIST; only `friends.availability` answers
  // while it's off.
  friends: friendsRouter,
  gym: gymRouter,
  household: householdRouter,
  ingredients: ingredientsRouter,
  mealPlan: mealPlanRouter,
  notifications: notificationsRouter,
  pantry: pantryRouter,
  preferences: preferencesRouter,
  // Wave-0 stubs (T-00.10) — router + service wired now so no lane edits
  // this file later; real procedures land wave 1.
  privacy: privacyRouter,
  profile: profileRouter,
  // Import procedures (F5) merge into the recipe namespace:
  // recipe.importPreview / recipe.importSave live in import.router.ts.
  recipe: mergeRouters(recipeRouter, importRouter),
  safety: safetyRouter,
  shoppingList: shoppingListRouter,
  targets: targetsRouter,
  tracker: trackerRouter,
  training: trainingRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;

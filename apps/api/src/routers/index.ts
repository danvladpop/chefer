import { mergeRouters, router } from '../lib/trpc.js';
import { authRouter } from './auth.router.js';
import { coachRouter } from './coach.router.js';
import { dashboardRouter } from './dashboard.router.js';
import { householdRouter } from './household.router.js';
import { importRouter } from './import.router.js';
import { ingredientsRouter } from './ingredients.router.js';
import { mealPlanRouter } from './meal-plan.router.js';
import { preferencesRouter } from './preferences.router.js';
import { profileRouter } from './profile.router.js';
import { recipeRouter } from './recipe.router.js';
import { shoppingListRouter } from './shopping-list.router.js';
import { trackerRouter } from './tracker.router.js';
import { userRouter } from './user.router.js';

export const appRouter = router({
  auth: authRouter,
  coach: coachRouter,
  dashboard: dashboardRouter,
  household: householdRouter,
  ingredients: ingredientsRouter,
  mealPlan: mealPlanRouter,
  preferences: preferencesRouter,
  profile: profileRouter,
  // Import procedures (F5) merge into the recipe namespace:
  // recipe.importPreview / recipe.importSave live in import.router.ts.
  recipe: mergeRouters(recipeRouter, importRouter),
  shoppingList: shoppingListRouter,
  tracker: trackerRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;

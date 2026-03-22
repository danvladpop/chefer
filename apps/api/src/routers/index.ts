import { router } from '../lib/trpc.js';
import { authRouter } from './auth.router.js';
import { dashboardRouter } from './dashboard.router.js';
import { mealPlanRouter } from './meal-plan.router.js';
import { preferencesRouter } from './preferences.router.js';
import { recipeRouter } from './recipe.router.js';
import { shoppingListRouter } from './shopping-list.router.js';
import { userRouter } from './user.router.js';

export const appRouter = router({
  auth: authRouter,
  dashboard: dashboardRouter,
  mealPlan: mealPlanRouter,
  preferences: preferencesRouter,
  recipe: recipeRouter,
  shoppingList: shoppingListRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;

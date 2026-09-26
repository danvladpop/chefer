import { TRPCError } from '@trpc/server';
import { prisma } from '@chefer/database';
import { deleteUploadedFiles } from '../../lib/uploads/uploaded-files.js';

// ─── Account data: export and self-deletion (audit P0-6) ─────────────────────
// Users had no way to get their data or delete their account; the privacy
// policy pointed at a feedback box no admin could read (F-PROF-1-1), and the
// app stores require in-app deletion (F-M-PROF-1-1).

/** Everything Chefer stores about one user, as plain JSON. */
export async function exportAccountData(userId: string): Promise<Record<string, unknown>> {
  const where = { userId };
  const [
    user,
    chefProfile,
    dietaryPreferences,
    householdMembers,
    mealPlans,
    dailyLogs,
    weightEntries,
    favourites,
    ratings,
    pantryItems,
    recipes,
    chefReviews,
    feedback,
    gymProfile,
    routines,
    workoutSessions,
    exerciseProgressions,
    trainingPauses,
    customExercises,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        planTier: true,
        createdAt: true,
      },
    }),
    prisma.chefProfile.findUnique({ where }),
    prisma.dietaryPreferences.findUnique({ where }),
    prisma.householdMember.findMany({ where }),
    prisma.mealPlan.findMany({ where, include: { days: true } }),
    prisma.dailyLog.findMany({ where }),
    prisma.weightEntry.findMany({ where }),
    prisma.favouriteRecipe.findMany({ where }),
    prisma.mealRating.findMany({ where }),
    prisma.pantryItem.findMany({ where }),
    prisma.recipe.findMany({ where: { creatorId: userId, source: 'MANUAL' } }),
    prisma.chefReview.findMany({ where }),
    prisma.feedback.findMany({ where }),
    prisma.gymProfile.findUnique({ where }),
    prisma.routine.findMany({ where, include: { days: { include: { exercises: true } } } }),
    prisma.workoutSession.findMany({
      where,
      include: { exercises: { include: { sets: true } } },
    }),
    prisma.exerciseProgression.findMany({ where }),
    prisma.trainingPause.findMany({ where }),
    prisma.exercise.findMany({ where: { ownerId: userId } }),
  ]);
  if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  return {
    exportedAt: new Date().toISOString(),
    user,
    food: {
      chefProfile,
      dietaryPreferences,
      householdMembers,
      mealPlans,
      dailyLogs,
      weightEntries,
      favourites,
      ratings,
      pantryItems,
      recipes,
      chefReviews,
    },
    gym: {
      gymProfile,
      routines,
      workoutSessions,
      exerciseProgressions,
      trainingPauses,
      customExercises,
    },
    feedback,
  };
}

/**
 * Deletes the account and ALL of its data (App Store 5.1.1(v); audit P0-6).
 * Used by the self-serve `user.deleteSelf` and the admin `user.delete`.
 *
 * Most rows cascade from the users row (schema `onDelete: Cascade`), incl.
 * every Session — so the user is signed out on every device at once. The
 * explicit deletes cover what does NOT cascade or could block the delete:
 * - shopping_lists — keyed by planId with no FK, so they would be orphaned;
 * - the user's own MANUAL/imported recipes — the relation is SetNull, which
 *   would leave them behind without an owner. AI-generated recipe rows are
 *   shared recipe content (no personal data) and are kept, owner nulled;
 * - private custom ingredients (ingredient_prices.creatorId, no FK);
 * - pending password-reset tokens (keyed by email, no FK);
 * - workout sessions and routines BEFORE the user row: their exercise FKs
 *   are RESTRICT, and a custom exercise cascading away before the routine
 *   row that uses it could abort the whole delete.
 * Household members are the user's own extra eaters (no other accounts are
 * linked to them), so they simply cascade — there is nothing to hand over.
 * Everything runs in one transaction: all or nothing. After it commits, the
 * photo files the account uploaded (avatar, own recipes, custom ingredients)
 * are removed from the uploads volume, best effort (backlog P0-6).
 */
export async function deleteAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, image: true },
  });
  if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  const plans = await prisma.mealPlan.findMany({ where: { userId }, select: { id: true } });
  const planIds = plans.map((p) => p.id);
  const [ownRecipes, ownIngredients] = await Promise.all([
    prisma.recipe.findMany({
      where: { creatorId: userId, source: 'MANUAL' },
      select: { imageUrl: true },
    }),
    prisma.ingredientPrice.findMany({ where: { creatorId: userId }, select: { imageUrl: true } }),
  ]);

  await prisma.$transaction([
    prisma.shoppingList.deleteMany({ where: { planId: { in: planIds } } }),
    prisma.recipe.deleteMany({ where: { creatorId: userId, source: 'MANUAL' } }),
    prisma.ingredientPrice.deleteMany({ where: { creatorId: userId } }),
    prisma.verificationToken.deleteMany({
      where: { identifier: `reset:${user.email.toLowerCase().trim()}` },
    }),
    prisma.workoutSession.deleteMany({ where: { userId } }),
    prisma.routine.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  await deleteUploadedFiles([
    user.image,
    ...ownRecipes.map((r) => r.imageUrl),
    ...ownIngredients.map((i) => i.imageUrl),
  ]);
}

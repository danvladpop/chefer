import { TRPCError } from '@trpc/server';
import { prisma } from '@chefer/database';

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
 * Deletes the account and everything that cascades from it. The user's own
 * recipes (MANUAL) are removed first — the relation is SetNull, which would
 * otherwise leave them behind without an owner.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.recipe.deleteMany({ where: { creatorId: userId, source: 'MANUAL' } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

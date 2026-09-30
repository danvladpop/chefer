import { TRPCError } from '@trpc/server';
import { consentEventRepository, prisma } from '@chefer/database';
import { posthogAdmin } from '../../infrastructure/analytics/posthog-admin.js';
import { deleteUploadedFiles } from '../../lib/uploads/uploaded-files.js';
import { emailPreferencesService } from '../notifications/email-preferences.service.js';

// ─── Account data: export and self-deletion (audit P0-6, T-39.5) ─────────────
// Users had no way to get their data or delete their account; the privacy
// policy pointed at a feedback box no admin could read (F-PROF-1-1), and the
// app stores require in-app deletion (F-M-PROF-1-1). T-39.5 (bug B-53): the
// export was missing the consent log, email preferences, the AI call log and
// shopping lists — added below, additive to the existing shape.

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
    consentEvents,
    emailPreferences,
    aiCallLog,
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
        // T-26.1: when the user allowed health information (the log is in consentHistory).
        healthDataConsentAt: true,
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
    // §2.13 / T-39.5: the consent log is the source of truth — revoking never
    // erases a past record, so the export shows the whole history.
    consentEventRepository.findAllByUser(userId),
    emailPreferencesService.get(userId).catch(() => null),
    // What was sent, when, to which provider — never the model's output
    // (the AI call log stores none).
    prisma.aiCallLog.findMany({
      where,
      select: { callType: true, provider: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

  // Shopping lists have no userId column (keyed by planId, no FK) — resolve
  // through this user's own meal plans.
  const shoppingLists = await prisma.shoppingList.findMany({
    where: { planId: { in: mealPlans.map((p) => p.id) } },
  });

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
      shoppingLists,
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
    privacy: {
      consentHistory: consentEvents,
      emailPreferences,
      aiCallLog,
    },
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
  const [ownRecipes, ownIngredients, linkedAnalytics] = await Promise.all([
    prisma.recipe.findMany({
      where: { creatorId: userId, source: 'MANUAL' },
      select: { imageUrl: true },
    }),
    prisma.ingredientPrice.findMany({ where: { creatorId: userId }, select: { imageUrl: true } }),
    // T-12.5: read BEFORE the transaction — the ConsentEvent row cascades
    // away with the user row, so this is the last chance to know whether
    // this account ever linked analytics to itself.
    consentEventRepository.findLatestByKind(userId, 'ANALYTICS_LINKED'),
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

  // T-12.5: best-effort, after the commit — never blocks or reverts the
  // account deletion itself. A no-op (logged) when never linked, or when
  // POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID aren't configured.
  if (linkedAnalytics?.granted) {
    await posthogAdmin.deletePerson(userId);
  }
}

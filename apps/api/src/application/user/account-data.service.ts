import { TRPCError } from '@trpc/server';
import { consentEventRepository, prisma } from '@chefer/database';
import { COACHING_RETENTION } from '@chefer/types';
import { displayNameOf } from '@chefer/utils';
import { posthogAdmin } from '../../infrastructure/analytics/posthog-admin.js';
import { deleteUploadedFiles } from '../../lib/uploads/uploaded-files.js';
import { emailPreferencesService } from '../notifications/email-preferences.service.js';

// ─── Account data: export and self-deletion (audit P0-6, T-39.5) ─────────────
// Users had no way to get their data or delete their account; the privacy
// policy pointed at a feedback box no admin could read (F-PROF-1-1), and the
// app stores require in-app deletion (F-M-PROF-1-1). T-39.5 (bug B-53): the
// export was missing the consent log, email preferences, the AI call log and
// shopping lists — added below, additive to the existing shape.

// ─── Following export (PRD FR-22.1, docs/friends/implementation-plan.md §2.3) ─
// `social` is an additive section: your own settings, the people on your side
// of each relationship (display NAMES only — never another user's email, id or
// profile), requests both ways, blocks you made, your Activity items, the
// reports YOU filed (never reports about you: that is moderation data about
// someone else's action) and where your recipe copies came from.

type NameRow = { firstName: string | null; lastName: string | null; name: string | null };

async function exportSocialData(
  userId: string,
  consentEvents: { kind: string }[],
): Promise<Record<string, unknown>> {
  const [profile, follows, blocks, notifications, reports, copies] = await Promise.all([
    prisma.socialProfile.findUnique({
      where: { userId },
      select: {
        visibility: true,
        sharePlan: true,
        shareRecipes: true,
        shareWorkouts: true,
        shareTargets: true,
        activatedAt: true,
        forcedPrivateAt: true,
      },
    }),
    prisma.follow.findMany({
      where: { OR: [{ followerId: userId }, { followeeId: userId }] },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.block.findMany({ where: { blockerId: userId }, orderBy: { createdAt: 'desc' } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.userReport.findMany({ where: { reporterId: userId }, orderBy: { createdAt: 'desc' } }),
    prisma.recipe.findMany({
      where: {
        creatorId: userId,
        OR: [{ originRecipeId: { not: null } }, { originCreatorId: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        originRecipeId: true,
        originCreatorId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // One lookup for every name on the page; only name columns are selected.
  const otherIds = new Set<string>();
  for (const f of follows) otherIds.add(f.followerId === userId ? f.followeeId : f.followerId);
  for (const b of blocks) otherIds.add(b.blockedId);
  for (const n of notifications) otherIds.add(n.actorId);
  for (const r of reports) otherIds.add(r.targetUserId);
  for (const c of copies) if (c.originCreatorId) otherIds.add(c.originCreatorId);
  otherIds.delete(userId);
  const people: ({ id: string } & NameRow)[] =
    otherIds.size === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: [...otherIds] } },
          select: { id: true, firstName: true, lastName: true, name: true },
        });
  const nameById = new Map(people.map((p) => [p.id, displayNameOf(p)]));
  const nameOf = (id: string | null): string | null => (id ? (nameById.get(id) ?? null) : null);

  const outgoing = follows.filter((f) => f.followerId === userId);
  const incoming = follows.filter((f) => f.followeeId === userId);

  return {
    settings: profile,
    following: outgoing
      .filter((f) => f.status === 'ACCEPTED')
      .map((f) => ({ name: nameOf(f.followeeId), since: f.acceptedAt ?? f.createdAt })),
    followers: incoming
      .filter((f) => f.status === 'ACCEPTED')
      .map((f) => ({ name: nameOf(f.followerId), since: f.acceptedAt ?? f.createdAt })),
    pendingRequests: {
      sent: outgoing
        .filter((f) => f.status === 'PENDING')
        .map((f) => ({ name: nameOf(f.followeeId), requestedAt: f.createdAt })),
      received: incoming
        .filter((f) => f.status === 'PENDING')
        .map((f) => ({ name: nameOf(f.followerId), requestedAt: f.createdAt })),
    },
    blocksMade: blocks.map((b) => ({ name: nameOf(b.blockedId), blockedAt: b.createdAt })),
    activity: notifications.map((n) => ({
      kind: n.kind,
      name: nameOf(n.actorId),
      createdAt: n.createdAt,
      readAt: n.readAt,
    })),
    // Reports YOU filed. Whether they counted toward a threshold (`eligible`,
    // `discountedAt`) is moderation bookkeeping and is not exported.
    reportsFiled: reports.map((r) => ({
      reason: r.reason,
      about: nameOf(r.targetUserId),
      recipeId: r.recipeId,
      reportedAt: r.createdAt,
    })),
    recipeCopies: copies.map((c) => ({
      recipeId: c.id,
      name: c.name,
      copiedAt: c.createdAt,
      originRecipeId: c.originRecipeId,
      originCreator: nameOf(c.originCreatorId),
    })),
    consentHistory: consentEvents.filter((e) => e.kind === 'SOCIAL_SHARING'),
  };
}

// ─── Trainer coaching export (docs/trainer-platform/spec.md §8.4, Q-7) ────────
// `coaching` is an additive section.
//   asClient   the trainers you had and when, with the consent log rows
//   asTrainer  your trainer profile, your clients (display names, dates), your
//              invites and YOUR OWN private notes about clients
// Never another user's email or id. Whether a client's export includes the
// trainer's private notes about them is counsel question Q-7: the recommended
// default (COACHING_RETENTION.clientExportIncludesTrainerNotes = false) leaves
// them out, since the trainer is the controller of those notes. The rest of the
// client's coaching data (the routine with the trainer's exercise notes, stamps,
// targets) is already in the `gym` section.

async function exportCoachingData(
  userId: string,
  consentEvents: { kind: string }[],
): Promise<Record<string, unknown>> {
  const [trainerProfile, linksAsClient, linksAsTrainer, invites, notesWritten] = await Promise.all([
    prisma.trainerProfile.findUnique({ where: { userId } }),
    prisma.coachingLink.findMany({ where: { clientId: userId }, orderBy: { startedAt: 'desc' } }),
    prisma.coachingLink.findMany({ where: { trainerId: userId }, orderBy: { startedAt: 'desc' } }),
    prisma.coachingInvite.findMany({
      where: { trainerId: userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.coachingNote.findMany({ where: { trainerId: userId }, orderBy: { updatedAt: 'desc' } }),
  ]);
  const notesAbout = COACHING_RETENTION.clientExportIncludesTrainerNotes
    ? await prisma.coachingNote.findMany({ where: { clientId: userId, hiddenAt: null } })
    : [];

  const otherIds = new Set<string>();
  for (const l of linksAsClient) otherIds.add(l.trainerId);
  for (const l of linksAsTrainer) otherIds.add(l.clientId);
  for (const n of notesWritten) otherIds.add(n.clientId);
  otherIds.delete(userId);
  const [people, trainers] =
    otherIds.size === 0
      ? [[], []]
      : await Promise.all([
          prisma.user.findMany({
            where: { id: { in: [...otherIds] } },
            select: { id: true, firstName: true, lastName: true, name: true },
          }),
          prisma.trainerProfile.findMany({ where: { userId: { in: [...otherIds] } } }),
        ]);
  const nameById = new Map(people.map((p) => [p.id, displayNameOf(p)]));
  const trainerNameById = new Map(trainers.map((t) => [t.userId, t.displayName]));
  const clientName = (id: string) => nameById.get(id) ?? null;
  const trainerName = (id: string) => trainerNameById.get(id) ?? null;

  return {
    asClient: {
      trainers: linksAsClient.map((l) => ({
        trainer: trainerName(l.trainerId),
        since: l.startedAt,
        endedAt: l.endedAt,
        endedBy: l.endedBy,
      })),
      // Only present when the Q-7 default is changed (see above).
      trainerNotesAboutYou: notesAbout.map((n) => ({
        trainer: trainerName(n.trainerId),
        body: n.body,
        updatedAt: n.updatedAt,
      })),
      consentHistory: consentEvents.filter((e) => e.kind === 'COACHING_SHARING'),
    },
    asTrainer: {
      profile: trainerProfile
        ? {
            displayName: trainerProfile.displayName,
            activatedAt: trainerProfile.activatedAt,
            disabledAt: trainerProfile.disabledAt,
          }
        : null,
      clients: linksAsTrainer.map((l) => ({
        client: clientName(l.clientId),
        label: l.trainerLabel,
        since: l.startedAt,
        endedAt: l.endedAt,
        endedBy: l.endedBy,
      })),
      invites: invites.map((i) => ({
        label: i.label,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        usedAt: i.usedAt,
        revokedAt: i.revokedAt,
      })),
      // Your own notes: you wrote them, they are yours.
      privateNotes: notesWritten.map((n) => ({
        client: clientName(n.clientId),
        body: n.body,
        updatedAt: n.updatedAt,
        hiddenAt: n.hiddenAt,
      })),
    },
  };
}

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
  const social = await exportSocialData(userId, consentEvents);
  const coaching = await exportCoachingData(userId, consentEvents);

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
    social,
    coaching,
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
 * Following (F1.5, PRD FR-22.2): needs no explicit code — the social profile,
 * follows and blocks (both directions), suggestion dismissals, reports filed
 * AND received, the moderation log and Activity items (received and caused)
 * all cascade from the users row. Deleting the MANUAL recipes above
 * deletes the originals of other people's copies; those copies stay theirs
 * with `originRecipeId`/`originCreatorId` set to null (SetNull), and hearts on
 * the deleted originals cascade away. account-data.service.test.ts pins the
 * schema's onDelete rules so a new Following table can't forget the cascade.
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

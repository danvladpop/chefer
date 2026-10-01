import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consentEventRepository, Prisma, prisma } from '@chefer/database';
import { posthogAdmin } from '../../infrastructure/analytics/posthog-admin.js';
import { deleteUploadedFiles } from '../../lib/uploads/uploaded-files.js';
import { emailPreferencesService } from '../notifications/email-preferences.service.js';
import { deleteAccount, exportAccountData } from './account-data.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────
// Each delegate records the call and returns a tagged "operation", so the test
// can assert what went into the single $transaction and in which order.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  const op =
    (name: string) =>
    (args: unknown): { op: string; args: unknown } => ({ op: name, args });
  // A fresh vi.fn() per model — sharing ONE mock across several prisma
  // methods would make a test's mockResolvedValue on one silently apply to
  // all the others too, since they'd be the same function reference.
  const emptyFindMany = () => vi.fn(async () => []);
  return {
    ...mod,
    consentEventRepository: {
      findAllByUser: vi.fn(async () => []),
      findLatestByKind: vi.fn(async () => null),
    },
    prisma: {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(async () => []),
        delete: vi.fn(op('user.delete')),
      },
      // Following (F1.5): the export reads these; deleteAccount must NOT touch
      // them (they cascade from users) — no delete delegates on purpose.
      socialProfile: { findUnique: vi.fn(async () => null) },
      follow: { findMany: emptyFindMany() },
      block: { findMany: emptyFindMany() },
      notification: { findMany: emptyFindMany() },
      userReport: { findMany: emptyFindMany() },
      mealPlan: { findMany: vi.fn(async () => []) },
      shoppingList: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(op('shoppingList.deleteMany')),
      },
      recipe: {
        findMany: emptyFindMany(),
        deleteMany: vi.fn(op('recipe.deleteMany')),
      },
      ingredientPrice: {
        findMany: emptyFindMany(),
        deleteMany: vi.fn(op('ingredientPrice.deleteMany')),
      },
      verificationToken: { deleteMany: vi.fn(op('verificationToken.deleteMany')) },
      workoutSession: {
        deleteMany: vi.fn(op('workoutSession.deleteMany')),
        findMany: emptyFindMany(),
      },
      routine: { deleteMany: vi.fn(op('routine.deleteMany')), findMany: emptyFindMany() },
      session: { deleteMany: vi.fn(op('session.deleteMany')) },
      chefProfile: { findUnique: vi.fn(async () => null) },
      dietaryPreferences: { findUnique: vi.fn(async () => null) },
      householdMember: { findMany: emptyFindMany() },
      dailyLog: { findMany: emptyFindMany() },
      weightEntry: { findMany: emptyFindMany() },
      favouriteRecipe: { findMany: emptyFindMany() },
      mealRating: { findMany: emptyFindMany() },
      pantryItem: { findMany: emptyFindMany() },
      chefReview: { findMany: emptyFindMany() },
      feedback: { findMany: emptyFindMany() },
      gymProfile: { findUnique: vi.fn(async () => null) },
      exerciseProgression: { findMany: emptyFindMany() },
      trainingPause: { findMany: emptyFindMany() },
      exercise: { findMany: emptyFindMany() },
      aiCallLog: { findMany: emptyFindMany() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock('../../lib/uploads/uploaded-files.js', () => ({
  deleteUploadedFiles: vi.fn(async () => 0),
}));

vi.mock('../notifications/email-preferences.service.js', () => ({
  emailPreferencesService: { get: vi.fn() },
}));

vi.mock('../../infrastructure/analytics/posthog-admin.js', () => ({
  posthogAdmin: { deletePerson: vi.fn(async () => undefined) },
}));

type Op = { op: string; args: { where: Record<string, unknown> } };

beforeEach(() => {
  vi.mocked(deleteUploadedFiles).mockClear();
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.mealPlan.findMany).mockReset();
  vi.mocked(prisma.$transaction)
    .mockReset()
    .mockResolvedValue([] as never);
  vi.mocked(consentEventRepository.findLatestByKind).mockReset().mockResolvedValue(null);
  vi.mocked(posthogAdmin.deletePerson).mockClear();
});

function transactionOps(): Op[] {
  const [ops] = vi.mocked(prisma.$transaction).mock.calls[0] as unknown as [Op[]];
  return ops;
}

describe('deleteAccount', () => {
  it('throws NOT_FOUND and deletes nothing for an unknown user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(deleteAccount('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('purges what does not cascade, then the user, in one transaction', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'Alice@Test.dev' } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([{ id: 'p1' }, { id: 'p2' }] as never);

    await deleteAccount('u1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = transactionOps();
    const byName = Object.fromEntries(ops.map((o) => [o.op, o.args.where]));

    // Shopping lists are keyed by planId with no FK — would be orphaned.
    expect(byName['shoppingList.deleteMany']).toEqual({ planId: { in: ['p1', 'p2'] } });
    // Own recipes (SetNull relation) and private custom ingredients (no FK).
    expect(byName['recipe.deleteMany']).toEqual({ creatorId: 'u1', source: 'MANUAL' });
    expect(byName['ingredientPrice.deleteMany']).toEqual({ creatorId: 'u1' });
    // Password-reset tokens are keyed by normalised email.
    expect(byName['verificationToken.deleteMany']).toEqual({ identifier: 'reset:alice@test.dev' });
    // Every session on every device is revoked.
    expect(byName['session.deleteMany']).toEqual({ userId: 'u1' });
    expect(byName['user.delete']).toEqual({ id: 'u1' });
  });

  it('removes workouts and routines before the user row (RESTRICT exercise FKs)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);

    await deleteAccount('u1');

    const order = transactionOps().map((o) => o.op);
    expect(order.at(-1)).toBe('user.delete');
    expect(order.indexOf('workoutSession.deleteMany')).toBeLessThan(order.indexOf('user.delete'));
    expect(order.indexOf('routine.deleteMany')).toBeLessThan(order.indexOf('user.delete'));
  });

  it('propagates a failed transaction (nothing is half-deleted)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('FK violation'));

    await expect(deleteAccount('u1')).rejects.toThrow('FK violation');
    expect(deleteUploadedFiles).not.toHaveBeenCalled();
  });

  it('removes the uploaded photos of the avatar, own recipes and custom ingredients after the commit', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: 'a@test.dev',
      image: 'https://x.dev/uploads/avatar.jpg',
    } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      { imageUrl: 'https://x.dev/uploads/r1.jpg' },
      { imageUrl: null },
    ] as never);
    vi.mocked(prisma.ingredientPrice.findMany).mockResolvedValue([
      { imageUrl: 'https://x.dev/uploads/i1.png' },
    ] as never);

    await deleteAccount('u1');

    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { creatorId: 'u1', source: 'MANUAL' } }),
    );
    expect(deleteUploadedFiles).toHaveBeenCalledWith([
      'https://x.dev/uploads/avatar.jpg',
      'https://x.dev/uploads/r1.jpg',
      null,
      'https://x.dev/uploads/i1.png',
    ]);
  });

  describe('T-12.5: deletion of linked analytics events', () => {
    it('deletes the PostHog person when the account ever linked analytics', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
      vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);
      vi.mocked(consentEventRepository.findLatestByKind).mockResolvedValue({
        granted: true,
      } as never);

      await deleteAccount('u1');

      expect(consentEventRepository.findLatestByKind).toHaveBeenCalledWith(
        'u1',
        'ANALYTICS_LINKED',
      );
      expect(posthogAdmin.deletePerson).toHaveBeenCalledWith('u1');
    });

    it('skips the PostHog call when the account never linked', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
      vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);
      vi.mocked(consentEventRepository.findLatestByKind).mockResolvedValue(null);

      await deleteAccount('u1');

      expect(posthogAdmin.deletePerson).not.toHaveBeenCalled();
    });

    it('skips the PostHog call when linking was later revoked', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
      vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);
      vi.mocked(consentEventRepository.findLatestByKind).mockResolvedValue({
        granted: false,
      } as never);

      await deleteAccount('u1');

      expect(posthogAdmin.deletePerson).not.toHaveBeenCalled();
    });

    it('reads the consent state BEFORE the transaction (the row cascades away with the user)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
      vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);
      const callOrder: string[] = [];
      vi.mocked(consentEventRepository.findLatestByKind).mockImplementation(async () => {
        callOrder.push('read-consent');
        return { granted: true } as never;
      });
      vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
        callOrder.push('transaction');
        return Promise.all(ops as Promise<unknown>[]);
      });

      await deleteAccount('u1');

      expect(callOrder).toEqual(['read-consent', 'transaction']);
    });
  });
});

describe('exportAccountData (T-39.5, bug B-53)', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'a@test.dev',
      name: 'A',
      firstName: 'A',
      lastName: null,
      planTier: 'FREE',
      createdAt: new Date('2026-01-01'),
    } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([{ id: 'p1' }] as never);
    vi.mocked(prisma.shoppingList.findMany).mockResolvedValue([
      { id: 's1', planId: 'p1' },
    ] as never);
    vi.mocked(consentEventRepository.findAllByUser).mockResolvedValue([
      { id: 'e1', kind: 'AI', granted: true },
    ] as never);
    vi.mocked(emailPreferencesService.get).mockResolvedValue({
      weekReady: true,
      weeklyRecap: false,
      emailConfirmed: true,
      email: 'a@test.dev',
    });
    vi.mocked(prisma.aiCallLog.findMany).mockResolvedValue([
      { callType: 'MEAL_PLAN', provider: 'gemini', createdAt: new Date('2026-09-01') },
    ] as never);
  });

  it('throws NOT_FOUND for an unknown user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(exportAccountData('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('adds the consent log, email preferences and AI call log under privacy (AC5)', async () => {
    const data = await exportAccountData('u1');
    expect(data['privacy']).toMatchObject({
      consentHistory: [{ id: 'e1', kind: 'AI', granted: true }],
      emailPreferences: { emailConfirmed: true, email: 'a@test.dev' },
      aiCallLog: [{ callType: 'MEAL_PLAN', provider: 'gemini' }],
    });
  });

  it("resolves shopping lists through the user's own meal plans (no userId FK on ShoppingList)", async () => {
    await exportAccountData('u1');
    expect(prisma.shoppingList.findMany).toHaveBeenCalledWith({
      where: { planId: { in: ['p1'] } },
    });
    const data = await exportAccountData('u1');
    expect((data['food'] as { shoppingLists: unknown[] }).shoppingLists).toEqual([
      { id: 's1', planId: 'p1' },
    ]);
  });

  it('the AI call log query selects only type, provider and time — never model output', async () => {
    await exportAccountData('u1');
    expect(prisma.aiCallLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        select: { callType: true, provider: true, createdAt: true },
      }),
    );
  });

  it('a missing email-preferences row (e.g. a race with deletion) does not fail the export', async () => {
    vi.mocked(emailPreferencesService.get).mockRejectedValue(new Error('Account not found'));
    const data = await exportAccountData('u1');
    expect((data['privacy'] as { emailPreferences: unknown }).emailPreferences).toBeNull();
  });
});

// ─── Following (F1.5, PRD FR-22) ──────────────────────────────────────────────

const FOLLOWING_MODELS = [
  'SocialProfile',
  'Follow',
  'Block',
  'SuggestionDismissal',
  'UserReport',
  'ModerationLog',
  'Notification',
];

type RelationField = { name: string; type: string; kind: string; relationOnDelete?: string };

function relationFields(model: string): RelationField[] {
  const found = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!found) throw new Error(`model ${model} not in the schema`);
  return found.fields.filter((f) => f.kind === 'object');
}

describe('deleteAccount and Following data (PRD FR-22.2)', () => {
  it('relies on the schema cascade: every Following table cascades from User (INV: every new user-owned table)', () => {
    for (const model of FOLLOWING_MODELS) {
      const userRelations = relationFields(model).filter((f) => f.type === 'User');
      expect(userRelations.length, `${model} has a relation to User`).toBeGreaterThan(0);
      for (const rel of userRelations) {
        expect(rel.relationOnDelete, `${model}.${rel.name}`).toBe('Cascade');
      }
    }
  });

  it("a deleted owner's recipe copies survive: origin pointers are SetNull, not Cascade", () => {
    const byName = new Map(relationFields('Recipe').map((f) => [f.name, f]));
    expect(byName.get('originRecipe')?.relationOnDelete).toBe('SetNull');
    expect(byName.get('originCreator')?.relationOnDelete).toBe('SetNull');
  });

  it('adds no explicit Following deletes: follows, blocks, reports and notifications in both directions all go with the user row', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);

    await deleteAccount('u1');

    // Exactly the pre-Following set: nothing for follows/blocks/reports/
    // notifications/dismissals/profile — the cascade covers them.
    expect(transactionOps().map((o) => o.op)).toEqual([
      'shoppingList.deleteMany',
      'recipe.deleteMany',
      'ingredientPrice.deleteMany',
      'verificationToken.deleteMany',
      'workoutSession.deleteMany',
      'routine.deleteMany',
      'session.deleteMany',
      'user.delete',
    ]);
  });

  it("deletes only the leaver's own MANUAL recipes, so a copy someone else made is never matched", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'a@test.dev' } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);

    await deleteAccount('u1');

    const recipeDelete = transactionOps().find((o) => o.op === 'recipe.deleteMany');
    // Scoped by creatorId: the other user's copy (creatorId = them) is outside it.
    expect(recipeDelete?.args.where).toEqual({ creatorId: 'u1', source: 'MANUAL' });
  });
});

describe('exportAccountData social section (PRD FR-22.1)', () => {
  const at = (iso: string): Date => new Date(iso);

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'me@test.dev',
      name: 'Me',
      firstName: 'Me',
      lastName: null,
      planTier: 'FREE',
      createdAt: at('2026-01-01'),
    } as never);
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.shoppingList.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.recipe.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.user.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.socialProfile.findUnique).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.follow.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.block.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.notification.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(prisma.userReport.findMany)
      .mockReset()
      .mockResolvedValue([] as never);
    vi.mocked(consentEventRepository.findAllByUser).mockResolvedValue([] as never);
    vi.mocked(emailPreferencesService.get).mockResolvedValue(null as never);
  });

  function socialOf(data: Record<string, unknown>): Record<string, unknown> {
    return data['social'] as Record<string, unknown>;
  }

  it('is an empty, well-formed section for someone who never turned Following on', async () => {
    const social = socialOf(await exportAccountData('u1'));
    expect(social).toEqual({
      settings: null,
      following: [],
      followers: [],
      pendingRequests: { sent: [], received: [] },
      blocksMade: [],
      activity: [],
      reportsFiled: [],
      recipeCopies: [],
      consentHistory: [],
    });
    // No names to look up → no user query.
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('exports settings, both follow lists, requests both ways, blocks, activity, reports filed, copy origins and the sharing consent', async () => {
    vi.mocked(prisma.socialProfile.findUnique).mockResolvedValue({
      visibility: 'PUBLIC',
      sharePlan: true,
      shareRecipes: true,
      shareWorkouts: false,
      shareTargets: false,
      activatedAt: at('2026-02-01'),
      forcedPrivateAt: null,
    } as never);
    vi.mocked(prisma.follow.findMany).mockResolvedValue([
      // I follow u2
      {
        followerId: 'u1',
        followeeId: 'u2',
        status: 'ACCEPTED',
        createdAt: at('2026-03-01'),
        acceptedAt: at('2026-03-02'),
      },
      // u3 follows me
      {
        followerId: 'u3',
        followeeId: 'u1',
        status: 'ACCEPTED',
        createdAt: at('2026-03-03'),
        acceptedAt: null,
      },
      // my pending request to u4
      {
        followerId: 'u1',
        followeeId: 'u4',
        status: 'PENDING',
        createdAt: at('2026-03-04'),
        acceptedAt: null,
      },
      // u5's pending request to me
      {
        followerId: 'u5',
        followeeId: 'u1',
        status: 'PENDING',
        createdAt: at('2026-03-05'),
        acceptedAt: null,
      },
    ] as never);
    vi.mocked(prisma.block.findMany).mockResolvedValue([
      { blockerId: 'u1', blockedId: 'u6', createdAt: at('2026-03-06') },
    ] as never);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { kind: 'NEW_FOLLOWER', actorId: 'u3', createdAt: at('2026-03-03'), readAt: null },
    ] as never);
    vi.mocked(prisma.userReport.findMany).mockResolvedValue([
      {
        reporterId: 'u1',
        targetUserId: 'u6',
        recipeId: 'r9',
        reason: 'SPAM',
        eligible: true,
        discountedAt: null,
        createdAt: at('2026-03-07'),
      },
    ] as never);
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      {
        id: 'copy1',
        name: 'Shakshuka',
        originRecipeId: 'orig1',
        originCreatorId: 'u2',
        createdAt: at('2026-03-08'),
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u2', firstName: 'Bea', lastName: 'Two', name: null },
      { id: 'u3', firstName: 'Cy', lastName: 'Three', name: null },
      { id: 'u4', firstName: null, lastName: null, name: 'Di Four' },
      { id: 'u5', firstName: 'Ed', lastName: 'Five', name: null },
      { id: 'u6', firstName: 'Flo', lastName: 'Six', name: null },
    ] as never);
    vi.mocked(consentEventRepository.findAllByUser).mockResolvedValue([
      { id: 'e1', kind: 'SOCIAL_SHARING', granted: true },
      { id: 'e2', kind: 'AI', granted: true },
    ] as never);

    const social = socialOf(await exportAccountData('u1'));

    expect(social['settings']).toMatchObject({ visibility: 'PUBLIC', shareWorkouts: false });
    expect(social['following']).toEqual([{ name: 'Bea Two', since: at('2026-03-02') }]);
    expect(social['followers']).toEqual([{ name: 'Cy Three', since: at('2026-03-03') }]);
    expect(social['pendingRequests']).toEqual({
      sent: [{ name: 'Di Four', requestedAt: at('2026-03-04') }],
      received: [{ name: 'Ed Five', requestedAt: at('2026-03-05') }],
    });
    expect(social['blocksMade']).toEqual([{ name: 'Flo Six', blockedAt: at('2026-03-06') }]);
    expect(social['activity']).toEqual([
      { kind: 'NEW_FOLLOWER', name: 'Cy Three', createdAt: at('2026-03-03'), readAt: null },
    ]);
    expect(social['reportsFiled']).toEqual([
      { reason: 'SPAM', about: 'Flo Six', recipeId: 'r9', reportedAt: at('2026-03-07') },
    ]);
    expect(social['recipeCopies']).toEqual([
      {
        recipeId: 'copy1',
        name: 'Shakshuka',
        copiedAt: at('2026-03-08'),
        originRecipeId: 'orig1',
        originCreator: 'Bea Two',
      },
    ]);
    // Only the SOCIAL_SHARING events (the whole log is under privacy.consentHistory).
    expect(social['consentHistory']).toEqual([{ id: 'e1', kind: 'SOCIAL_SHARING', granted: true }]);
  });

  it("never exports other users' emails or ids, or moderation bookkeeping", async () => {
    vi.mocked(prisma.follow.findMany).mockResolvedValue([
      {
        followerId: 'u1',
        followeeId: 'u2',
        status: 'ACCEPTED',
        createdAt: at('2026-03-01'),
        acceptedAt: null,
      },
    ] as never);
    vi.mocked(prisma.userReport.findMany).mockResolvedValue([
      {
        reporterId: 'u1',
        targetUserId: 'u2',
        recipeId: null,
        reason: 'OTHER',
        eligible: true,
        discountedAt: at('2026-03-09'),
        createdAt: at('2026-03-07'),
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u2', firstName: 'Bea', lastName: 'Two', name: null },
    ] as never);

    const social = socialOf(await exportAccountData('u1'));
    const json = JSON.stringify(social);

    expect(json).not.toContain('@');
    expect(json).not.toContain('"u2"');
    expect(json).not.toContain('eligible');
    expect(json).not.toContain('discountedAt');
    // The name lookup selects name columns only.
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u2'] } },
      select: { id: true, firstName: true, lastName: true, name: true },
    });
  });

  it('lists only reports YOU filed, and only blocks YOU made, never those about or against you', async () => {
    await exportAccountData('u1');
    expect(prisma.userReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reporterId: 'u1' } }),
    );
    expect(prisma.block.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blockerId: 'u1' } }),
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('falls back to a generic name for an account with no name at all', async () => {
    vi.mocked(prisma.follow.findMany).mockResolvedValue([
      {
        followerId: 'u2',
        followeeId: 'u1',
        status: 'ACCEPTED',
        createdAt: at('2026-03-01'),
        acceptedAt: null,
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u2', firstName: null, lastName: null, name: null },
    ] as never);
    const social = socialOf(await exportAccountData('u1'));
    expect((social['followers'] as { name: string }[])[0]?.name).toBe('Chefer user');
  });
});

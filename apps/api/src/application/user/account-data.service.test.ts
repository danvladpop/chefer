import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consentEventRepository, prisma } from '@chefer/database';
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
      user: { findUnique: vi.fn(), delete: vi.fn(op('user.delete')) },
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

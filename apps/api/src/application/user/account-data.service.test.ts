import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import { deleteUploadedFiles } from '../../lib/uploads/uploaded-files.js';
import { deleteAccount } from './account-data.service.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────
// Each delegate records the call and returns a tagged "operation", so the test
// can assert what went into the single $transaction and in which order.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  const op =
    (name: string) =>
    (args: unknown): { op: string; args: unknown } => ({ op: name, args });
  return {
    ...mod,
    prisma: {
      user: { findUnique: vi.fn(), delete: vi.fn(op('user.delete')) },
      mealPlan: { findMany: vi.fn() },
      shoppingList: { deleteMany: vi.fn(op('shoppingList.deleteMany')) },
      recipe: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(op('recipe.deleteMany')),
      },
      ingredientPrice: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(op('ingredientPrice.deleteMany')),
      },
      verificationToken: { deleteMany: vi.fn(op('verificationToken.deleteMany')) },
      workoutSession: { deleteMany: vi.fn(op('workoutSession.deleteMany')) },
      routine: { deleteMany: vi.fn(op('routine.deleteMany')) },
      session: { deleteMany: vi.fn(op('session.deleteMany')) },
      $transaction: vi.fn(),
    },
  };
});

vi.mock('../../lib/uploads/uploaded-files.js', () => ({
  deleteUploadedFiles: vi.fn(async () => 0),
}));

type Op = { op: string; args: { where: Record<string, unknown> } };

beforeEach(() => {
  vi.mocked(deleteUploadedFiles).mockClear();
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.mealPlan.findMany).mockReset();
  vi.mocked(prisma.$transaction)
    .mockReset()
    .mockResolvedValue([] as never);
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
});

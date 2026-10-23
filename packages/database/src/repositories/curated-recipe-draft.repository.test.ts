import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CuratedDraftStateError,
  CuratedRecipeDraftRepository,
  type CuratedPublishData,
} from './curated-recipe-draft.repository';

// Market review F1: a draft is never served. These pin the two queries that
// keep it that way — the pool reads APPROVED drafts only, and publish refuses
// anything but a DRAFT.

const p = vi.hoisted(() => ({
  draftFindMany: vi.fn(),
  draftFindUnique: vi.fn(),
  draftUpdateMany: vi.fn(),
  recipeFindMany: vi.fn(),
  recipeCreate: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../client', () => ({
  prisma: {
    curatedRecipeDraft: {
      findMany: p.draftFindMany,
      findUnique: p.draftFindUnique,
      updateMany: p.draftUpdateMany,
    },
    recipe: { findMany: p.recipeFindMany, create: p.recipeCreate },
    $transaction: p.transaction,
  },
}));
vi.mock('./recipe-line.repository', () => ({ recipeLineRepository: { writeLines: vi.fn() } }));

const repo = new CuratedRecipeDraftRepository();

describe('CuratedRecipeDraftRepository.findApproved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads APPROVED drafts only, and only their live CURATED recipe rows', async () => {
    p.draftFindMany.mockResolvedValue([{ id: 'd1', status: 'APPROVED', recipeId: 'r1' }]);
    p.recipeFindMany.mockResolvedValue([{ id: 'r1', nutritionInfo: {}, imageUrl: null }]);

    const rows = await repo.findApproved();

    expect(p.draftFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED', recipeId: { not: null } } }),
    );
    expect(p.recipeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['r1'] }, source: 'CURATED', deletedAt: null, hiddenAt: null },
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it('drops an approved draft whose recipe row is gone', async () => {
    p.draftFindMany.mockResolvedValue([{ id: 'd1', status: 'APPROVED', recipeId: 'r1' }]);
    p.recipeFindMany.mockResolvedValue([]);
    await expect(repo.findApproved()).resolves.toEqual([]);
  });
});

describe('CuratedRecipeDraftRepository.publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        curatedRecipeDraft: { findUnique: p.draftFindUnique, updateMany: p.draftUpdateMany },
        recipe: { create: p.recipeCreate },
      }),
    );
  });

  it.each(['EXTRACTING', 'FAILED', 'APPROVED', 'REJECTED', 'UNPUBLISHED'])(
    'refuses a %s draft without creating a recipe',
    async (status) => {
      p.draftFindUnique.mockResolvedValue({ status });
      await expect(repo.publish('d1', {} as CuratedPublishData)).rejects.toBeInstanceOf(
        CuratedDraftStateError,
      );
      expect(p.recipeCreate).not.toHaveBeenCalled();
    },
  );
});

import type {
  CuratedDraftStatus,
  CuratedProseStatus,
  CuratedRecipeDraft,
  Prisma,
  Recipe,
} from '@prisma/client';
import { prisma } from '../client';
import {
  recipeLineRepository,
  type RecipeLineWrite,
  type RecipeNutritionWrite,
} from './recipe-line.repository';

// ─── Curated recipe ingest (market review F1, 2026-10-22) ─────────────────────
// Drafts live in their own table and are never served. `publish` is the only
// write that creates the CURATED recipe row, in one transaction with the
// draft's APPROVED flip, so a recipe row exists if and only if its draft was
// approved.

export type CuratedDraftCreateData = {
  sourceUrl: string;
  submittedUrl: string;
  via: 'video' | 'web';
  createdById: string;
};

export type CuratedDraftPatch = Partial<{
  sourceUrl: string;
  status: CuratedDraftStatus;
  draft: Prisma.InputJsonValue;
  mealTypes: string[];
  proseStatus: CuratedProseStatus;
  assumptions: string[];
  notFound: string[];
  platform: string | null;
  creator: string | null;
  sourceTitle: string | null;
  transcriptSource: string | null;
  error: string | null;
  rejectReason: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  submittedAt: Date;
}>;

/** The CURATED recipe row an approval writes (lines and nutrition come separately). */
export type CuratedRecipeCreateData = {
  name: string;
  description: string;
  ingredients: Prisma.InputJsonValue;
  instructions: string[];
  nutritionInfo: Prisma.InputJsonValue;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  sourceUrl: string;
};

export type CuratedPublishData = {
  recipe: CuratedRecipeCreateData;
  lines: RecipeLineWrite[];
  nutrition: RecipeNutritionWrite;
  /** The finalised draft (resolved slugs, derived tags), stored back on the draft. */
  draft: Prisma.InputJsonValue;
  mealTypes: string[];
  reviewedById: string;
};

/** An APPROVED draft with the recipe row the pool serves. */
export type ApprovedCuratedDraft = {
  draft: CuratedRecipeDraft;
  recipe: Pick<Recipe, 'id' | 'nutritionInfo' | 'imageUrl' | 'nutritionStatus'>;
};

/** Thrown by `publish` when the draft is no longer DRAFT (a concurrent review won). */
export class CuratedDraftStateError extends Error {
  constructor(public readonly status: CuratedDraftStatus | null) {
    super(`Curated draft is ${status ?? 'missing'}, not DRAFT`);
    this.name = 'CuratedDraftStateError';
  }
}

export interface ICuratedRecipeDraftRepository {
  create(data: CuratedDraftCreateData): Promise<CuratedRecipeDraft>;
  findById(id: string): Promise<CuratedRecipeDraft | null>;
  findBySourceUrl(sourceUrl: string): Promise<CuratedRecipeDraft | null>;
  /** Newest first; all statuses when `statuses` is empty. */
  list(statuses: CuratedDraftStatus[], limit: number): Promise<CuratedRecipeDraft[]>;
  countByStatus(): Promise<Partial<Record<CuratedDraftStatus, number>>>;
  /** Drafts sent to the extractor at or after `since` (first submits and retries). */
  countSubmittedSince(since: Date): Promise<number>;
  update(id: string, patch: CuratedDraftPatch): Promise<CuratedRecipeDraft>;
  /**
   * Updates only while the draft is in one of `from` (optimistic state guard).
   * Returns false when it was not.
   */
  updateIfStatus(
    id: string,
    from: CuratedDraftStatus[],
    patch: CuratedDraftPatch,
  ): Promise<boolean>;
  /** DRAFT → APPROVED, creating the CURATED recipe with its lines, atomically. */
  publish(
    id: string,
    data: CuratedPublishData,
  ): Promise<{ draft: CuratedRecipeDraft; recipe: Recipe }>;
  findApproved(): Promise<ApprovedCuratedDraft[]>;
}

export class CuratedRecipeDraftRepository implements ICuratedRecipeDraftRepository {
  create(data: CuratedDraftCreateData): Promise<CuratedRecipeDraft> {
    return prisma.curatedRecipeDraft.create({ data: { ...data, status: 'EXTRACTING' } });
  }

  findById(id: string): Promise<CuratedRecipeDraft | null> {
    return prisma.curatedRecipeDraft.findUnique({ where: { id } });
  }

  findBySourceUrl(sourceUrl: string): Promise<CuratedRecipeDraft | null> {
    return prisma.curatedRecipeDraft.findUnique({ where: { sourceUrl } });
  }

  list(statuses: CuratedDraftStatus[], limit: number): Promise<CuratedRecipeDraft[]> {
    return prisma.curatedRecipeDraft.findMany({
      where: statuses.length > 0 ? { status: { in: statuses } } : {},
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async countByStatus(): Promise<Partial<Record<CuratedDraftStatus, number>>> {
    const rows = await prisma.curatedRecipeDraft.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }

  countSubmittedSince(since: Date): Promise<number> {
    return prisma.curatedRecipeDraft.count({ where: { submittedAt: { gte: since } } });
  }

  update(id: string, patch: CuratedDraftPatch): Promise<CuratedRecipeDraft> {
    return prisma.curatedRecipeDraft.update({ where: { id }, data: patch });
  }

  async updateIfStatus(
    id: string,
    from: CuratedDraftStatus[],
    patch: CuratedDraftPatch,
  ): Promise<boolean> {
    const { count } = await prisma.curatedRecipeDraft.updateMany({
      where: { id, status: { in: from } },
      data: patch,
    });
    return count === 1;
  }

  publish(
    id: string,
    data: CuratedPublishData,
  ): Promise<{ draft: CuratedRecipeDraft; recipe: Recipe }> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.curatedRecipeDraft.findUnique({
        where: { id },
        select: { status: true },
      });
      if (current?.status !== 'DRAFT') throw new CuratedDraftStateError(current?.status ?? null);

      const created = await tx.recipe.create({
        data: {
          ...data.recipe,
          source: 'CURATED',
          creatorId: null,
          imageUrl: null,
          // Never the creator's image: the image worker generates one.
          imageStatus: 'PENDING',
        },
      });
      await recipeLineRepository.writeLines(created.id, data.lines, data.nutrition, tx);
      const { count } = await tx.curatedRecipeDraft.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          status: 'APPROVED',
          recipeId: created.id,
          draft: data.draft,
          mealTypes: data.mealTypes,
          reviewedById: data.reviewedById,
          reviewedAt: new Date(),
          error: null,
        },
      });
      if (count !== 1) throw new CuratedDraftStateError(null);
      const [draft, recipe] = await Promise.all([
        tx.curatedRecipeDraft.findUniqueOrThrow({ where: { id } }),
        tx.recipe.findUniqueOrThrow({ where: { id: created.id } }),
      ]);
      return { draft, recipe };
    });
  }

  async findApproved(): Promise<ApprovedCuratedDraft[]> {
    const drafts = await prisma.curatedRecipeDraft.findMany({
      where: { status: 'APPROVED', recipeId: { not: null } },
      orderBy: { reviewedAt: 'asc' },
    });
    const ids = drafts.flatMap((d) => (d.recipeId ? [d.recipeId] : []));
    if (ids.length === 0) return [];
    const recipes = new Map(
      (
        await prisma.recipe.findMany({
          where: { id: { in: ids }, source: 'CURATED', deletedAt: null, hiddenAt: null },
          select: { id: true, nutritionInfo: true, imageUrl: true, nutritionStatus: true },
        })
      ).map((r) => [r.id, r] as const),
    );
    return drafts.flatMap((draft) => {
      const recipe = draft.recipeId ? recipes.get(draft.recipeId) : undefined;
      return recipe ? [{ draft, recipe }] : [];
    });
  }
}

export const curatedRecipeDraftRepository = new CuratedRecipeDraftRepository();

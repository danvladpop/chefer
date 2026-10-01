import type { ModerationAction, ModerationLog, RecipeHiddenReason } from '@prisma/client';
import { prisma } from '../client';
import type { SocialDbClient } from './social-profile.repository';

// ─── Following: automatic moderation (docs/friends/implementation-plan.md §4.6)
// Append-only log + the recipe hide/unhide writes. INV-10: every automatic
// action writes one ModerationLog row in the SAME transaction as the action,
// so ModerationService passes its `tx` as `db` to both calls.

export interface ModerationLogEntry {
  action: ModerationAction;
  targetUserId: string;
  recipeId?: string | null;
  /** e.g. "3 distinct eligible reporters", "blocked term in name". */
  reason: string;
  distinctReporters?: number | null;
  actor: 'system' | 'ops';
  /** For UNDO rows: the id of the row being undone. */
  undoOfId?: string | null;
}

export type ModerationWeeklyCounts = Record<ModerationAction, number>;

export interface FilterableRecipeRow {
  id: string;
  name: string;
  description: string;
}

export interface IModerationRepository {
  log(entry: ModerationLogEntry, db?: SocialDbClient): Promise<ModerationLog>;
  find(id: string): Promise<ModerationLog | null>;
  /** Rows per action created at or after `since` (every action present, 0 when none). */
  weeklyCounts(since: Date): Promise<ModerationWeeklyCounts>;
  /** Sets `hiddenAt`/`hiddenReason` unless already hidden. Returns whether it hid the recipe. */
  hideRecipe(recipeId: string, reason: RecipeHiddenReason, db?: SocialDbClient): Promise<boolean>;
  /**
   * Clears `hiddenAt`/`hiddenReason`. With `onlyReason`, only a recipe hidden for
   * that reason is cleared (editing a FILTER-hidden recipe never un-hides a
   * REPORTS one). Returns whether it un-hid the recipe.
   */
  unhideRecipe(
    recipeId: string,
    onlyReason?: RecipeHiddenReason,
    db?: SocialDbClient,
  ): Promise<boolean>;
  /** The user's own shared recipes the word filter checks: MANUAL, not a copy, not hidden. */
  ownSharedRecipesForFilter(userId: string): Promise<FilterableRecipeRow[]>;
}

const MODERATION_ACTIONS: readonly ModerationAction[] = [
  'RECIPE_AUTO_HIDDEN',
  'ACCOUNT_FORCED_PRIVATE',
  'RECIPE_FILTER_HIDDEN',
  'NAME_REJECTED',
  'RECIPE_TEXT_REJECTED',
  'UNDO',
];

export class ModerationRepository implements IModerationRepository {
  async log(entry: ModerationLogEntry, db: SocialDbClient = prisma): Promise<ModerationLog> {
    return db.moderationLog.create({ data: entry });
  }

  async find(id: string): Promise<ModerationLog | null> {
    return prisma.moderationLog.findUnique({ where: { id } });
  }

  async weeklyCounts(since: Date): Promise<ModerationWeeklyCounts> {
    const groups = await prisma.moderationLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      MODERATION_ACTIONS.map((a) => [a, 0]),
    ) as ModerationWeeklyCounts;
    for (const g of groups) counts[g.action] = g._count._all;
    return counts;
  }

  async hideRecipe(
    recipeId: string,
    reason: RecipeHiddenReason,
    db: SocialDbClient = prisma,
  ): Promise<boolean> {
    const { count } = await db.recipe.updateMany({
      where: { id: recipeId, hiddenAt: null },
      data: { hiddenAt: new Date(), hiddenReason: reason },
    });
    return count > 0;
  }

  async unhideRecipe(
    recipeId: string,
    onlyReason?: RecipeHiddenReason,
    db: SocialDbClient = prisma,
  ): Promise<boolean> {
    const { count } = await db.recipe.updateMany({
      where: {
        id: recipeId,
        hiddenAt: { not: null },
        ...(onlyReason && { hiddenReason: onlyReason }),
      },
      data: { hiddenAt: null, hiddenReason: null },
    });
    return count > 0;
  }

  async ownSharedRecipesForFilter(userId: string): Promise<FilterableRecipeRow[]> {
    return prisma.recipe.findMany({
      where: { creatorId: userId, source: 'MANUAL', originRecipeId: null, hiddenAt: null },
      select: { id: true, name: true, description: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export const moderationRepository = new ModerationRepository();

import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import type { ModerationAction } from '@chefer/database';
import type { reportInputSchema } from '@chefer/types';

// ─── Following: automatic moderation (implementation-plan.md §4.4, §4.6) ──────
// TYPED STUB (F0.3). The method signatures below are final: batch-A lanes call
// `hideFilteredRecipes` (L-GRAPH activate / recipes-on) and `checkRecipeText`
// (L-XRECIPE recipe writes), the F1.5 worker calls `weeklyMetrics`, and the
// ops script calls `undo`. L-MODERATION replaces the bodies (and adds a
// constructor with defaulted repositories, the HouseholdService pattern, so
// `new ModerationService()` and the singleton keep working) without changing
// a signature.
//
// Until then: nothing is hidden, every text passes, the metrics are zeros, and
// report/undo refuse to run.

export type ReportInput = z.infer<typeof reportInputSchema>;

/** The text the word filter checks on a shared recipe write (PRD §9.4). */
export interface RecipeTextInput {
  name: string;
  description?: string | null;
}

/** One `moderation.weekly { … }` log line (plan §4.6). */
export interface ModerationWeeklyMetrics {
  reports: number;
  eligibleReports: number;
  recipeAutoHidden: number;
  accountForcedPrivate: number;
  nameRejected: number;
  recipeTextRejected: number;
  recipeFilterHidden: number;
  undo: number;
}

export interface ModerationUndoResult {
  /** The log row that was undone. */
  logId: string;
  action: ModerationAction;
  /** The UNDO row written (null on a dry run). */
  undoLogId: string | null;
  dryRun: boolean;
}

function notImplemented(what: string): TRPCError {
  return new TRPCError({ code: 'NOT_IMPLEMENTED', message: `${what}: not implemented` });
}

export class ModerationService {
  /**
   * Report and block in one transaction (plan §4.6): validates visibility
   * (NOT_FOUND otherwise, INV-3), files the report, blocks, applies the recipe
   * and account thresholds and logs each action. Always blocks.
   */
  reportAndBlock(_reporterId: string, _input: ReportInput): Promise<{ ok: true }> {
    return Promise.reject(notImplemented('reportAndBlock'));
  }

  /**
   * Hides the user's own shared recipes whose name or description trips the
   * word filter (FILTER reason, one RECIPE_FILTER_HIDDEN row each). Run after
   * turn-on and when recipe sharing goes on. Returns how many it hid.
   */
  hideFilteredRecipes(_userId: string): Promise<number> {
    return Promise.resolve(0);
  }

  /**
   * The word filter on a recipe write, applied only when the author has a
   * SocialProfile with `shareRecipes`: a blocked term logs RECIPE_TEXT_REJECTED
   * and throws BAD_REQUEST + `data.textRejected: 'recipe'`
   * (`textRejectedError('recipe')`). With `recipeId` (an edit), clean text
   * un-hides a FILTER-hidden recipe — never a REPORTS-hidden one.
   */
  checkRecipeText(_userId: string, _text: RecipeTextInput, _recipeId?: string): Promise<void> {
    return Promise.resolve();
  }

  /** Ops undo of one automatic action (scripts/moderation-undo.ts). Writes an UNDO row. */
  undo(_logId: string, _opts?: { dryRun?: boolean }): Promise<ModerationUndoResult> {
    return Promise.reject(notImplemented('undo'));
  }

  /** Counts since `since` for the weekly metrics line (friends-maintenance.worker.ts). */
  weeklyMetrics(_since: Date): Promise<ModerationWeeklyMetrics> {
    return Promise.resolve({
      reports: 0,
      eligibleReports: 0,
      recipeAutoHidden: 0,
      accountForcedPrivate: 0,
      nameRejected: 0,
      recipeTextRejected: 0,
      recipeFilterHidden: 0,
      undo: 0,
    });
  }
}

export const moderationService = new ModerationService();

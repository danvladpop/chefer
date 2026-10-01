import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  moderationRepository,
  prisma,
  socialProfileRepository,
  userReportRepository,
  type IModerationRepository,
  type ISocialProfileRepository,
  type IUserReportRepository,
  type ModerationAction,
  type SocialDbClient,
} from '@chefer/database';
import { MODERATION, type reportInputSchema } from '@chefer/types';
import { firstBlockedField } from '@chefer/utils';
import { profileNotAvailableError, textRejectedError } from '../../lib/friends-errors.js';
import { runSocialTx, type SocialTx } from './activity.service.js';
import { blockService, type BlockService } from './block.service.js';
import { socialAccessService, type SocialAccessService } from './social-access.service.js';
import { suggestionService, type SuggestionInvalidator } from './suggestion.service.js';

// ─── Following: automatic moderation (PRD §9, FR-13.4–13.8; plan §4.6) ────────
// No human review, no queue, no email: every action here is automatic,
// deterministic and logged (INV-10 — one ModerationLog row in the SAME
// transaction as the action it records).
//
//   reportAndBlock       one tap: the report + a block + both thresholds, in
//                        ONE SERIALIZABLE transaction (retried on P2034), so
//                        two reports filed at the same moment can neither
//                        both act nor both miss the threshold.
//   hideFilteredRecipes  turn-on / recipes-on: own shared recipes that trip
//                        the word filter are hidden (FILTER), not rejected.
//   checkRecipeText      the word filter on a recipe write (create, edit,
//                        import) — only for an author who shares recipes.
//   undo                 ops only (scripts/moderation-undo.ts).
//   weeklyMetrics        the worker's `moderation.weekly` line.
//
// Counting is by DISTINCT eligible reporter (the repository groups by
// reporter, skipping ineligible and discounted reports). Eligibility is fixed
// at report time: account ≥ 24 h old and email confirmed (MODERATION).
// Ineligible reports still block and are kept; they just never count.

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
  /** What the undo did (or, on a dry run, would do), for the script's output. */
  detail?: string;
}

export type ModerationReportRepository = Pick<
  IUserReportRepository,
  | 'create'
  | 'distinctEligibleReportersForRecipe'
  | 'distinctEligibleReportersForUser'
  | 'discountForRecipe'
  | 'discountForUser'
  | 'countSince'
  | 'reporterFacts'
  | 'hasSocialTie'
>;
export type ModerationLogRepository = Pick<
  IModerationRepository,
  | 'log'
  | 'find'
  | 'findUndoOf'
  | 'findRecipeForReport'
  | 'weeklyCounts'
  | 'hideRecipe'
  | 'unhideRecipe'
  | 'ownSharedRecipesForFilter'
>;
export type ModerationProfileRepository = Pick<
  ISocialProfileRepository,
  'find' | 'forcePrivate' | 'clearForcedPrivate'
>;
export type ModerationBlocks = Pick<BlockService, 'blockInTx' | 'invalidateCaches'>;
export type ModerationAccess = Pick<SocialAccessService, 'resolve'>;

const HOUR_MS = 60 * 60 * 1000;
const SERIALIZABLE_ATTEMPTS = 5;

/** The automatic actions an ops undo can reverse. */
const UNDOABLE: readonly ModerationAction[] = [
  'RECIPE_AUTO_HIDDEN',
  'ACCOUNT_FORCED_PRIVATE',
  'RECIPE_FILTER_HIDDEN',
];

function prismaCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
}

/**
 * One SERIALIZABLE transaction, retried on a serialization conflict (P2034,
 * the shopping-list toggle / `findOrCreateCopy` pattern). P2002 is retried
 * too: two taps of the same report race the Block upsert, and the retry finds
 * the winner's row.
 */
export const runSerializableTx: SocialTx = async (fn) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), { isolationLevel: 'Serializable' });
    } catch (err) {
      const code = prismaCode(err);
      if ((code !== 'P2034' && code !== 'P2002') || attempt >= SERIALIZABLE_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 25));
    }
  }
};

/** Whether a reporter's report counts toward the thresholds (PRD §9.3). */
export function isEligibleReporter(
  facts: { createdAt: Date; emailVerified: Date | null },
  now: Date,
): boolean {
  const oldEnough =
    now.getTime() - facts.createdAt.getTime() >=
    MODERATION.REPORTER_MIN_ACCOUNT_AGE_HOURS * HOUR_MS;
  // Widened on purpose: PRD §9.3 says flipping this constant is a one-line change.
  const requireVerified = MODERATION.REPORTER_REQUIRES_VERIFIED_EMAIL as boolean;
  const verified = !requireVerified || facts.emailVerified !== null;
  return oldEnough && verified;
}

const reportersReason = (n: number) => `${n} distinct eligible reporters`;

export class ModerationService {
  constructor(
    private readonly reports: ModerationReportRepository = userReportRepository,
    private readonly moderation: ModerationLogRepository = moderationRepository,
    private readonly profiles: ModerationProfileRepository = socialProfileRepository,
    private readonly access: ModerationAccess = socialAccessService,
    private readonly blocks: ModerationBlocks = blockService,
    private readonly suggestions: Pick<SuggestionInvalidator, 'invalidateAll'> = suggestionService,
    private readonly serializable: SocialTx = runSerializableTx,
    private readonly tx: SocialTx = runSocialTx,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Report and block in one transaction (plan §4.6): validates visibility
   * (NOT_FOUND otherwise, INV-3), files the report, blocks, applies the recipe
   * and account thresholds and logs each action. Always blocks. Nobody is
   * notified.
   */
  async reportAndBlock(reporterId: string, input: ReportInput): Promise<{ ok: true }> {
    const targetId = input.userId;
    if (targetId === reporterId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can’t report yourself.' });
    }

    // 1. The target must be header-visible to the reporter, or tied to them
    //    (a follow either way, or an Activity item from them). Anything else
    //    — blocked, not activated, unknown — is the one NOT_FOUND (INV-3).
    const { visible } = await this.access.resolve(reporterId, targetId);
    if (!visible && !(await this.reports.hasSocialTie(reporterId, targetId))) {
      throw profileNotAvailableError();
    }
    // A recipe report names one of the target's own shared recipes: MANUAL,
    // not a copy (a copy is never shown to anyone else, PRD §13).
    if (input.recipeId !== undefined) {
      const recipe = await this.moderation.findRecipeForReport(input.recipeId);
      if (
        recipe?.creatorId !== targetId ||
        recipe.source !== 'MANUAL' ||
        recipe.originRecipeId !== null
      ) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not available.' });
      }
    }

    // 2. Eligibility, fixed at report time.
    const facts = await this.reports.reporterFacts(reporterId);
    const eligible = facts !== null && isEligibleReporter(facts, this.now());

    // 3. One SERIALIZABLE transaction: report → block → thresholds.
    const forcedPrivate = await this.serializable(async (db) => {
      await this.reports.create(
        {
          reporterId,
          targetUserId: targetId,
          recipeId: input.recipeId ?? null,
          reason: input.reason,
          eligible,
        },
        db,
      );
      await this.blocks.blockInTx(db, reporterId, targetId);
      // Evaluated on every report (an ineligible one adds nothing to the
      // counts, so it can't tip one over) and acting at most once:
      // hideRecipe / forcePrivate are conditional writes.
      if (input.recipeId !== undefined) {
        await this.applyRecipeThreshold(targetId, input.recipeId, db);
      }
      return this.applyAccountThreshold(targetId, db, reportersReason);
    });

    // After the commit too, so a suggestion recompute that raced the
    // transaction can't keep a stale row.
    this.blocks.invalidateCaches(reporterId, targetId);
    if (forcedPrivate) this.suggestions.invalidateAll();
    return { ok: true };
  }

  /**
   * Hides the user's own shared recipes whose name or description trips the
   * word filter (FILTER reason, one RECIPE_FILTER_HIDDEN row each). Run after
   * turn-on and when recipe sharing goes on. Returns how many it hid.
   *
   * Also re-applies a forced-private restriction the user already earned
   * (PRD FD-14: "leaving and rejoining can't reset moderation"): turning
   * Following off deletes the SocialProfile and with it `forcedPrivateAt`, but
   * the reports are kept, so at turn-on the account threshold is evaluated
   * again. A no-op below the threshold or when already forced.
   */
  async hideFilteredRecipes(userId: string): Promise<number> {
    const rows = await this.moderation.ownSharedRecipesForFilter(userId);
    let hidden = 0;
    for (const row of rows) {
      const field = firstBlockedField(row);
      if (!field) continue;
      const did = await this.tx(async (db) => {
        if (!(await this.moderation.hideRecipe(row.id, 'FILTER', db))) return false;
        await this.moderation.log(
          {
            action: 'RECIPE_FILTER_HIDDEN',
            targetUserId: userId,
            recipeId: row.id,
            reason: `blocked term in recipe ${field}`, // never the text itself
            actor: 'system',
          },
          db,
        );
        return true;
      });
      if (did) hidden++;
    }

    const forced = await this.tx((db) =>
      this.applyAccountThreshold(
        userId,
        db,
        (n) => `${reportersReason(n)} (re-applied at turn-on)`,
      ),
    );
    if (forced) this.suggestions.invalidateAll();
    return hidden;
  }

  /**
   * The word filter on a recipe write, applied only when the author has a
   * SocialProfile with `shareRecipes`: a blocked term logs RECIPE_TEXT_REJECTED
   * and throws BAD_REQUEST + `data.textRejected: 'recipe'`
   * (`textRejectedError('recipe')`). With `recipeId` (an edit), clean text
   * un-hides a FILTER-hidden recipe — never a REPORTS-hidden one.
   */
  async checkRecipeText(userId: string, text: RecipeTextInput, recipeId?: string): Promise<void> {
    const field = firstBlockedField(text);
    if (field) {
      // Only now is the profile read: clean writes (nearly all) cost nothing.
      const profile = await this.profiles.find(userId);
      if (!profile?.shareRecipes) return; // not shared → not filtered (INV-8)
      await this.moderation.log({
        action: 'RECIPE_TEXT_REJECTED',
        targetUserId: userId,
        recipeId: recipeId ?? null,
        reason: `blocked term in recipe ${field}`, // never the text itself
        actor: 'system',
      });
      throw textRejectedError('recipe');
    }
    if (recipeId === undefined) return;

    // A clean edit lifts a FILTER hide whether or not recipes are shared right
    // now (hideFilteredRecipes only re-checks visible recipes, so a cleaned
    // recipe would otherwise stay hidden for good). REPORTS hides stay.
    await this.tx(async (db) => {
      if (!(await this.moderation.unhideRecipe(recipeId, 'FILTER', db))) return;
      // Reports filed while it was FILTER-hidden couldn't hide it then (it
      // was already hidden); at the threshold it goes straight back, under
      // REPORTS, with its own log row.
      await this.applyRecipeThreshold(userId, recipeId, db);
    });
  }

  /** Ops undo of one automatic action (scripts/moderation-undo.ts). Writes an UNDO row. */
  async undo(logId: string, opts: { dryRun?: boolean } = {}): Promise<ModerationUndoResult> {
    const dryRun = opts.dryRun === true;
    const row = await this.moderation.find(logId);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No moderation log row ${logId}.` });
    }
    if (!UNDOABLE.includes(row.action)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${row.action} has nothing to undo (only ${UNDOABLE.join(', ')}).`,
      });
    }
    const recipeId = row.recipeId ?? '';
    if (row.action !== 'ACCOUNT_FORCED_PRIVATE' && recipeId === '') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `${row.action} row has no recipe.` });
    }
    const already = await this.moderation.findUndoOf(logId);
    if (already) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Already undone by ${already.id} at ${already.createdAt.toISOString()}.`,
      });
    }

    if (dryRun) {
      const would =
        row.action === 'RECIPE_AUTO_HIDDEN'
          ? `un-hide recipe ${recipeId} (REPORTS) and discount its reports`
          : row.action === 'ACCOUNT_FORCED_PRIVATE'
            ? `clear forced private on ${row.targetUserId} (visibility stays PRIVATE) and discount every report about them`
            : `un-hide recipe ${recipeId} (FILTER)`;
      return { logId, action: row.action, undoLogId: null, dryRun, detail: `would ${would}` };
    }

    const done = await this.tx(async (db) => {
      let detail: string;
      if (row.action === 'ACCOUNT_FORCED_PRIVATE') {
        const cleared = await this.profiles.clearForcedPrivate(row.targetUserId, db);
        const discounted = await this.reports.discountForUser(row.targetUserId, db);
        detail = `forced private ${cleared ? 'cleared' : 'was not set'}; ${discounted} reports discounted`;
      } else if (row.action === 'RECIPE_AUTO_HIDDEN') {
        const unhid = await this.moderation.unhideRecipe(recipeId, 'REPORTS', db);
        const discounted = await this.reports.discountForRecipe(recipeId, db);
        detail = `recipe ${unhid ? 'un-hidden' : 'was not REPORTS-hidden'}; ${discounted} reports discounted`;
      } else {
        const unhid = await this.moderation.unhideRecipe(recipeId, 'FILTER', db);
        detail = `recipe ${unhid ? 'un-hidden' : 'was not FILTER-hidden'}`;
      }
      const undoRow = await this.moderation.log(
        {
          action: 'UNDO',
          targetUserId: row.targetUserId,
          recipeId: row.recipeId,
          reason: `ops undo of ${row.action}: ${detail}`,
          actor: 'ops',
          undoOfId: row.id,
        },
        db,
      );
      return { undoLogId: undoRow.id, detail };
    });
    if (row.action === 'ACCOUNT_FORCED_PRIVATE') this.suggestions.invalidateAll();
    return { logId, action: row.action, undoLogId: done.undoLogId, dryRun, detail: done.detail };
  }

  /** Counts since `since` for the weekly metrics line (friends-maintenance.worker.ts). */
  async weeklyMetrics(since: Date): Promise<ModerationWeeklyMetrics> {
    const [reports, counts] = await Promise.all([
      this.reports.countSince(since),
      this.moderation.weeklyCounts(since),
    ]);
    return {
      reports: reports.reports,
      eligibleReports: reports.eligibleReports,
      recipeAutoHidden: counts.RECIPE_AUTO_HIDDEN,
      accountForcedPrivate: counts.ACCOUNT_FORCED_PRIVATE,
      nameRejected: counts.NAME_REJECTED,
      recipeTextRejected: counts.RECIPE_TEXT_REJECTED,
      recipeFilterHidden: counts.RECIPE_FILTER_HIDDEN,
      undo: counts.UNDO,
    };
  }

  // ─── Thresholds (inside the caller's transaction) ───────────────────────────

  /** RECIPE_HIDE_REPORTERS distinct eligible reporters → hidden (REPORTS) + logged. */
  private async applyRecipeThreshold(
    creatorId: string,
    recipeId: string,
    db: SocialDbClient,
  ): Promise<boolean> {
    const n = await this.reports.distinctEligibleReportersForRecipe(recipeId, db);
    if (n < MODERATION.RECIPE_HIDE_REPORTERS) return false;
    if (!(await this.moderation.hideRecipe(recipeId, 'REPORTS', db))) return false;
    await this.moderation.log(
      {
        action: 'RECIPE_AUTO_HIDDEN',
        targetUserId: creatorId,
        recipeId,
        reason: reportersReason(n),
        distinctReporters: n,
        actor: 'system',
      },
      db,
    );
    return true;
  }

  /** ACCOUNT_RESTRICT_REPORTERS distinct eligible reporters → forced private + logged. */
  private async applyAccountThreshold(
    userId: string,
    db: SocialDbClient,
    reason: (n: number) => string,
  ): Promise<boolean> {
    const n = await this.reports.distinctEligibleReportersForUser(userId, db);
    if (n < MODERATION.ACCOUNT_RESTRICT_REPORTERS) return false;
    // false when there's no profile (Following is off) or it's already forced.
    if (!(await this.profiles.forcePrivate(userId, db))) return false;
    await this.moderation.log(
      {
        action: 'ACCOUNT_FORCED_PRIVATE',
        targetUserId: userId,
        reason: reason(n),
        distinctReporters: n,
        actor: 'system',
      },
      db,
    );
    return true;
  }
}

export const moderationService = new ModerationService();

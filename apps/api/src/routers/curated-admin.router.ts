import { z } from 'zod';
import {
  CURATED_DRAFT_STATUSES,
  CURATED_MEAL_TYPES,
  curatedDraftRecipeSchema,
} from '@chefer/types';
import { curatedIngestService } from '../application/curated-ingest/curated-ingest.instance.js';
import { buildCoverageReport } from '../lib/curated-recipes/coverage.js';
import {
  curatedPoolByType,
  ensureCuratedRecipes,
  ingestedCuratedPools,
} from '../lib/curated-recipes/index.js';
import { adminProcedure, router } from '../lib/trpc.js';

// ─── Curated recipe ingest + pool coverage (market review F1/F2) ─────────────
// Admin-only, end to end: every procedure is `adminProcedure` (FORBIDDEN for
// anyone else). Thin wrappers — the gates live in CuratedIngestService. Web
// admin only; no shipped mobile binary calls this namespace.

const draftId = z.object({ id: z.string().min(1).max(40) });
const mealTypes = z.array(z.enum(CURATED_MEAL_TYPES)).max(4);
const edit = {
  draft: curatedDraftRecipeSchema.optional(),
  mealTypes: mealTypes.optional(),
};

export const curatedAdminRouter = router({
  /** Paste a recipe-video or web link → a draft, extracted in the background. */
  ingest: adminProcedure
    .input(z.object({ url: z.string().trim().url().max(2048) }))
    .mutation(({ ctx, input }) => curatedIngestService.ingest(ctx.user.id, input.url)),

  /** Today's extractor use against CURATED_INGEST_DAILY_CAP. */
  budget: adminProcedure.query(() => curatedIngestService.budget()),

  /** The review queue, newest submission first. */
  list: adminProcedure
    .input(z.object({ statuses: z.array(z.enum(CURATED_DRAFT_STATUSES)).max(6).default([]) }))
    .query(async ({ input }) => {
      const [drafts, counts] = await Promise.all([
        curatedIngestService.list(input.statuses),
        curatedIngestService.counts(),
      ]);
      return { drafts, counts };
    }),

  /** One draft with its live review (catalog matches, nutrition, safety, blockers). */
  get: adminProcedure.input(draftId).query(({ input }) => curatedIngestService.get(input.id)),

  update: adminProcedure
    .input(draftId.extend(edit))
    .mutation(({ input }) =>
      curatedIngestService.update(input.id, { draft: input.draft, mealTypes: input.mealTypes }),
    ),

  rewriteProse: adminProcedure
    .input(draftId)
    .mutation(({ input }) => curatedIngestService.rewriteProse(input.id)),

  retry: adminProcedure
    .input(draftId)
    .mutation(({ input }) => curatedIngestService.retry(input.id)),

  /** Saves the edits sent along, then publishes the draft into the free pool. */
  approve: adminProcedure.input(draftId.extend(edit)).mutation(({ ctx, input }) =>
    curatedIngestService.approve(ctx.user.id, input.id, {
      draft: input.draft,
      mealTypes: input.mealTypes,
    }),
  ),

  reject: adminProcedure
    .input(draftId.extend({ reason: z.string().trim().max(300).optional() }))
    .mutation(({ ctx, input }) => curatedIngestService.reject(ctx.user.id, input.id, input.reason)),

  unpublish: adminProcedure
    .input(draftId)
    .mutation(({ ctx, input }) => curatedIngestService.unpublish(ctx.user.id, input.id)),

  /** F2: the free pool's coverage by meal type, diet, allergen, prep time, cuisine and profile. */
  coverage: adminProcedure.query(async () => {
    await ensureCuratedRecipes();
    const ingested = new Set(
      Object.values(ingestedCuratedPools())
        .flat()
        .map((r) => r.id),
    );
    return buildCoverageReport(curatedPoolByType(), ingested);
  }),
});

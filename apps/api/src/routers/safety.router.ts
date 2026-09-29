import { z } from 'zod';
import { safetyService } from '../application/safety/safety.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Safety router (§2.1, T-01.2/T-01.5) ───────────────────────────────────────
// `getTable` backs every "who's at the table / what do we check" surface
// (household editor summary, WhatWeCheckSheet — T-02.2/2.3). `report` is
// UX-01 (d) — hides a recipe for the reporting user only, right away.

export const safetyRouter = router({
  /** This user's reported recipes (UX-01 d) — a read-only passthrough. */
  myReports: protectedProcedure.query(({ ctx }) => safetyService.listMyReports(ctx.user.id)),

  /** The read-back table: who's at the table, what's checked, legacy-review state. */
  getTable: protectedProcedure.query(({ ctx }) => safetyService.getTable(ctx.user.id)),

  /** T-01.5: reports a recipe as unsafe/wrong — hides it for this user at once. */
  report: protectedProcedure
    .input(
      z.object({
        recipeId: z.string().min(1),
        surface: z.string().min(1).max(60),
        reason: z.string().min(1).max(200),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) => safetyService.report(ctx.user.id, input)),

  /** T-01.3: marks the legacy free-text safety review as confirmed. */
  confirmReview: protectedProcedure.mutation(({ ctx }) => safetyService.confirmReview(ctx.user.id)),
});

import {
  finishCookInputSchema,
  pauseFlameInputSchema,
  progressAckInputSchema,
  progressMarkSeenInputSchema,
  progressSettingsPatchSchema,
  progressSummaryInputSchema,
  receiptForInputSchema,
  resumeFlameInputSchema,
  setActiveDayGoalInputSchema,
  weeklyRecapInputSchema,
} from '@chefer/types';
import { progressService } from '../application/progress/progress.service.js';
import { isProgressEnabledFor, progressProcedure } from '../lib/progress-flags.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Kitchen progress (docs/gamification-2026-10/tech-plan.md §4.3) ───────────
// Additive only: shipped binaries never call these. `availability` and
// `finishCook` answer while the flag is off (finishCook records the cook for
// everyone, D1); everything else is gated by `progressProcedure`.

export const progressRouter = router({
  availability: protectedProcedure.query(({ ctx }) => ({
    enabled: isProgressEnabledFor(ctx.user),
  })),

  summary: progressProcedure
    .input(progressSummaryInputSchema)
    .query(({ ctx, input }) => progressService.summary(ctx.user, input.localDate)),

  inbox: progressProcedure.query(({ ctx }) => progressService.inbox(ctx.user.id)),

  ack: progressProcedure
    .input(progressAckInputSchema)
    .mutation(({ ctx, input }) => progressService.ack(ctx.user.id, input)),

  receiptFor: progressProcedure
    .input(receiptForInputSchema)
    .query(({ ctx, input }) => progressService.receiptFor(ctx.user.id, input.kind, input.sourceId)),

  finishCook: protectedProcedure
    .input(finishCookInputSchema)
    .mutation(({ ctx, input }) => progressService.finishCook(ctx.user, input)),

  achievements: progressProcedure.query(({ ctx }) => progressService.achievements(ctx.user.id)),

  weeklyRecap: progressProcedure
    .input(weeklyRecapInputSchema)
    .query(({ ctx, input }) => progressService.weeklyRecap(ctx.user.id, input.weekStart)),

  updateSettings: progressProcedure
    .input(progressSettingsPatchSchema)
    .mutation(({ ctx, input }) => progressService.updateSettings(ctx.user.id, input)),

  setActiveDayGoal: progressProcedure
    .input(setActiveDayGoalInputSchema)
    .mutation(({ ctx, input }) =>
      progressService.setActiveDayGoal(ctx.user.id, input.goal, input.localDate),
    ),

  pauseFlame: progressProcedure
    .input(pauseFlameInputSchema)
    .mutation(({ ctx, input }) =>
      progressService.pauseFlame(ctx.user.id, input.startDate, input.weeks),
    ),

  resumeFlame: progressProcedure
    .input(resumeFlameInputSchema)
    .mutation(({ ctx, input }) => progressService.resumeFlame(ctx.user.id, input.localDate)),

  markSeen: progressProcedure
    .input(progressMarkSeenInputSchema)
    .mutation(({ ctx, input }) => progressService.markSeen(ctx.user.id, input)),
});

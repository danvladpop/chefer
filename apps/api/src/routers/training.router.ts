import { z } from 'zod';
import { dayKindSchema } from '@chefer/types';
import { trainingDaysService } from '../application/training-days/training-days.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Training router (§2.6, T-06.9) ─────────────────────────────────────────────
// `getDayKinds`/`setDayKinds` back the gym settings "Training days &
// reminders" kind row and onboarding (T-03.9) — the same two procedures for
// both, so they can never disagree. `lift` is never settable here: it's
// derived from the active routine's `plannedWeekday`s (read-only in the UI).

const settableDayKindSchema = dayKindSchema.exclude(['lift']);

export const setDayKindsInputSchema = z.object({
  /** Weekday ("0"-"6", 0 = Monday) → kind, or `null` to clear back to unset. */
  days: z.record(z.string().regex(/^[0-6]$/), settableDayKindSchema.nullable()),
});

export const trainingRouter = router({
  /** This user's stored weekday kinds (`{}` until set) — never includes `lift`. */
  getDayKinds: protectedProcedure.query(({ ctx }) => trainingDaysService.getDayKinds(ctx.user.id)),
  setDayKinds: protectedProcedure
    .input(setDayKindsInputSchema)
    .mutation(({ ctx, input }) => trainingDaysService.setDayKinds(ctx.user.id, input.days)),
});

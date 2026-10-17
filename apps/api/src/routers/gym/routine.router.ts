import { z } from 'zod';
import { saveMyWeekInputSchema, saveRoutineInputSchema } from '@chefer/types';
import { myWeekService } from '../../application/gym/my-week.service.js';
import { routineService } from '../../application/gym/routine.service.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

const idInput = z.object({ id: z.string().min(1).max(100) });

export const gymRoutineRouter = router({
  list: protectedProcedure.query(({ ctx }) => routineService.list(ctx.user.id)),
  get: protectedProcedure
    .input(idInput)
    .query(({ ctx, input }) => routineService.get(ctx.user.id, input.id)),
  templates: protectedProcedure.query(() => routineService.templates()),
  createFromTemplate: protectedProcedure
    .input(
      z.object({ templateKey: z.string().min(1).max(40), setActive: z.boolean().default(false) }),
    )
    .mutation(({ ctx, input }) =>
      routineService.createFromTemplate(ctx.user.id, input.templateKey, input.setActive),
    ),
  createBlank: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(60), days: z.number().int().min(1).max(7) }))
    .mutation(({ ctx, input }) => routineService.createBlank(ctx.user.id, input.name, input.days)),
  duplicate: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => routineService.duplicate(ctx.user.id, input.id)),
  archive: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => routineService.archive(ctx.user.id, input.id)),
  /** UX-GYM-34: undo `archive` (the routine comes back inactive). */
  restore: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => routineService.restore(ctx.user.id, input.id)),
  setActive: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) => routineService.setActive(ctx.user.id, input.id)),
  /**
   * Full-document replace. A stale expectedVersion throws CONFLICT with
   * `error.data.conflict = { kind: 'routine', current: RoutineDto }` (lib/conflict.ts).
   */
  save: protectedProcedure
    .input(saveRoutineInputSchema)
    .mutation(({ ctx, input }) =>
      routineService.save(ctx.user.id, input.routine, input.expectedVersion),
    ),
  /** Week-level edit: "do another day instead" / "skip this day". */
  setNextDay: protectedProcedure
    .input(z.object({ routineId: z.string().min(1).max(100), dayId: z.string().min(1).max(100) }))
    .mutation(({ ctx, input }) =>
      routineService.setNextDay(ctx.user.id, input.routineId, input.dayId),
    ),
  /**
   * Simple training mode: save My week — seven rows (a workout type or Rest)
   * applied to the ONE active routine (ADR 0001), created on first save. A
   * stale `expectedVersion` throws CONFLICT like `save`.
   */
  saveMyWeek: protectedProcedure
    .input(saveMyWeekInputSchema)
    .mutation(({ ctx, input }) => myWeekService.save(ctx.user.id, input)),
});

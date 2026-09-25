import { z } from 'zod';
import { saveRoutineInputSchema } from '@chefer/types';
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
});

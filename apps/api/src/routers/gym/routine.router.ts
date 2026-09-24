import { z } from 'zod';
import {
  saveRoutineInputSchema,
  type RoutineDto,
  type RoutineListItemDto,
  type TemplateSummaryDto,
} from '@chefer/types';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { notImplemented } from './_stub.js';

const idInput = z.object({ id: z.string().min(1).max(100) });

export const gymRoutineRouter = router({
  list: protectedProcedure.query(() => notImplemented<RoutineListItemDto[]>('routine.list')),
  get: protectedProcedure.input(idInput).query(() => notImplemented<RoutineDto>('routine.get')),
  templates: protectedProcedure.query(() =>
    notImplemented<TemplateSummaryDto[]>('routine.templates'),
  ),
  createFromTemplate: protectedProcedure
    .input(
      z.object({ templateKey: z.string().min(1).max(40), setActive: z.boolean().default(false) }),
    )
    .mutation(() => notImplemented<RoutineDto>('routine.createFromTemplate')),
  createBlank: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(60), days: z.number().int().min(1).max(7) }))
    .mutation(() => notImplemented<RoutineDto>('routine.createBlank')),
  duplicate: protectedProcedure
    .input(idInput)
    .mutation(() => notImplemented<RoutineDto>('routine.duplicate')),
  archive: protectedProcedure
    .input(idInput)
    .mutation(() => notImplemented<{ ok: true }>('routine.archive')),
  setActive: protectedProcedure
    .input(idInput)
    .mutation(() => notImplemented<RoutineDto>('routine.setActive')),
  /** Full-document replace; CONFLICT (with the current doc in `cause`) when expectedVersion is stale. */
  save: protectedProcedure
    .input(saveRoutineInputSchema)
    .mutation(() => notImplemented<RoutineDto>('routine.save')),
  /** Week-level edit: "do another day instead" / "skip this day". */
  setNextDay: protectedProcedure
    .input(z.object({ routineId: z.string().min(1).max(100), dayId: z.string().min(1).max(100) }))
    .mutation(() => notImplemented<RoutineDto>('routine.setNextDay')),
});

import { z } from 'zod';
import {
  clientIdSchema,
  upsertSessionsInputSchema,
  type SessionSummaryDto,
  type UpsertSessionsResultDto,
  type WorkoutSessionDoc,
} from '@chefer/types';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { notImplemented } from './_stub.js';

export const gymSessionRouter = router({
  /** Idempotent offline sync (gym_plan.md §4.1). Safe to retry. */
  upsertMany: protectedProcedure
    .input(upsertSessionsInputSchema)
    .mutation(() => notImplemented<UpsertSessionsResultDto>('session.upsertMany')),
  get: protectedProcedure
    .input(z.object({ id: clientIdSchema }))
    .query(() => notImplemented<WorkoutSessionDoc>('session.get')),
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(() =>
      notImplemented<{ items: SessionSummaryDto[]; nextCursor: string | null }>('session.list'),
    ),
  discard: protectedProcedure
    .input(z.object({ id: clientIdSchema }))
    .mutation(() => notImplemented<{ ok: true }>('session.discard')),
  /** Deletes a completed session and recomputes affected progressions. */
  delete: protectedProcedure
    .input(z.object({ id: clientIdSchema }))
    .mutation(() => notImplemented<{ ok: true }>('session.delete')),
});

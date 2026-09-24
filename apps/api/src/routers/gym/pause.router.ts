import { z } from 'zod';
import { pauseInputSchema } from '@chefer/types';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { notImplemented } from './_stub.js';

export const gymPauseRouter = router({
  create: protectedProcedure
    .input(pauseInputSchema)
    .mutation(() => notImplemented<{ id: string }>('pause.create')),
  /** Ends an active pause early (endDate = today). */
  end: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .mutation(() => notImplemented<{ ok: true }>('pause.end')),
});

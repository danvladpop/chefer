// gym.* tRPC namespace (gym_plan.md §4.2). Thin routers only — every handler
// calls a service in application/gym/. All procedures are protectedProcedure:
// PLAN_FEATURES.gymTraining is free on every tier (D9).
import { z } from 'zod';
import { localDateSchema } from '@chefer/types';
import { gymBootstrapService } from '../../application/gym/gym-bootstrap.service.js';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { gymExportRouter } from './export.router.js';
import { gymLibraryRouter } from './library.router.js';
import { gymPauseRouter } from './pause.router.js';
import { gymProfileRouter } from './profile.router.js';
import { gymProgressionRouter } from './progression.router.js';
import { gymRoutineRouter } from './routine.router.js';
import { gymSessionRouter } from './session.router.js';
import { gymStatsRouter } from './stats.router.js';

export const gymRouter = router({
  /** The offline read model the phone persists (gym_plan.md §4.1). */
  bootstrap: protectedProcedure
    .input(
      z
        .object({
          librarySince: z.string().datetime({ offset: true }).optional(),
          /** Device-local date, so "today" and week boundaries match the phone. */
          today: localDateSchema.optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      gymBootstrapService.get(ctx.user.id, {
        librarySince: input?.librarySince,
        today: input?.today,
      }),
    ),
  library: gymLibraryRouter,
  profile: gymProfileRouter,
  routine: gymRoutineRouter,
  session: gymSessionRouter,
  progression: gymProgressionRouter,
  stats: gymStatsRouter,
  pause: gymPauseRouter,
  export: gymExportRouter,
});

import {
  clearNextTargetInputSchema,
  clientExerciseHistoryInputSchema,
  clientIdInputSchema,
  clientOverviewInputSchema,
  clientWorkoutsInputSchema,
  createClientRoutineInputSchema,
  localDateSchema,
  saveNoteInputSchema,
  saveTrainerRoutineInputSchema,
  setNextTargetInputSchema,
} from '@chefer/types';
import { coachingContentService } from '../../application/coaching/coaching-content.service.js';
import { coachingNoteService } from '../../application/coaching/coaching-note.service.js';
import { trainerRoutineService } from '../../application/coaching/trainer-routine.service.js';
import { effectiveLevel } from '../../application/gym/client-level.js';
import { requireCoachingAccess, trainerProcedure } from '../../lib/coaching-middleware.js';
import { router } from '../../lib/trpc.js';

// ─── trainer.client.* — one client (spec §7.2) ────────────────────────────────
// Every procedure is trainerProcedure + requireCoachingAccess(scope): an ACTIVE
// link to `input.clientId`, else the one uniform NOT_FOUND. The access is on
// `ctx.coachingAccess`. Handlers only delegate.

const readProcedure = trainerProcedure.use(requireCoachingAccess('read'));
const writeProcedure = trainerProcedure.use(requireCoachingAccess('write'));
const noteProcedure = trainerProcedure.use(requireCoachingAccess('note'));

/** `trainer.client.routine` also takes an optional device-local `today` (the next-time suggestions are computed for it). */
const routineInputSchema = clientIdInputSchema.extend({ today: localDateSchema.optional() });

export const trainerClientRouter = router({
  overview: readProcedure
    .input(clientOverviewInputSchema)
    .query(({ ctx, input }) =>
      coachingContentService.overview(
        ctx.coachingAccess,
        input.today,
        effectiveLevel(ctx.clientApiLevel),
      ),
    ),
  workouts: readProcedure
    .input(clientWorkoutsInputSchema)
    .query(({ ctx, input }) =>
      coachingContentService.workouts(
        ctx.coachingAccess,
        { cursor: input.cursor, limit: input.limit },
        effectiveLevel(ctx.clientApiLevel),
      ),
    ),
  exerciseHistory: readProcedure
    .input(clientExerciseHistoryInputSchema)
    .query(({ ctx, input }) =>
      coachingContentService.exerciseHistory(
        ctx.coachingAccess,
        input.exerciseId,
        effectiveLevel(ctx.clientApiLevel),
      ),
    ),
  routine: readProcedure
    .input(routineInputSchema)
    .query(({ ctx, input }) => coachingContentService.routine(ctx.coachingAccess, input.today)),
  saveRoutine: writeProcedure
    .input(saveTrainerRoutineInputSchema)
    .mutation(({ ctx, input }) => trainerRoutineService.saveRoutine(ctx.coachingAccess, input)),
  createRoutine: writeProcedure
    .input(createClientRoutineInputSchema)
    .mutation(({ ctx, input }) => trainerRoutineService.createRoutine(ctx.coachingAccess, input)),
  setNextTarget: writeProcedure
    .input(setNextTargetInputSchema)
    .mutation(({ ctx, input }) => trainerRoutineService.setNextTarget(ctx.coachingAccess, input)),
  clearNextTarget: writeProcedure
    .input(clearNextTargetInputSchema)
    .mutation(({ ctx, input }) => trainerRoutineService.clearNextTarget(ctx.coachingAccess, input)),
  note: noteProcedure
    .input(clientIdInputSchema)
    .query(({ ctx }) => coachingNoteService.get(ctx.coachingAccess)),
  saveNote: noteProcedure
    .input(saveNoteInputSchema)
    .mutation(({ ctx, input }) => coachingNoteService.save(ctx.coachingAccess, input.body)),
});

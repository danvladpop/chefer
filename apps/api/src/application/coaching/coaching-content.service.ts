import type {
  ClientOverviewDto,
  CoachedWorkoutsPageDto,
  ExerciseHistoryDto,
  TrainerRoutineDto,
} from '@chefer/types';
import { notImplementedError } from '../../lib/coaching-errors.js';
import type { CoachingAccess } from './coaching-access.service.js';

// ─── Trainer coaching: reading a client's data (spec §7.2, §8.1) ──────────────
// Authorization already happened: every caller arrives through
// `requireCoachingAccess(scope)` and passes the resolved access in. Responses
// are built only by coaching-dto.mappers.ts. READ-ONLY.
// A1 (contract commit): final signatures, bodies land in A2.

export class CoachingContentService {
  /** `trainer.client.overview` */
  overview(_access: CoachingAccess, _today: string, _level: number): Promise<ClientOverviewDto> {
    return Promise.reject(notImplementedError('trainer.client.overview'));
  }

  /** `trainer.client.workouts` */
  workouts(
    _access: CoachingAccess,
    _page: { cursor: string | undefined; limit: number },
    _level: number,
  ): Promise<CoachedWorkoutsPageDto> {
    return Promise.reject(notImplementedError('trainer.client.workouts'));
  }

  /** `trainer.client.exerciseHistory` */
  exerciseHistory(
    _access: CoachingAccess,
    _exerciseId: string,
    _level: number,
  ): Promise<ExerciseHistoryDto> {
    return Promise.reject(notImplementedError('trainer.client.exerciseHistory'));
  }

  /** `trainer.client.routine`: the client's active routine, or null. */
  routine(_access: CoachingAccess, _today: string | undefined): Promise<TrainerRoutineDto | null> {
    return Promise.reject(notImplementedError('trainer.client.routine'));
  }
}

export const coachingContentService = new CoachingContentService();

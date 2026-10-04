import type { z } from 'zod';
import type {
  clearNextTargetInputSchema,
  createClientRoutineInputSchema,
  NextTargetDto,
  saveTrainerRoutineInputSchema,
  setNextTargetInputSchema,
  TrainerRoutineDto,
} from '@chefer/types';
import { notImplementedError } from '../../lib/coaching-errors.js';
import type { CoachingAccess } from './coaching-access.service.js';

// ─── Trainer coaching: the trainer's writes (spec §5.3, §6, §7.2) ─────────────
// The only two write paths into a client's data: the routine document and
// next-session targets. Both call the existing RoutineService / ProgressionService
// with an actor. A1 (contract commit): final signatures, bodies land in A2.

export type SaveTrainerRoutineInput = z.infer<typeof saveTrainerRoutineInputSchema>;
export type CreateClientRoutineInput = z.infer<typeof createClientRoutineInputSchema>;
export type SetNextTargetInput = z.infer<typeof setNextTargetInputSchema>;
export type ClearNextTargetInput = z.infer<typeof clearNextTargetInputSchema>;

export class TrainerRoutineService {
  /** `trainer.client.saveRoutine`: version-checked; CONFLICT `{ kind: 'routine', current }` like gym.routine.save. */
  saveRoutine(
    _access: CoachingAccess,
    _input: SaveTrainerRoutineInput,
  ): Promise<TrainerRoutineDto> {
    return Promise.reject(notImplementedError('trainer.client.saveRoutine'));
  }

  /** `trainer.client.createRoutine`: only when the client has no active routine. */
  createRoutine(
    _access: CoachingAccess,
    _input: CreateClientRoutineInput,
  ): Promise<TrainerRoutineDto> {
    return Promise.reject(notImplementedError('trainer.client.createRoutine'));
  }

  /** `trainer.client.setNextTarget`: the D5c override with `setById` = the trainer. */
  setNextTarget(_access: CoachingAccess, _input: SetNextTargetInput): Promise<NextTargetDto> {
    return Promise.reject(notImplementedError('trainer.client.setNextTarget'));
  }

  /** `trainer.client.clearNextTarget` */
  clearNextTarget(_access: CoachingAccess, _input: ClearNextTargetInput): Promise<NextTargetDto> {
    return Promise.reject(notImplementedError('trainer.client.clearNextTarget'));
  }
}

export const trainerRoutineService = new TrainerRoutineService();

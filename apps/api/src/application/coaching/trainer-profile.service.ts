import type { CoachingSource, TrainerProfileInput, TrainerStatusDto } from '@chefer/types';
import { notImplementedError } from '../../lib/coaching-errors.js';
import type { CoachingTrainer } from './coaching-access.service.js';

// ─── Trainer coaching: trainer profile (spec §2.1, §7.2) ──────────────────────
// A1 (contract commit): final signatures, bodies land in A2.

export class TrainerProfileService {
  /** `trainer.status`: may this user turn trainer tools on, are they on, and under which name. */
  status(_user: CoachingTrainer): Promise<TrainerStatusDto> {
    return Promise.reject(notImplementedError('trainer.status'));
  }

  /** `trainer.activate`: requires TRAINER_ALLOWLIST during the beta; word-filters the name. */
  activate(
    _user: CoachingTrainer,
    _input: TrainerProfileInput,
    _source: CoachingSource,
  ): Promise<TrainerStatusDto> {
    return Promise.reject(notImplementedError('trainer.activate'));
  }

  /** `trainer.updateProfile` */
  updateProfile(_user: CoachingTrainer, _input: TrainerProfileInput): Promise<TrainerStatusDto> {
    return Promise.reject(notImplementedError('trainer.updateProfile'));
  }

  /** `trainer.deactivate`: ends every link (SYSTEM), revokes invites, hides notes. */
  deactivate(_userId: string, _source: CoachingSource): Promise<{ ok: true }> {
    return Promise.reject(notImplementedError('trainer.deactivate'));
  }
}

export const trainerProfileService = new TrainerProfileService();

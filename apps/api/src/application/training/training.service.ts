import { chefProfileRepository } from '@chefer/database';
import type { TrainingDayKinds } from '@chefer/types';

// ─── Training service (§2.6, T-00.10 stub) ─────────────────────────────────────
// STUB — wave 0 only wires the layers. `training.setDayKinds` and the
// kind-led bump math (§2.6, T-06.1) are wave 1; this class stays a thin
// passthrough until then.

export class TrainingService {
  /** This user's stored weekday kinds (`{}` until set) — a passthrough read. */
  async getDayKinds(userId: string): Promise<TrainingDayKinds> {
    const profile = await chefProfileRepository.findByUserId(userId);
    return (profile?.trainingDayKinds as TrainingDayKinds | undefined) ?? {};
  }
}

export const trainingService = new TrainingService();

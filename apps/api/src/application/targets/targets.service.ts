import { targetChangeRepository, type TargetChange } from '@chefer/database';

// ─── Targets service (§2.11, T-00.10 stub) ─────────────────────────────────────
// STUB — wave 0 only wires the layers. `resolveDailyTargets`, own-target
// overrides and the "never change silently" change-detection (§2.11) are
// wave 1 (T-35.1, T-11.1); this class stays a thin passthrough until then.

export class TargetsService {
  /** This user's unresolved target changes, newest first — a passthrough read. */
  async listMyUnresolvedChanges(userId: string): Promise<TargetChange[]> {
    return targetChangeRepository.findUnresolvedByUser(userId);
  }
}

export const targetsService = new TargetsService();

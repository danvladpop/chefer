import {
  trainerProfileRepository,
  type ITrainerProfileRepository,
  type RoutineWithDays,
} from '@chefer/database';
import { COACHING_API_LEVEL } from '@chefer/types';
import { otherEditorIds, type RoutineAttribution } from '../gym/mappers.js';

// ─── Trainer coaching: who changed it (spec §5.3, §10) ────────────────────────
// Resolves the display names behind a routine's edit stamps and a next-session
// target's `setById`, for CLIENTS at level >= COACHING_API_LEVEL. Below that
// level nothing is resolved (and nothing is queried): the DTO mappers then emit
// the legacy shape. The editors a client sees are trainers, so names come from
// TrainerProfile.displayName (kept after trainer tools are turned off, so a
// former trainer's "Changed by Ana" stays readable).

export class CoachingAttributionService {
  constructor(
    private readonly trainers: Pick<
      ITrainerProfileRepository,
      'findMany'
    > = trainerProfileRepository,
  ) {}

  /** The raw `x-chefer-api-level` understands the coaching fields (spec §10). */
  static understandsCoaching(level: number): boolean {
    return level >= COACHING_API_LEVEL;
  }

  /** Editor / setter user ids → trainer display names. Unknown ids are left out. */
  async names(ids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.trainers.findMany(unique);
    return new Map(rows.map((r) => [r.userId, r.displayName]));
  }

  /** Attribution for a routine as seen by its owner, or undefined below level 6 (legacy shape). */
  async forRoutine(
    row: RoutineWithDays,
    viewerId: string,
    level: number,
  ): Promise<RoutineAttribution | undefined> {
    if (!CoachingAttributionService.understandsCoaching(level)) return undefined;
    return { viewerId, names: await this.names(otherEditorIds(row, viewerId)) };
  }
}

export const coachingAttributionService = new CoachingAttributionService();

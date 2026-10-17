import {
  coachingLinkRepository,
  trainerProfileRepository,
  type ICoachingLinkRepository,
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
// former trainer's "Changed by Ana" stays readable). A stamp by anyone who is
// not the viewer's trainer NOW is flagged `former` (PRD 2026-10 §4.3): the
// apps read it as "Ana (former trainer)", or "a former trainer" when the
// account is gone.

export class CoachingAttributionService {
  constructor(
    private readonly trainers: Pick<
      ITrainerProfileRepository,
      'findMany'
    > = trainerProfileRepository,
    private readonly links: Pick<
      ICoachingLinkRepository,
      'findActiveForClient'
    > = coachingLinkRepository,
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

  /** Who coaches `clientId` now (null = nobody): stamps by anyone else are "former". */
  async currentTrainerId(clientId: string): Promise<string | null> {
    return (await this.links.findActiveForClient(clientId))?.trainerId ?? null;
  }

  /** Attribution for a routine as seen by its owner, or undefined below level 6 (legacy shape). */
  async forRoutine(
    row: RoutineWithDays,
    viewerId: string,
    level: number,
  ): Promise<RoutineAttribution | undefined> {
    if (!CoachingAttributionService.understandsCoaching(level)) return undefined;
    const editors = otherEditorIds(row, viewerId);
    const hasStamps =
      row.lastEditedAt !== null || row.days.some((d) => d.exercises.some((e) => e.lastEditedAt));
    const [names, link] = await Promise.all([
      this.names(editors),
      // Only a routine someone else stamped needs to know who coaches the viewer now.
      hasStamps ? this.links.findActiveForClient(viewerId) : Promise.resolve(null),
    ]);
    return { viewerId, names, currentTrainerId: link?.trainerId ?? null };
  }
}

export const coachingAttributionService = new CoachingAttributionService();

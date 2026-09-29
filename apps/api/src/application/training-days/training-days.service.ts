import { TRPCError } from '@trpc/server';
import { chefProfileRepository, type IChefProfileRepository } from '@chefer/database';
import type { DayKind, TrainingDayKinds } from '@chefer/types';

// ─── Training-days service (§2.6, UX-06 T-06.9) ────────────────────────────────
// `ChefProfile.trainingDayKinds` only ever stores the USER-set kinds
// (`run` / `long_run` / `rest`) for weekdays that are not already a lift day —
// `lift` is derived from the active routine's `plannedWeekday`s and is never
// stored here (the gym settings UI shows it read-only, this service would
// reject an attempt to persist it). Onboarding (T-03.9) and gym settings
// (T-36.1) both call the same two procedures, so they can never disagree.

/** The subset of `DayKind` a user may actually set — `lift` is routine-derived. */
export type SettableDayKind = Exclude<DayKind, 'lift'>;

function isWeekdayKey(key: string): boolean {
  return /^[0-6]$/.test(key);
}

export class TrainingDaysService {
  constructor(private readonly profileRepo: IChefProfileRepository = chefProfileRepository) {}

  /** This user's stored weekday kinds (`{}` until set) — a passthrough read. */
  async getDayKinds(userId: string): Promise<TrainingDayKinds> {
    const profile = await this.profileRepo.findByUserId(userId);
    const stored = (profile?.trainingDayKinds as TrainingDayKinds | undefined) ?? {};
    // Defensive: never hand back a `lift` value even if one was ever
    // persisted by an older code path — the routine is the only source.
    return Object.fromEntries(Object.entries(stored).filter(([, kind]) => kind !== 'lift'));
  }

  /**
   * Merges `days` into the stored record: a weekday mapped to a kind is set,
   * one mapped to `null` is cleared (back to unset — the routine's `lift` or,
   * absent that, an implicit rest day). Keys must be `"0"`–`"6"`
   * (0 = Monday, matching `plannedWeekday`); values must not be `lift`.
   */
  async setDayKinds(
    userId: string,
    days: Record<string, SettableDayKind | null>,
  ): Promise<TrainingDayKinds> {
    for (const key of Object.keys(days)) {
      if (!isWeekdayKey(key)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid weekday key "${key}" (expected "0"-"6")`,
        });
      }
    }
    const current = await this.getDayKinds(userId);
    const merged: Record<string, DayKind | null> = { ...current, ...days };
    const next = Object.fromEntries(
      Object.entries(merged).filter((entry): entry is [string, DayKind] => entry[1] !== null),
    );
    await this.profileRepo.upsert(userId, { trainingDayKinds: next });
    return next;
  }
}

export const trainingDaysService = new TrainingDaysService();

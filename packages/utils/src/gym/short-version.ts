// ─── Short version (§T-36.6 scaffold) ──────────────────────────────────────────
// Types only — `shortVersion(day, minutes)` (keeps compounds + the first
// accessory per muscle, the rest → carry-over) is wave 1 (T-36.6, owned by
// L-GYM, may trail). Wave 0 ships the shape so the setup wizard and the
// "Time today" chips (T-00.9's ownership neighbours) can agree on it early.

import type { CarryOverItem } from './carry-over';

/** A routine day's exercise, as `shortVersion` sees it. */
export interface ShortVersionExercise {
  exerciseId: string;
  muscle: string;
  /** Compounds are always kept; only the first accessory per muscle survives a short version. */
  isCompound: boolean;
}

export interface ShortVersionResult {
  kept: ShortVersionExercise[];
  carriedOver: CarryOverItem[];
  /** "Short version · ~{min} min · {n} exercises" preview line inputs. */
  minutes: number;
  exerciseCount: number;
}

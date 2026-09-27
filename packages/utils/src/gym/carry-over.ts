// ─── Carry-over (§T-36.3 scaffold) ─────────────────────────────────────────────
// Types only — wave 0 ships the shape `GymProfile.carryOver` and the session
// doc's `carryOverExerciseIds?` agree on; the "save for later / carry the
// rest" logic (what gets carried, how `bootstrap.nextWorkout` prepends it)
// is wave 1 (T-36.3, owned by L-GYM).

/** One exercise carried from an unfinished session into the next workout. */
export interface CarryOverItem {
  exerciseId: string;
  /** The session it was left unstarted in. */
  fromSessionId: string;
  /** The routine day it belongs to, so it re-attaches to the right slot. */
  routineDayId: string;
}

/** `GymProfile.carryOver` — stored as JSON, `[]` when nothing is carried. */
export type CarryOverList = CarryOverItem[];

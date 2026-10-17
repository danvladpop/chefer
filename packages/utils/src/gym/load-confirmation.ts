// ─── Progression guard (simple training mode §6.5, F-2) ───────────────────────
// A set ticked "done" while its prefilled numbers (a routine target, a
// trainer's plan) were never edited records that the work was done, not what
// was lifted. It is stored as `loadConfirmed: false` and the progression engine
// ignores the whole exercise for that workout, so a prefilled weight never
// becomes a "real" lift. Absent = confirmed: every legacy set, and every tick
// in "Track my progress", where ticking IS confirming the shown numbers.
// Coaching reads the same flag to show "done as planned" instead of weights.

type GuardedSet = {
  completedAt: string | null;
  isWarmup: boolean;
  loadConfirmed?: false | undefined;
};

/** False only for a set ticked with its prefilled numbers never edited. */
export function isLoadConfirmed(set: { loadConfirmed?: false | undefined }): boolean {
  return set.loadConfirmed !== false;
}

/**
 * True when progression may learn from the exercise: no completed working set
 * of it is load-unconfirmed. One unconfirmed working set makes the whole
 * exposure untrustworthy (a partial exposure would read as missed reps).
 */
export function hasConfirmedLoad(exercise: { sets: readonly GuardedSet[] }): boolean {
  return !exercise.sets.some((s) => s.completedAt !== null && !s.isWarmup && !isLoadConfirmed(s));
}

/** "Done as planned": the exercise was ticked off and no completed set's numbers were edited. */
export function isDoneAsPlanned(exercise: { sets: readonly GuardedSet[] }): boolean {
  const done = exercise.sets.filter((s) => s.completedAt !== null);
  return done.length > 0 && done.every((s) => !isLoadConfirmed(s));
}

/** Tick a set as planned: done, numbers untouched, load not confirmed. */
export function tickAsPlanned<S extends GuardedSet>(set: S, completedAt: string): S {
  return { ...set, completedAt, loadConfirmed: false };
}

/** The user edited the set's numbers: its load is now confirmed (the key is dropped). */
export function confirmLoad<S extends GuardedSet>(set: S): S {
  if (set.loadConfirmed === undefined) return set;
  const { loadConfirmed: _dropped, ...rest } = set;
  return rest as S;
}

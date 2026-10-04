// Every KV key the gym feature writes, in one place (gym_plan.md §5.2).
// Renaming a key orphans data already on users' phones — add, never rename.
export const KV_KEYS = {
  mode: 'app.mode',
  owner: 'gym.owner',
  activeSession: 'gym.active-session',
  /** Unparseable active-session payloads are moved here, never deleted. */
  activeSessionQuarantine: 'gym.active-session.quarantine',
  outbox: 'gym.outbox',
  outboxQuarantine: 'gym.outbox.quarantine',
  /** UX-44: ids of deleted sessions whose DISCARDED tombstone was queued — hard-deleted once acked (Q-30). */
  pendingHardDeletes: 'gym.pending-hard-deletes',
  /** UX-44 (T-44.4): the "Next time changed after your edit" snapshot, one at a time. */
  targetNotice: 'gym.target-notice',
  restTimer: 'gym.rest-timer',
  queryCache: 'gym.query-cache',
  /** Dismissed weekly-balance hints per routine (research §2.3), G2-C. */
  routineHintsDismissed: 'gym.routine.hints-dismissed',
  /** "Not this week" dismissals for a missed planned day (T-04.8), by week. */
  missedDayDismissed: 'gym.today.missed-dismissed',
  /** Rationale sheet for the rest-timer background permission shown once (T-36.2, B-40). */
  restPermissionRationaleShown: 'gym.rest-timer.rationale-shown',
  /** `Time today:` choice remembered per weekday (T-36.6): `{ "0": 30 }`; absent = Full. */
  timeToday: 'gym.today.time-today',
  /**
   * Trainer coaching (WP-18, lane D) — device-local, no server state. NOT `gym.`-prefixed on purpose:
   * sign-out wipes everything outside `gym.` (they belong to the account), and an invite code kept
   * across a sign-in is written after that wipe.
   * The invite code a client still has to finish joining (gym setup first, or sign in first).
   */
  coachingPendingJoin: 'coaching.pending-join',
  /** `{ [routineId]: ISO of the trainer change already looked at }` — Today's "Ana updated your routine" line. */
  coachingRoutineSeen: 'coaching.routine-seen',
  /** ISO `at` of the "Ana stopped coaching you" notice the client dismissed. */
  coachingStoppedDismissed: 'coaching.stopped-dismissed',
} as const;

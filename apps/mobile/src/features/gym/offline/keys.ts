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
   * Trainer mode M3 — coached workouts (trainer-mode.md §6.7, §12 "fully offline"). PREFIXES: one key
   * per record. `gym.`-prefixed on purpose: like the trainer's own workouts they survive a session
   * expiry (upload on re-login) and are wiped by a chosen sign-out (counted in its warning first).
   * In-progress coached workouts: `${coachActive}.${bookingKey}.${clientId}` (bookingKey `none` = no booking).
   */
  coachActive: 'gym.coach.active',
  /** Prefetched `trainer.coach.start` answers: `${coachPrefetch}.${bookingKey}.${clientId}`. */
  coachPrefetch: 'gym.coach.prefetch',
  /** One outbox per client, synced through `trainer.coach.sync`: `${coachOutbox}.${clientId}`. */
  coachOutbox: 'gym.coach.outbox',
  /**
   * Trainer coaching (WP-18, lane D) — device-local, no server state. NOT `gym.`-prefixed on purpose:
   * sign-out wipes everything outside `gym.` (they belong to the account), and an invite code kept
   * across a sign-in is written after that wipe.
   * The invite code a client still has to finish joining (gym setup first, or sign in first).
   */
  coachingPendingJoin: 'coaching.pending-join',
  /**
   * Household sharing (ADR 0003) — device-local, not `gym.`-prefixed for the same reason as
   * `coachingPendingJoin`: the household invite code a signed-out visitor opened, kept across sign-in
   * or registration (a cold start included) so the join screen comes back.
   */
  householdPendingJoin: 'household.pending-join',
  /**
   * ADR 0003 `KV_KEYS.shopOutbox`: shopping-list ticks not yet accepted by the server, replayed in order
   * with their original device time. Belongs to the account: wiped by every sign-out (session expiry
   * included — the server keeps the newest change per item, so a lost replay only loses that tick).
   */
  shopOutbox: 'shop.outbox',
  // Lane K3: "Later" on the weekly check-in card hides it until the next day (the local date it was hidden).
  coachingCheckInLater: 'coaching.check-in-later',
  // (The device-local "routine seen" / "stopped dismissed" markers are gone: coaching notices are read on
  // the server since PRD 2026-10 §4.2. Their old values are wiped at the next sign-out.)
} as const;

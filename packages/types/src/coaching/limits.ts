// ─── Trainer coaching: limits, retention and the API level (WP-18, spec §5, §10) ──
// One place for every number the coaching feature enforces, so the API, the
// web app, the mobile app and the docs agree. Change here only.

/**
 * The `x-chefer-api-level` at which a client understands trainer coaching: the
 * new optional routine / bootstrap / progression fields, the `COACHING_SHARING`
 * consent rows and the coaching routers' errors (spec §10). The header is one
 * shared counter across features (apps/api/src/application/gym/client-level.ts):
 * 3 = cardio, 4 = health consent, 5 = free (INTERVALS used to sit here), 6 =
 * coaching, 7 = INTERVALS. The API gates on the RAW `ctx.clientApiLevel`, not
 * `effectiveLevel()` (that one caps gym tracking types by the cardio flag).
 *
 * Level 5 stays unused on purpose: levels are cumulative ("a bundle that sends
 * N implements every level below it") and no bundle implements INTERVALS yet.
 */
export const COACHING_API_LEVEL = 6;

/** The level INTERVALS moved to when coaching claimed 6 (Q-8, spec §10). */
export const INTERVALS_API_LEVEL = 7;

export const COACHING_LIMITS = {
  /** Invite codes: 10 chars of Crockford base32 from crypto random. */
  inviteCodeLength: 10,
  inviteTtlDays: 14,
  maxOpenInvites: 20,
  maxActiveClients: 50,
  /** Invites created per trainer per day (rate limit). */
  invitesPerDay: 50,
  /** `coaching.previewInvite` calls per user per hour (rate limit). */
  previewPerHour: 30,
  /** `coaching.join` calls per user per hour (rate limit). */
  joinPerHour: 10,
  /** Invites listed: the last N days. */
  inviteListDays: 30,
  displayNameMaxChars: 40,
  inviteLabelMaxChars: 60,
  /** The private note about one client (opaque text). */
  noteMaxChars: 4000,
  /** A trainer's cue on one exercise (the client sees it). */
  trainerNoteMaxChars: 200,
  /** The trainer sees workouts from this many days before the link started (Q-2). */
  workoutWindowDays: 28,
  workoutsPageSize: 20,
  /** `trainer.client.exerciseHistory` returns the last N exposures. */
  historyExposures: 8,
  adherenceWeeks: 8,
  adherenceDays: 14,
  /** The client list flags a client with nothing logged for this many days. */
  inactiveDays: 7,
  /** `coaching.status` keeps showing "<trainer> stopped coaching you" this long. */
  stoppedNoticeDays: 30,
} as const;

/**
 * Retention (spec §8.4, Q-6 / Q-7). Recommended defaults, NOT yet confirmed by
 * counsel: change these constants only after counsel and the owner decide.
 * Enforced by `apps/api/src/workers/coaching-maintenance.worker.ts`.
 */
export const COACHING_RETENTION = {
  /** Ended links are kept this many months (disputes), then deleted. */
  endedLinkMonths: 24,
  /** The trainer's private note is hidden when the link ends and deleted this many days later (restored if the same pair links again). */
  hiddenNoteDays: 30,
  /** Invites are deleted this many days after they expired (or were revoked / used). */
  inviteAfterExpiryDays: 30,
  /**
   * Q-7: whether a client's data export includes the trainer's private notes
   * about them. Default false: the trainer is an independent controller of the
   * notes (counsel to confirm).
   */
  clientExportIncludesTrainerNotes: false,
} as const;

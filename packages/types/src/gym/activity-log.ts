// ─── Activity quick-log presets (WP-20, owner decision 2026-10-04) ─────────────
// "Log an activity" records a class or session done elsewhere — "45 min cycling
// class, 400 kcal" — as a finished WorkoutSession with ONE DURATION entry. The
// chips below map to governed catalogue rows (exercise-catalog.ts, all
// DURATION so they render on every shipped client). The kcal is RECORD ONLY:
// it never moves a food target, the planner or a rebalance (business_flow.md).

export interface ActivityPreset {
  /** Stable chip key (analytics, test ids). */
  key: string;
  /** Chip label. */
  label: string;
  /** Catalogue exercise the session's one entry uses. */
  exerciseId: string;
  /** Default session name (what history shows); `other` takes the user's own. */
  sessionName: string;
}

/** The chips, in display order; `other` is last and asks for a name. */
export const ACTIVITY_PRESETS: readonly ActivityPreset[] = [
  {
    key: 'cycling',
    label: 'Cycling class',
    exerciseId: 'spin-class',
    sessionName: 'Cycling class',
  },
  {
    key: 'pilates',
    label: 'Pilates',
    exerciseId: 'pilates-class',
    sessionName: 'Pilates class',
  },
  { key: 'yoga', label: 'Yoga', exerciseId: 'yoga-class', sessionName: 'Yoga class' },
  {
    key: 'hiit',
    label: 'HIIT / bootcamp',
    exerciseId: 'hiit-class',
    sessionName: 'HIIT class',
  },
  {
    key: 'dance',
    label: 'Zumba / dance',
    exerciseId: 'dance-class',
    sessionName: 'Dance class',
  },
  { key: 'swimming', label: 'Swimming', exerciseId: 'swimming', sessionName: 'Swimming' },
  { key: 'running', label: 'Running', exerciseId: 'running', sessionName: 'Run' },
  { key: 'walking', label: 'Walking', exerciseId: 'walking', sessionName: 'Walk' },
  { key: 'other', label: 'Other', exerciseId: 'other-activity', sessionName: 'Activity' },
];

export const ACTIVITY_PRESET_BY_KEY: ReadonlyMap<string, ActivityPreset> = new Map(
  ACTIVITY_PRESETS.map((p) => [p.key, p]),
);

/**
 * Exercise ids a quick-logged activity can carry. A finished, routine-less
 * session made only of these is an "activity log" (`isActivityLogSession` in
 * @chefer/utils): it counts toward the week, but never as "the workout is done
 * today" and never as a training day for nutrition.
 */
export const ACTIVITY_LOG_EXERCISE_IDS: ReadonlySet<string> = new Set(
  ACTIVITY_PRESETS.map((p) => p.exerciseId),
);

/** Longest activity the sheet accepts (the set's `durationSec` caps at 3 h). */
export const ACTIVITY_MAX_DURATION_MIN = 180;
/** Largest kcal the sheet accepts (the wire schema allows 10 000). */
export const ACTIVITY_MAX_KCAL = 5000;
/** The free-text name of an `other` activity. */
export const ACTIVITY_NAME_MAX_LENGTH = 40;

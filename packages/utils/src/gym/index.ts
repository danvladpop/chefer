// Gym engine public API (gym_plan.md §3). Signatures are FROZEN after wave 0;
// G1-A implements the bodies. Import from '@chefer/utils'.
export * from './loads';
export * from './progression';
export * from './warmups';
export * from './e1rm';
export * from './prs';
export * from './volume';
export * from './templates';
export * from './weeks';
export * from './deload';
export * from './session';
export * from './workout-reducer';
// Reason-code → sentence explanations (research §1.11/§1.12). Not re-exported
// until now: G2-B (Today / active-workout "Why?" copy) is the first caller.
export * from './reasons';
// Contextual-card priority (G4-A): shared so mobile and web agree on which
// single offer (comeback/deload/stall/recap) to show.
export * from './offers';
// Superset grouping (routine editors) and round logic (active workout), G4-B.
export * from './supersets';
// Carry-over + short-version types (T-00.7 scaffold for T-36.3/T-36.6).
export * from './carry-over';
export * from './short-version';
// The shared minutes estimate (`~{min} min`) behind session length + short version.
export { estimateMinutes } from './duration';
// Resume card summary (T-36.A1.1) and Recent-workouts grouping (T-36.A2.1).
export * from './resume';
export * from './recent';
// Stats › History week-grouping (T-36.5).
export * from './history';
// Tracking-type helpers (S18, T-42.0): cardio-as-first-class-type contracts.
export * from './tracking';
// Cardio rules — duration/distance/pace/effort/next-time (T-42.4).
export * from './cardio';
// Correcting a past session: delete preview + target-change diff (T-44.2/T-44.4).
export * from './session-edit';
// Relative strength (e1RM ÷ body weight) with a profile-weight fallback (UX-GYM-17).
export * from './relative-strength';

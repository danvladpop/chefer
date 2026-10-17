import type { EventMap } from '@chefer/types';
import { localDateStr } from '@chefer/utils';

// ─── Store rating prompt: the pure rule (ASO plan §5.1) ─────────────────────────
// Decides whether a success moment may ask the OS for its native rating sheet.
// No storage and no native calls here — review-store.ts persists the state,
// request-review.ts talks to expo-store-review. Both stores cap the sheet
// themselves (iOS: 3 a year; Play: an undisclosed quota), so this rule only
// makes sure that when the OS does show it, the user has had a good run:
//   • active on at least MIN_ACTIVE_DAYS distinct calendar days;
//   • not in their first session, and nothing failed in this session;
//   • not asked by us in the last PROMPT_COOLDOWN_DAYS days;
//   • the trigger's own success condition (a full week planned for the food
//     triggers, a PR or the 3rd workout for the gym ones).
// There is no "Rate us" button and no "Enjoying Chefer?" pre-prompt: both
// stores forbid gating the sheet on a positive answer.

/** One of the success moments (the analytics event carries the same union). */
export type ReviewTrigger = EventMap['review_prompt_requested']['trigger'];

export const MIN_ACTIVE_DAYS = 3;
export const PROMPT_COOLDOWN_DAYS = 120;
export const PROMPT_COOLDOWN_MS = PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
/** The gym milestone: from the 3rd completed workout on. */
export const WORKOUTS_FOR_PROMPT = 3;
/** Distinct days kept — only "at least MIN_ACTIVE_DAYS" is ever asked. */
const MAX_ACTIVE_DAYS_KEPT = 14;

export interface ReviewPromptState {
  /** When the app was first opened with this feature (ISO), null before. */
  firstOpenAt: string | null;
  /** Distinct local calendar days (YYYY-MM-DD) the app was in the foreground, oldest first. */
  activeDays: string[];
  /** When we last asked the OS for the sheet (ISO). */
  lastPromptAt: string | null;
  /** First time a week with meals on all 7 days was seen (ISO). */
  fullWeekPlannedAt: string | null;
  /** Workouts finished on this device since the feature shipped. */
  completedWorkouts: number;
}

export const INITIAL_REVIEW_PROMPT_STATE: ReviewPromptState = {
  firstOpenAt: null,
  activeDays: [],
  lastPromptAt: null,
  fullWeekPlannedAt: null,
  completedWorkouts: 0,
};

/** What is known about the running session (in memory, never persisted). */
export interface ReviewSession {
  /** This launch is the one that first recorded `firstOpenAt`. */
  isFirst: boolean;
  /** An ErrorBoundary recovery, a gym sync failure or a failed mutation (its error snackbar) happened. */
  hadError: boolean;
}

export type ReviewBlockReason =
  | 'first-session'
  | 'recent-error'
  | 'too-few-days'
  | 'cooldown'
  | 'trigger-not-met';

export type ReviewDecision = { ok: true } | { ok: false; reason: ReviewBlockReason };

/** Adds today to the active days (once per calendar day) and stamps the first open. */
export function recordActiveDay(state: ReviewPromptState, now: Date): ReviewPromptState {
  const today = localDateStr(now);
  const firstOpenAt = state.firstOpenAt ?? now.toISOString();
  if (state.activeDays.includes(today)) {
    return firstOpenAt === state.firstOpenAt ? state : { ...state, firstOpenAt };
  }
  const activeDays = [...state.activeDays, today].slice(-MAX_ACTIVE_DAYS_KEPT);
  return { ...state, firstOpenAt, activeDays };
}

export function markPrompted(state: ReviewPromptState, now: Date): ReviewPromptState {
  return { ...state, lastPromptAt: now.toISOString() };
}

export function markFullWeekPlanned(state: ReviewPromptState, now: Date): ReviewPromptState {
  return state.fullWeekPlannedAt ? state : { ...state, fullWeekPlannedAt: now.toISOString() };
}

export function markWorkoutCompleted(state: ReviewPromptState): ReviewPromptState {
  return { ...state, completedWorkouts: state.completedWorkouts + 1 };
}

function triggerMet(trigger: ReviewTrigger, state: ReviewPromptState): boolean {
  switch (trigger) {
    case 'food_log':
    case 'shopping_tick':
      return state.fullWeekPlannedAt !== null;
    case 'gym_pr':
      return true;
    case 'gym_third_workout':
      return state.completedWorkouts >= WORKOUTS_FOR_PROMPT;
  }
}

/** Whether `trigger` may ask for the native rating sheet now. */
export function reviewDecision(
  trigger: ReviewTrigger,
  state: ReviewPromptState,
  session: ReviewSession,
  now: Date,
): ReviewDecision {
  if (session.isFirst) return { ok: false, reason: 'first-session' };
  if (session.hadError) return { ok: false, reason: 'recent-error' };
  if (new Set(state.activeDays).size < MIN_ACTIVE_DAYS)
    return { ok: false, reason: 'too-few-days' };
  if (state.lastPromptAt !== null) {
    const last = Date.parse(state.lastPromptAt);
    // A stamp in the future (clock moved back) still counts as "just asked".
    if (Number.isNaN(last) || now.getTime() - last < PROMPT_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }
  }
  if (!triggerMet(trigger, state)) return { ok: false, reason: 'trigger-not-met' };
  return { ok: true };
}

/**
 * True for a week plan (the `mealPlan.getForWeek` / `generate` / `planDay`
 * shape) with at least one meal on each of the 7 days. Structural, because
 * it reads whatever the query cache holds.
 */
export function isFullWeekPlan(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || !('days' in data)) return false;
  const { days } = data;
  if (!Array.isArray(days)) return false;
  const planned = new Set<number>();
  for (const day of days as unknown[]) {
    if (typeof day !== 'object' || day === null) continue;
    const { dayOfWeek, meals } = day as { dayOfWeek?: unknown; meals?: unknown };
    if (typeof dayOfWeek === 'number' && Array.isArray(meals) && meals.length > 0) {
      planned.add(dayOfWeek);
    }
  }
  return planned.size >= 7;
}

/** Reads a stored value back, falling back field by field on anything malformed. */
export function parseReviewPromptState(raw: unknown): ReviewPromptState {
  if (typeof raw !== 'object' || raw === null) return INITIAL_REVIEW_PROMPT_STATE;
  const v = raw as Record<string, unknown>;
  const isoOrNull = (x: unknown): string | null =>
    typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : null;
  return {
    firstOpenAt: isoOrNull(v.firstOpenAt),
    activeDays: Array.isArray(v.activeDays)
      ? v.activeDays.filter((d): d is string => typeof d === 'string')
      : [],
    lastPromptAt: isoOrNull(v.lastPromptAt),
    fullWeekPlannedAt: isoOrNull(v.fullWeekPlannedAt),
    completedWorkouts:
      typeof v.completedWorkouts === 'number' && Number.isFinite(v.completedWorkouts)
        ? v.completedWorkouts
        : 0,
  };
}

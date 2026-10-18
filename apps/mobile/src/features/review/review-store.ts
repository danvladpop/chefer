import { AppState, type AppStateStatus } from 'react-native';
import { kv } from '../gym/offline/kv';
import {
  INITIAL_REVIEW_PROMPT_STATE,
  isFullWeekPlan,
  markFullWeekPlanned,
  markWorkoutCompleted,
  parseReviewPromptState,
  recordActiveDay,
  type ReviewPromptState,
  type ReviewSession,
} from './review-eligibility';

// ─── Store rating prompt: device state + session (ASO plan §5.1) ───────────────
// One JSON value in the on-device KV store (the same SQLite store as the gym
// offline layer and the premium nudge cap). It belongs to the DEVICE, not the
// account — it is listed in DEVICE_KV_KEYS_KEPT so sign-out keeps the 120-day
// cap and the active days. The session (first launch? anything failed?) lives
// only in memory. Every access is wrapped: a storage failure means "no prompt",
// never a crash (expo-updates' ErrorRecovery turns JS errors into native ones).

export const REVIEW_PROMPT_KEY = 'review.prompt-state';

/**
 * Back from the background after this long is a new session: an error from
 * yesterday no longer blocks today (iOS can keep the process alive for days).
 */
export const REVIEW_SESSION_GAP_MS = 30 * 60 * 1000;

// Until startReviewSession() runs nothing may prompt: "first session" is the safe default.
let session: ReviewSession = { isFirst: true, hadError: false };
let started = false;
let backgroundedAt: number | null = null;
let appStateSubscription: { remove: () => void } | null = null;

export function readReviewState(): ReviewPromptState {
  try {
    return parseReviewPromptState(kv.getJSON(REVIEW_PROMPT_KEY));
  } catch {
    return INITIAL_REVIEW_PROMPT_STATE;
  }
}

export function writeReviewState(next: ReviewPromptState): void {
  try {
    kv.setJSON(REVIEW_PROMPT_KEY, next);
  } catch {
    // Storage unavailable: the prompt simply never qualifies.
  }
}

function updateReviewState(fn: (state: ReviewPromptState) => ReviewPromptState): void {
  const before = readReviewState();
  const next = fn(before);
  if (next !== before) writeReviewState(next);
}

function onAppStateChange(status: AppStateStatus): void {
  try {
    const now = Date.now();
    if (status === 'active') {
      if (backgroundedAt !== null && now - backgroundedAt >= REVIEW_SESSION_GAP_MS) {
        session = { isFirst: false, hadError: false };
      }
      backgroundedAt = null;
      updateReviewState((state) => recordActiveDay(state, new Date(now)));
    } else if (status === 'background' && backgroundedAt === null) {
      backgroundedAt = now;
    }
  } catch {
    // never let a listener throw
  }
}

/** Called once at launch (app/_layout.tsx): counts today and opens the session. */
export function startReviewSession(now: Date = new Date()): void {
  if (started) return;
  started = true;
  try {
    const before = readReviewState();
    session = { isFirst: before.firstOpenAt === null, hadError: false };
    writeReviewState(recordActiveDay(before, now));
    appStateSubscription = AppState.addEventListener('change', onAppStateChange);
  } catch {
    // stays a "first session": no prompt this launch
  }
}

export function getReviewSession(): ReviewSession {
  return session;
}

/** An ErrorBoundary recovery, a failed sync or a failed mutation: no prompt this session. */
export function noteReviewBlockingError(): void {
  session = { ...session, hadError: true };
}

/** Remembers the first time a week plan with meals on all 7 days is seen. */
export function noteWeekPlan(data: unknown, now: Date = new Date()): void {
  try {
    if (!isFullWeekPlan(data)) return;
    updateReviewState((state) => markFullWeekPlanned(state, now));
  } catch {
    // ignore
  }
}

/** A workout was finished on this device. */
export function noteWorkoutCompleted(): void {
  updateReviewState(markWorkoutCompleted);
}

/** Test seam: forget the session (and the AppState listener). */
export function resetReviewSessionForTests(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
  session = { isFirst: true, hadError: false };
  started = false;
  backgroundedAt = null;
}

/** Test seam: drive the AppState listener directly. */
export function emitAppStateForTests(status: AppStateStatus): void {
  onAppStateChange(status);
}

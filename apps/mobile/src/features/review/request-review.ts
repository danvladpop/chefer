import { AppState } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { track } from '../../lib/analytics';
import { markPrompted, reviewDecision, type ReviewTrigger } from './review-eligibility';
import { getReviewSession, readReviewState, writeReviewState } from './review-store';

// ─── Store rating prompt: the native call (ASO plan §5.1) ──────────────────────
// `maybeRequestReview(trigger)` is the only way into the OS rating sheet — no
// "Rate us" button, no pre-prompt. It checks the rule now (cheap, sync), waits
// for the success UI to settle, checks again (an error may have landed in
// between, or the app gone to the background) and only then asks the OS. The
// OS decides whether anything is actually shown; we cannot tell, so the
// 120-day cooldown starts at the request.
//
// `expo-store-review` arrives with native release 1.0.2. A binary built before
// it has no `ExpoStoreReview` module and importing the package there throws,
// so the module is looked up first and required inline (same as share-file.ts).
// Every path is a silent no-op on failure.

type StoreReviewModule = typeof import('expo-store-review');

/** Lets the success snackbar / summary choreography land before the OS sheet. */
export const REVIEW_SETTLE_DELAY_MS = 2000;

let pending: ReturnType<typeof setTimeout> | null = null;

function loadStoreReview(): StoreReviewModule | null {
  if (requireOptionalNativeModule('ExpoStoreReview') == null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module, see above
  return require('expo-store-review') as StoreReviewModule;
}

/** Asks the OS now if the rule allows it. Resolves true when the request was made. */
export async function requestReviewNow(trigger: ReviewTrigger): Promise<boolean> {
  try {
    if (AppState.currentState !== 'active') return false;
    const now = new Date();
    const state = readReviewState();
    if (!reviewDecision(trigger, state, getReviewSession(), now).ok) return false;
    const StoreReview = loadStoreReview();
    if (!StoreReview || !(await StoreReview.isAvailableAsync())) return false;
    writeReviewState(markPrompted(state, now));
    track('review_prompt_requested', { trigger });
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

/**
 * Call at a success moment. Schedules at most one request, `delayMs` after
 * the call, and only when the rule allows it now. Returns whether it did.
 */
export function maybeRequestReview(
  trigger: ReviewTrigger,
  delayMs: number = REVIEW_SETTLE_DELAY_MS,
): boolean {
  try {
    if (pending !== null) return false;
    if (!reviewDecision(trigger, readReviewState(), getReviewSession(), new Date()).ok) {
      return false;
    }
    pending = setTimeout(() => {
      pending = null;
      void requestReviewNow(trigger);
    }, delayMs);
    return true;
  } catch {
    // never let a success moment fail because of the rating prompt
    return false;
  }
}

/** Test seam. */
export function resetPendingReviewForTests(): void {
  if (pending !== null) clearTimeout(pending);
  pending = null;
}

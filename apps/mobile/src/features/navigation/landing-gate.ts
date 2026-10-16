// The cold-start landing (UX-04 §1, UX-PO-10: Train on a training-day
// afternoon, Gym for a TRAIN-only account) runs ONCE per sign-in per launch,
// not per mount: switching to Gym replaces the (food) group in the root Stack
// (it unmounts), so a per-mount check re-ran on every switch back to Food and,
// for a TRAIN-only account, redirected straight to /today again — Food was
// unreachable (owner dogfood 2026-09-30, iPhone). Keyed by the token so a
// fresh sign-in still gets its landing.
//
// Onboarding claims it too (2026-10-16): finishing setup lands where the flow
// says — Today with its welcome card — not wherever the landing rule would
// pick for a cold start (a lifter finishing on a training-day afternoon was
// sent to Train).

let checkedForToken: string | null = null;

/** True the first time for this sign-in: the caller applies the landing now. */
export function claimLanding(token: string | null): boolean {
  if (checkedForToken === token) return false;
  checkedForToken = token;
  return true;
}

/** Onboarding finished: this sign-in's landing is decided, skip the rule. */
export function markLandingDecided(token: string | null): void {
  checkedForToken = token;
}

/** Test seam. */
export function resetLandingGateForTests(): void {
  checkedForToken = null;
}

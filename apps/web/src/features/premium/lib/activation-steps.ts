import {
  activationStepCopy,
  activationStepKeys,
  type ActivationStepCopy,
  type ActivationStepKey,
} from '@chefer/utils';

// ─── Post-upgrade activation steps (review P-8; audit F-PREM-1-5, F-PM-9) ─────
// "Three things to do first", ordered by what the user was looking at when
// they upgraded (the upgrade `source`) and without steps they already did.
// A user with a profile is never sent to /onboarding — it redirects them to
// the dashboard, a dead CTA (F-PM-9). The ordering and copy are shared with
// mobile (@chefer/utils premium-activation); only the routes are web's.

export type { ActivationStepKey };

export interface ActivationStep extends ActivationStepCopy {
  href: string;
}

// bug B-09: "regenerate" and "cheferize" used to just link to the page and
// stop — the user still had to find and click the actual action themselves,
// so premium looked identical to free until they figured out what to do.
// Both routes now carry a fire-once query param the target page reads to
// act immediately on arrival (`?generate=1` — meal-plan/page.tsx already
// supported it for the dashboard's "Generate My Week"; `?import=1` —
// recipes/page.tsx, added alongside this fix).
const HREFS: Record<ActivationStepKey, string> = {
  profile: '/onboarding',
  household: '/preferences#household',
  regenerate: '/meal-plan?generate=1',
  cheferize: '/recipes?import=1',
  snap: '/tracker',
};

/**
 * Up to three steps: the upgrade source's own first, then the defaults;
 * "Set your goal" disappears once the user has a profile. `hasPlan === false`
 * (UX-ACC-13) turns "Regenerate this week" into "Plan my week" — the same
 * `?generate=1` link, which builds the week on arrival.
 */
export function activationSteps(
  source: string | null,
  hasProfile: boolean,
  hasPlan?: boolean,
): ActivationStep[] {
  return activationStepKeys(source, hasProfile).map((key) => ({
    ...activationStepCopy(key, hasPlan === undefined ? {} : { hasPlan }),
    href: HREFS[key],
  }));
}

import {
  ACTIVATION_STEP_COPY,
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

const HREFS: Record<ActivationStepKey, string> = {
  profile: '/onboarding',
  household: '/preferences#household',
  regenerate: '/meal-plan',
  cheferize: '/recipes',
};

/**
 * Up to three steps: the upgrade source's own first, then the defaults;
 * "Set your goal" disappears once the user has a profile.
 */
export function activationSteps(source: string | null, hasProfile: boolean): ActivationStep[] {
  return activationStepKeys(source, hasProfile).map((key) => ({
    ...ACTIVATION_STEP_COPY[key],
    href: HREFS[key],
  }));
}

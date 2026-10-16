import type { OnboardingJob } from '@chefer/types';
import { kv } from '../gym/offline/kv';

// The one-time "You're all set" card after Onboarding V4: set when the flow
// finishes, read by the landing Today, cleared when the card is dismissed.

const KEY = 'onboardingV4.welcome';

export type OnboardingV4Welcome = { jobs: OnboardingJob[] };

export function markOnboardingV4Welcome(jobs: readonly OnboardingJob[]): void {
  kv.setJSON(KEY, { jobs: [...jobs] } satisfies OnboardingV4Welcome);
}

export function readOnboardingV4Welcome(): OnboardingV4Welcome | null {
  const raw = kv.getJSON(KEY) as Partial<OnboardingV4Welcome> | null | undefined;
  return raw && Array.isArray(raw.jobs) ? { jobs: raw.jobs } : null;
}

export function clearOnboardingV4Welcome(): void {
  kv.remove(KEY);
}

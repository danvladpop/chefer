import type { OnboardingJob } from '@chefer/types';

// ─── Shell v2 routes (mobile UX revamp, phase 1) ────────────────────────────
// The new shell's one tab bar (Today · Plan · Shop · Train · You, plan:
// "Target navigation") and the map from the old Food|Gym URLs to it. The old
// tab groups stay in the app untouched; while the new shell is on, their
// layouts send every visit (a push from an old screen, a notification, a
// deep link) to the new home of the same screen, via `shellV2PathFor`.

export type ShellTab = 'home' | 'plan' | 'shop' | 'train' | 'you';

export type ShellTabSet = Record<ShellTab, boolean>;

/**
 * Job-aware tabs: someone who only trains never sees Plan or Shop, someone
 * who only cooks never sees Train (unless they have set training up anyway).
 * No answer to the jobs question (a legacy account) shows everything.
 */
export function shellTabsFor(jobs: readonly OnboardingJob[], hasGymProfile: boolean): ShellTabSet {
  const known = jobs.length > 0;
  const food = !known || jobs.some((job) => job !== 'TRAIN');
  const train = !known || jobs.includes('TRAIN') || hasGymProfile;
  return { home: true, plan: food, shop: food, train, you: true };
}

const OLD_TO_NEW: Readonly<Record<string, string>> = {
  '/': '/home',
  '/meal-plan': '/plan',
  '/shopping-list': '/shop',
  '/recipes': '/cookbook',
  '/more': '/you',
  '/today': '/train',
  '/routine': '/training/routine',
  '/exercises': '/training/exercises',
  '/stats': '/training/stats',
  '/gym-more': '/you',
};

/** Where an old tab URL lives in the new shell (null when it isn't an old tab). */
export function shellV2PathFor(pathname: string): string | null {
  return OLD_TO_NEW[pathname] ?? null;
}

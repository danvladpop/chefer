import type { OnboardingJob } from '@chefer/types';

// ─── Home card order (§2.4, T-04.9) ────────────────────────────────────────────
// Pure ordering fed by the effective jobs list. TRACK users get a fixed order
// (the ring stays home, D20): ring, Quick add, Snap, then the job cards —
// never amber/red on first render (the ring's status chip is neutral until
// the caller applies today's progress).

export const HOME_CARD_IDS = [
  'ring',
  'quickAdd',
  'snap',
  'planToday',
  'workout',
  'household',
  'savedRecipes',
] as const;
export type HomeCardId = (typeof HOME_CARD_IDS)[number];

// USE_WHAT_I_HAVE (retired pantry job, WP-24) deliberately has no card.
const JOB_CARD: Readonly<Partial<Record<OnboardingJob, HomeCardId>>> = {
  PLAN_MEALS: 'planToday',
  TRAIN: 'workout',
  HOUSEHOLD: 'household',
  SAVED_RECIPES: 'savedRecipes',
};

/** The job-derived cards, in job order, deduped, never including the tracking cards. */
function jobCards(jobs: readonly OnboardingJob[]): HomeCardId[] {
  const seen = new Set<HomeCardId>();
  const cards: HomeCardId[] = [];
  for (const job of jobs) {
    const card = JOB_CARD[job];
    if (card && !seen.has(card)) {
      seen.add(card);
      cards.push(card);
    }
  }
  return cards;
}

/**
 * The Food Today card order for this user's effective jobs. TRACK pins
 * ring → Quick add → Snap ahead of every job card, and stays fixed at every
 * hour (no reordering by time of day or progress).
 */
export function homeCardOrder(jobs: readonly OnboardingJob[]): HomeCardId[] {
  const cards = jobCards(jobs);
  if (!jobs.includes('TRACK')) return cards;
  return ['ring', 'quickAdd', 'snap', ...cards.filter((c) => c !== 'ring')];
}

import type { OnboardingIntent, OnboardingJob } from '@chefer/types';

// ─── Household maths + audience routing (backlog P2-3) ────────────────────────
// Pure helpers shared by the API, web and mobile so every surface agrees on
// "how many portions does this table eat" and "which onboarding steps does
// this audience see".

/**
 * Servings the whole table eats: ceil(owner 1 + Σ member portionFactor).
 * The same number premium generation sizes recipes to (servings) and the
 * shopping list scales to. A household of just the owner is 1.
 */
export function householdPortionSum(members: readonly { portionFactor: number }[]): number {
  const raw = members.reduce((sum, m) => sum + Math.max(0, m.portionFactor), 1);
  // Float noise (0.25 + 0.5 + …) must not round 2.0000001 up to 3.
  return Math.max(1, Math.ceil(Math.round(raw * 1000) / 1000));
}

/**
 * Honest per-portion cost (audit F-PM-5): the list total divided by the
 * portions the list was ACTUALLY sized for — never a single-portion total
 * divided by the head count. Null when either side is unknown.
 */
export function perPortionCost(
  totalEur: number | null | undefined,
  portions: number | null | undefined,
): number | null {
  if (totalEur == null || portions == null || !(portions > 0)) return null;
  return Math.round((totalEur / portions) * 100) / 100;
}

// ─── Onboarding routing ───────────────────────────────────────────────────────

export type OnboardingStepKey =
  | 'intent'
  | 'table'
  | 'diet'
  | 'goal'
  | 'metrics'
  | 'cuisine'
  // Rev 2 (T-00.7): a TRACK job adds the "Your targets" step (§2.4).
  | 'targets'
  // v3 (T-03.2/T-03.7, §2.4): the jobs-based UI — 'jobs' replaces 'intent',
  // 'trainingDays' and 'howYouCook' are new.
  | 'jobs'
  | 'trainingDays'
  | 'howYouCook';

/** Jobs whose plans are "how you cook" plans — TRAIN and TRACK aren't. */
const FOOD_PLAN_JOBS: readonly OnboardingJob[] = [
  'PLAN_MEALS',
  'HOUSEHOLD',
  'USE_WHAT_I_HAVE',
  'SAVED_RECIPES',
];

/**
 * The onboarding steps for one audience (PM review §5, F-PM-6):
 * - the intent question comes first while it is unanswered,
 * - TRAIN stops after the question — gym setup comes first, food later,
 * - HOUSEHOLD adds "Who's at your table?" before the food steps,
 * - everyone else keeps the tier's food flow (free: diet → goal → metrics;
 *   premium: goal → metrics → diet → cuisine).
 *
 * v2 (rev 2, T-00.7): pass `jobs` (the effective jobs list, `@chefer/utils`
 * `effectiveJobs()`) to route by jobs instead of the single legacy intent —
 * a TRACK job adds the "targets" step. Omitting `jobs` (or passing `[]`)
 * keeps the exact v1 behaviour above, so every existing call site keeps
 * working unchanged.
 *
 * v3 (T-03.2/T-03.7, §2.4): pass `askJobs: true` to switch to the jobs-based
 * UI — a single multi-select 'jobs' step (replacing 'intent') plus
 * 'trainingDays' (Train + any food job) and 'howYouCook' (any food-plan job;
 * for Track alone only when another food-plan job is also chosen). `jobs`
 * doubles as both "the saved answer" and "the in-progress wizard
 * selection" — an empty array means unanswered, so the caller passes its
 * local multi-select state while the user is still picking. Omitting
 * `askJobs` keeps the exact v1/v2 behaviour above, so web (until its own
 * migration) and any other v1/v2 call site keep working unchanged.
 */
export function onboardingSteps({
  intent,
  askIntent,
  isPremium,
  jobs,
  askJobs,
  hasNumericGoal,
}: {
  intent: OnboardingIntent | null;
  /** Show the question (false when the saved profile already has an intent). */
  askIntent: boolean;
  isPremium: boolean;
  /** v2+: the effective jobs list. Omitted/empty (with `askJobs` unset) = v1 intent-based routing. */
  jobs?: readonly OnboardingJob[];
  /** v3 only: true switches to the jobs-based UI (see above). */
  askJobs?: boolean;
  /**
   * v3 only: whether the goal step's current answer is a numeric goal (not
   * null/"Just good food"). Gates the 'targets' step for Train + food users
   * (UX-03 flow table) — recomputed live as the wizard's goal answer
   * changes, same pattern as `intent` above.
   */
  hasNumericGoal?: boolean;
}): OnboardingStepKey[] {
  if (askJobs) {
    const jobsList = jobs ?? [];
    if (jobsList.length === 0) return ['jobs'];
    const trainOnly = jobsList.length === 1 && jobsList[0] === 'TRAIN';
    if (trainOnly) return ['jobs'];

    const hasTrain = jobsList.includes('TRAIN');
    const hasTrack = jobsList.includes('TRACK');
    const hasFoodPlanJob = jobsList.some((j) => FOOD_PLAN_JOBS.includes(j));
    const trainingDays: OnboardingStepKey[] = hasTrain ? ['trainingDays'] : [];
    const table: OnboardingStepKey[] = jobsList.includes('HOUSEHOLD') ? ['table'] : [];
    const howYouCook: OnboardingStepKey[] = hasFoodPlanJob ? ['howYouCook'] : [];
    const cuisine: OnboardingStepKey[] = isPremium ? ['cuisine'] : [];
    const targets: OnboardingStepKey[] =
      hasTrack || (hasTrain && hasNumericGoal === true) ? ['targets'] : [];

    // Track alone (or Track + Household, no Train, no other food-plan job):
    // targets sit right after metrics, and How you cook only shows when a
    // food-plan job was ALSO chosen (T-03.7) — after targets, not before.
    if (hasTrack && !hasTrain) {
      return ['jobs', ...table, 'diet', 'goal', 'metrics', ...targets, ...howYouCook, ...cuisine];
    }

    // Every other combination (a food job, with or without Train): How you
    // cook sits before the goal, same as the current free/premium order.
    return [
      'jobs',
      ...trainingDays,
      ...table,
      'diet',
      ...howYouCook,
      'goal',
      'metrics',
      ...targets,
      ...cuisine,
    ];
  }

  const head: OnboardingStepKey[] = askIntent ? ['intent'] : [];
  const food: OnboardingStepKey[] = isPremium
    ? ['goal', 'metrics', 'diet', 'cuisine']
    : ['diet', 'goal', 'metrics'];

  if (!jobs || jobs.length === 0) {
    if (intent === 'TRAIN' && askIntent) return head;
    const table: OnboardingStepKey[] = intent === 'HOUSEHOLD' ? ['table'] : [];
    return [...head, ...table, ...food];
  }

  const trainOnly = jobs.length === 1 && jobs[0] === 'TRAIN';
  if (trainOnly && askIntent) return head;

  const table: OnboardingStepKey[] = jobs.includes('HOUSEHOLD') ? ['table'] : [];
  const targets: OnboardingStepKey[] = jobs.includes('TRACK') ? ['targets'] : [];
  return [...head, ...table, ...food, ...targets];
}

// ─── Ghost samples (free household teaser, audit F-PM-12) ─────────────────────

export type HouseholdGhostKind = 'partner' | 'kid';

export interface HouseholdGhostSample {
  name: string;
  /** e.g. "vegetarian, allergic to peanuts" or "a kid — ½ portion, no tree nuts". */
  summary: string;
  portionFactor: number;
  isKid: boolean;
  allergies: string[];
  dietaryRestrictions: string[];
}

/** The sample member the ghost shows for the chip the user tapped. */
export function householdGhostSample(kind: HouseholdGhostKind): HouseholdGhostSample {
  if (kind === 'kid') {
    return {
      name: 'Sam',
      summary: 'a kid — ½ portion, allergic to peanuts',
      portionFactor: 0.5,
      isKid: true,
      allergies: ['peanuts'],
      dietaryRestrictions: [],
    };
  }
  return {
    name: 'Alex',
    summary: 'vegetarian, a full portion',
    portionFactor: 1,
    isKid: false,
    allergies: [],
    dietaryRestrictions: ['Vegetarian'],
  };
}

// ─── Onboarding progress label (audit: counter grew 4 → 5) ────────────────────

export interface OnboardingProgress {
  /** "Step 1" on the intent question, else "Step 2 of 5". */
  label: string;
  /** Known once the intent question is behind the user; null before. */
  total: number | null;
  /** 0–100, or null while the total is unknown (render a neutral bar). */
  percent: number | null;
}

/**
 * The step counter for the onboarding wizard. The total depends on the
 * intent answer (households get an extra step, gym-goers stop after it), so
 * while the question is on screen the counter shows "Step 1" with no total
 * and no percentage — it never reads "1 of 4" and then "2 of 5".
 * `index` is 0-based into `steps`.
 */
export function onboardingProgress(
  steps: readonly OnboardingStepKey[],
  index: number,
): OnboardingProgress {
  const total = Math.max(1, steps.length);
  const i = Math.min(Math.max(0, index), total - 1);
  // 'jobs' (v3) is 'intent's replacement — same "unanswered, total unknown"
  // treatment while it's the step on screen.
  if (steps[i] === 'intent' || steps[i] === 'jobs') {
    return { label: `Step ${i + 1}`, total: null, percent: null };
  }
  return {
    label: `Step ${i + 1} of ${total}`,
    total,
    percent: Math.round(((i + 1) / total) * 100),
  };
}

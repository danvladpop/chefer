import {
  PLAN_FEATURES,
  type FeatureAccess,
  type FeatureFlags,
  type OnboardingJob,
  type PlanFeatureKey,
  type PremiumJobId,
} from '@chefer/types';

// ─── Premium pitch registry (technical-plan.md §2.7, T-10.1, UX-10) ────────────
// The job-led paywall's single copy source, shared by mobile's PremiumSheet /
// LockedFeatureCard and web's upgrade dialog + /premium page. Every place that
// offers Premium passes a `source`; `premiumPitchFor(source)` answers with the
// JOB that source unlocks — headline, lede and up to three bullets — never the
// generic "AI meal plans" pitch (B-32).
//
// Rules the registry enforces (and premium-pitch.test.ts guards):
//   - A bullet only renders when its feature is live: `feature` is a
//     PlanFeatureKey whose premium tier is actually granted, or 'planned'
//     (never rendered). A flag can retire a bullet (`hiddenWhenFlag`) once the
//     thing it promises becomes free. So a pitch can never promise an unbuilt
//     feature (UX-25 rule).
//   - No price, currency, checkout, card or "buy" wording, and nothing that
//     implies a future price or payment method — Premium is an included
//     toggle and the iOS build must carry no purchase path (App Review 3.1.1,
//     R-04). The terms paragraph only says it is included at no cost.
//   - No "beta" in user-facing copy (App Review 2.2) — "included".
//   - The gym stays free (D-11): the Train pitch says so, and no bullet ever
//     sells gym features as Premium.
// Scanned by `chefer/no-forbidden-copy` and the belt-and-braces test in
// `copy-lint.test.ts` (which reads PREMIUM_PITCH_COPY).

// ─── Static copy ───────────────────────────────────────────────────────────────

export const PREMIUM_PITCH_COPY = {
  eyebrow: 'PREMIUM',
  alsoIncluded: 'Also included',
  dailyAllowanceSuffix: '(daily allowance)',
  termsHeading: 'INCLUDED',
  termsBody: 'Premium is included at no cost. Turning it on unlocks everything listed above.',
  turnOn: 'Turn on Premium',
  notNow: 'Not now',
  successTitle: 'Premium is on',
  successLead: 'You now have:',
  later: 'Later',
  errorBody: "Couldn't turn on Premium. Nothing has changed.",
  tryAgain: 'Try again',
  seeWhatPremiumAdds: 'See what Premium adds',
  importFreePath: 'Or type it in yourself',
  budgetReadOnlyHelper: 'Saving a weekly budget is part of Premium.',
  planFreeTitle: 'Your plan: Free',
  planFreeBody:
    'Free includes the gym log, weekly plans from our recipes, allergy checks on every plan and your shopping list.',
  planPremiumTitle: 'Your plan: Premium',
  planPremiumNote: 'Included',
  planWhatYouHave: 'What you have',
  switchBackToFree: 'Switch back to Free',
  downgradeTitle: 'Switch back to Free?',
  downgradeKeep: "You'll keep your plans, recipes, ratings, logs and workouts.",
  downgradeLose: "You'll lose:",
  downgradeConfirm: 'Switch to Free',
  downgradeCancel: 'Keep Premium',
  downgradeDone: "You're on Free. Your data is all still here.",
  allowancesTitle: 'Daily AI allowances',
  snapTasteTitle: 'Snap to log',
  snapTasteBody: 'Photograph a restaurant meal and get an estimate in seconds.',
  snapTasteExampleLabel: 'Example',
  snapTasteExampleMacros: '~620 kcal · 40 g protein',
  snapTasteExampleNote: '"dressing included"',
} as const;

export type PremiumPitchCopyKey = keyof typeof PREMIUM_PITCH_COPY;

// ─── Sources → jobs ─────────────────────────────────────────────────────────────

/** Every job a pitch can still headline (everything but the retired `pantry`). */
type LivePitchJobId = Exclude<PremiumJobId, 'pantry'>;

// `pantry` is retired (WP-24 / FB7-10, "In my kitchen" is gone): the source and
// the `pantry` job id stay valid for analytics and old callers, but a pantry
// source no longer maps to a job, so it gets the default pitch.
const SOURCE_JOB: Record<string, LivePitchJobId> = {
  household: 'household',
  'recipe-import': 'recipe-import',
  'training-day': 'training',
  'training-week': 'training',
  budget: 'budget',
  'shopping-list': 'budget',
  'chat-locked': 'chat',
  'chat-quota': 'chat',
  'snap-scan': 'snap-scan',
  'ingredient-autofill': 'ingredient-autofill',
  'pool-exhaustion': 'pool-exhausted',
  swap: 'swap',
  'coach-review': 'coaching',
  'preferences-locked': 'targets',
};

// ─── Job table ──────────────────────────────────────────────────────────────────

/** Values a source can fill into its copy; every one optional, with a generic fallback. */
export interface PremiumPitchContext {
  /** People at the table, the user included. */
  tableSize?: number | undefined;
  /** A kid's name, for "Luca's ½ counted". */
  kidName?: string | undefined;
  /** The user's weekly budget, already formatted ("€60"). */
  budgetAmount?: string | undefined;
  /** Their training days, already formatted ("Tue and Sat"). */
  trainingDays?: string | undefined;
}

interface PitchBullet {
  text: (ctx: PremiumPitchContext) => string;
  /** The PlanFeatureKey that makes this true, or 'planned' (never rendered). */
  feature: PlanFeatureKey | 'planned';
  /** True when the bullet reassures ("stays free") instead of selling: it needs the FREE tier. */
  freeClaim?: boolean;
  /** Retire the bullet when this flag makes its promise free for everyone. */
  hiddenWhenFlag?: keyof FeatureFlags;
}

interface PitchJob {
  headline: (ctx: PremiumPitchContext) => string;
  lede: string;
  bullets: readonly PitchBullet[];
  /** Whether the job runs on a daily AI allowance. */
  ai?: boolean;
}

const b = (
  text: string | ((ctx: PremiumPitchContext) => string),
  feature: PitchBullet['feature'],
  extra: Partial<Omit<PitchBullet, 'text' | 'feature'>> = {},
): PitchBullet => ({ text: typeof text === 'string' ? () => text : text, feature, ...extra });

const JOBS: Record<LivePitchJobId, PitchJob> = {
  household: {
    headline: (c) =>
      c.tableSize && c.tableSize > 1
        ? `Keep portions for your table of ${c.tableSize}`
        : 'Keep portions right for your table',
    lede: "Premium sizes every recipe, the list and the week's cost to everyone you cook for.",
    bullets: [
      b((c) => {
        const base =
          c.tableSize && c.tableSize > 1
            ? `Recipes scaled to ${c.tableSize} portions`
            : 'Recipes scaled to everyone at your table';
        return c.kidName ? `${base} — ${c.kidName}'s ½ counted` : base;
      }, 'householdPlans'),
      b('One shopping list with amounts for everyone', 'householdPlans'),
      b("The week's cost for the whole table", 'householdPlans'),
    ],
  },
  'recipe-import': {
    headline: () => 'Turn your saved links and videos into recipes',
    lede: 'Premium reads a recipe from a link, pasted text or a cooking video and saves it to your collection.',
    bullets: [
      b('Import from a link, pasted text or a cooking video', 'recipeImport'),
      b('Check what we understood before you save', 'recipeImport'),
      b('Adapted to your allergies and your table', 'recipeImport'),
    ],
    ai: true,
  },
  training: {
    headline: () => 'A week built around your training days',
    // Training-day targets are free (WP-07: no AI); Premium sells the AI week.
    lede: 'Your training-day targets are free. Premium also builds the whole week around your sessions.',
    bullets: [
      b(
        (c) =>
          c.trainingDays
            ? `A week with protein-rich meals on ${c.trainingDays}`
            : 'A week with protein-rich meals on your training days',
        'aiMealPlans',
      ),
      b('Re-planned when your training days change', 'planned'),
      b('Refuel snacks that fit your allergies', 'planned'),
    ],
  },
  budget: {
    headline: () => 'Weeks that fit your budget',
    lede: 'Premium plans your week to stay under the amount you set.',
    bullets: [
      b(
        (c) =>
          c.budgetAmount
            ? `Plans built to stay under ${c.budgetAmount} a week`
            : 'Plans built to stay under your weekly budget',
        'budgetAwarePlanning',
      ),
      b('Your weekly budget saved and used for every plan', 'budgetAwarePlanning', {
        hiddenWhenFlag: 'budgetFree',
      }),
      b('Cheaper swaps when a week runs over', 'planned'),
    ],
  },
  chat: {
    headline: () => 'Ask the chef',
    lede: 'The chef can change your plan, log what you ate and import recipes for you.',
    bullets: [
      b('Swap a meal and your plan and list update', 'chatMessagesPerDay'),
      b('Say what you ate and it is logged', 'chatMessagesPerDay'),
      b('Paste a recipe and it is imported for you', 'chatMessagesPerDay'),
    ],
    ai: true,
  },
  'snap-scan': {
    headline: () => 'Log a meal with a photo',
    lede: 'Premium reads a photo of your plate and estimates what is in it.',
    bullets: [
      b('Snap a plate, get an estimate', 'photoLogging'),
      b("Review it before it's logged", 'photoLogging'),
      b('Counts toward your day', 'photoLogging'),
    ],
    ai: true,
  },
  'ingredient-autofill': {
    headline: () => 'Fill in nutrition in one tap',
    lede: 'Premium estimates the calories and macros of an ingredient you add. Typing the values yourself stays free.',
    bullets: [
      b('Estimate calories and macros from the name', 'aiNutritionEstimatesPerDay'),
      b('Check and adjust the numbers before you save', 'aiNutritionEstimatesPerDay'),
    ],
    ai: true,
  },
  'pool-exhausted': {
    headline: () => 'A week built around your restrictions',
    lede: "Our recipes can't fill this week around your restrictions. Premium builds a plan around them.",
    bullets: [
      b('A week generated from your goals and preferences', 'aiMealPlans'),
      b('Your allergies and restrictions still apply to every meal', 'safetyPreferences', {
        freeClaim: true,
      }),
    ],
    ai: true,
  },
  swap: {
    headline: () => 'Swap a meal for one that fits',
    lede: 'Premium finds an alternative that fits your macros, not just the next one on the list.',
    bullets: [b('AI alternatives that fit your macros', 'aiMealSwaps')],
    ai: true,
  },
  coaching: {
    headline: () => 'Targets that follow your progress',
    lede: 'Premium reviews your week and adjusts your calorie target the way a coach would.',
    bullets: [
      b('A weekly review of what you ate and your weight trend', 'adaptiveCoaching'),
      b('Your calorie target adjusts with it', 'adaptiveCoaching'),
    ],
  },
  targets: {
    headline: () => 'Plans built around your own targets',
    lede: 'Premium builds every plan around the goal, body metrics and calories you set.',
    bullets: [
      b('Your goal, body metrics and calorie target', 'profilePersonalisation'),
      b('Every plan built around them', 'profilePersonalisation'),
    ],
  },
  default: {
    headline: () => 'Your week, ready every Monday',
    lede: 'Premium plans next week for you before it starts.',
    bullets: [
      b('A new week planned for you every Sunday', 'weeklyAutoGeneration'),
      b('Built around your table, budget and training days', 'aiMealPlans'),
      b('Keeps the meals you rated highly', 'weeklyAutoGeneration'),
    ],
  },
  'gym-first': {
    headline: () => 'Food that fits your training week',
    lede: 'Premium plans your meals around your sessions. The gym and your training-day targets stay free.',
    bullets: [
      b('A week of meals planned around your sessions', 'aiMealPlans'),
      b('Everything in the gym stays free', 'gymTraining', { freeClaim: true }),
    ],
  },
};

/** One row of "Also included": a live premium job, one line, AI ones last. */
const ALSO_INCLUDED: readonly { job: LivePitchJobId; line: string; feature: PlanFeatureKey }[] = [
  { job: 'household', line: 'Portions for your table', feature: 'householdPlans' },
  { job: 'training', line: 'A week built around your training', feature: 'aiMealPlans' },
  { job: 'budget', line: 'Plans that fit a weekly budget', feature: 'budgetAwarePlanning' },
  { job: 'default', line: 'Your week, ready every Monday', feature: 'weeklyAutoGeneration' },
  { job: 'coaching', line: 'Targets that adapt to your progress', feature: 'adaptiveCoaching' },
  { job: 'recipe-import', line: 'Recipe import', feature: 'recipeImport' },
  { job: 'chat', line: 'The AI chef', feature: 'chatMessagesPerDay' },
  { job: 'snap-scan', line: 'Photo meal logging', feature: 'photoLogging' },
  { job: 'swap', line: 'AI meal swaps', feature: 'aiMealSwaps' },
  {
    job: 'ingredient-autofill',
    line: 'Nutrition auto-fill',
    feature: 'aiNutritionEstimatesPerDay',
  },
];

// ─── Availability ───────────────────────────────────────────────────────────────

/** Whether Premium really grants `feature` right now (matrix). */
// Takes the widened type on purpose: the matrix is `as const`, so today's
// literals would make a `!== false` check statically constant — the point is
// to notice the day a tier's access flips.
const granted = (access: FeatureAccess): boolean => access !== false && access !== 0;

function featureLive(feature: PlanFeatureKey): boolean {
  return granted(PLAN_FEATURES[feature].premium);
}

/** A bullet renders only when its feature is live and no flag has made it free. */
export function isBulletAvailable(
  bullet: {
    feature: PlanFeatureKey | 'planned';
    freeClaim?: boolean | undefined;
    hiddenWhenFlag?: keyof FeatureFlags | undefined;
  },
  flags: FeatureFlags = {},
): boolean {
  if (bullet.feature === 'planned') return false;
  if (bullet.hiddenWhenFlag && flags[bullet.hiddenWhenFlag] === true) return false;
  if (bullet.freeClaim) return granted(PLAN_FEATURES[bullet.feature].free);
  return featureLive(bullet.feature);
}

// ─── The pitch ──────────────────────────────────────────────────────────────────

export interface PremiumPitch {
  source: string;
  job: PremiumJobId;
  headline: string;
  lede: string;
  /** Live bullets only, at most three. */
  bullets: string[];
  /** Other live premium jobs, one line each; AI jobs last and marked. */
  alsoIncluded: string[];
  /** Whether this job runs on a daily AI allowance. */
  ai: boolean;
  terms: { heading: string; body: string };
}

export interface PremiumPitchOptions {
  /** The user's effective jobs; a Train user gets the gym-first default. */
  jobs?: readonly OnboardingJob[] | undefined;
  flags?: FeatureFlags | undefined;
  context?: PremiumPitchContext | undefined;
}

/** The job a source is headlined by (an unknown source → gym-first for Train users, else default). */
export function premiumJobFor(
  source: string | null | undefined,
  jobs: readonly OnboardingJob[] = [],
): LivePitchJobId {
  const mapped = source ? SOURCE_JOB[source] : undefined;
  if (mapped) return mapped;
  return jobs.includes('TRAIN') ? 'gym-first' : 'default';
}

export function premiumPitchFor(
  source: string | null | undefined,
  options: PremiumPitchOptions = {},
): PremiumPitch {
  const flags = options.flags ?? {};
  const context = options.context ?? {};
  const job = premiumJobFor(source, options.jobs);
  const def = JOBS[job];

  const bullets = def.bullets
    .filter((bullet) => isBulletAvailable(bullet, flags))
    .slice(0, 3)
    .map((bullet) => bullet.text(context));

  const rows = ALSO_INCLUDED.filter((r) => r.job !== job && featureLive(r.feature));
  const isAi = (jobId: LivePitchJobId) => JOBS[jobId].ai === true;
  const alsoIncluded = [
    ...rows.filter((r) => !isAi(r.job)).map((r) => r.line),
    ...rows
      .filter((r) => isAi(r.job))
      .map((r) => `${r.line} ${PREMIUM_PITCH_COPY.dailyAllowanceSuffix}`),
  ];

  return {
    source: source ?? 'profile',
    job,
    headline: def.headline(context),
    lede: def.lede,
    bullets,
    alsoIncluded,
    ai: def.ai === true,
    terms: { heading: PREMIUM_PITCH_COPY.termsHeading, body: PREMIUM_PITCH_COPY.termsBody },
  };
}

/** Every string a pitch can render (all jobs, no context) — for the copy lint. */
export function allPitchStrings(): string[] {
  const out: string[] = [];
  for (const def of Object.values(JOBS)) {
    out.push(def.headline({}), def.lede);
    for (const bullet of def.bullets) out.push(bullet.text({}));
  }
  for (const row of ALSO_INCLUDED) out.push(row.line);
  return out;
}

/** Every job's bullets with their availability inputs — for the tests. */
export function pitchBulletsForTests(): {
  job: LivePitchJobId;
  text: string;
  feature: PlanFeatureKey | 'planned';
}[] {
  return (Object.entries(JOBS) as [LivePitchJobId, PitchJob][]).flatMap(([job, def]) =>
    def.bullets.map((bullet) => ({ job, text: bullet.text({}), feature: bullet.feature })),
  );
}

// ─── Snap taste (T-10.6, bug B-35) ──────────────────────────────────────────────

const FOOD_JOBS: readonly OnboardingJob[] = [
  'PLAN_MEALS',
  'HOUSEHOLD',
  'USE_WHAT_I_HAVE',
  'SAVED_RECIPES',
  'TRACK',
];

/** True when any of the user's jobs is about food (not only Train). */
export function hasFoodJob(jobs: readonly OnboardingJob[]): boolean {
  return jobs.some((job) => FOOD_JOBS.includes(job));
}

/**
 * Snap to log on a FREE plan is a taste, not a hole: a static example and
 * "See what Premium adds". Shown to food-job users only — a gym-only user
 * never sees it, and while jobs are unknown ([]) nothing is assumed.
 */
export function showSnapTaste(input: {
  isPremium: boolean | undefined;
  jobs: readonly OnboardingJob[];
}): boolean {
  return input.isPremium === false && hasFoodJob(input.jobs);
}

// ─── Downgrade summary (T-10.3, UX-10 §4) ───────────────────────────────────────

export interface DowngradeUsage {
  /** Household members (the table is bigger than 1 → portion scaling in use). */
  members: number;
  /** Today's AI plan generations (`getAiUsage.aiMealPlans`). */
  aiMealPlans: number;
  /** Today's import previews. */
  imports: number;
  chatMessages: number;
  scans: number;
}

/**
 * "You'll lose:" — only the Premium jobs this user actually used, so the
 * confirmation names real things instead of listing the whole matrix. Their
 * data (plans, recipes, ratings, logs, workouts) is never on this list:
 * downgrading keeps it all.
 */
export function downgradeLosses(usage: DowngradeUsage): string[] {
  const lines: string[] = [];
  if (usage.members > 0) lines.push('Portions for your table — plans go back to 1 portion');
  if (usage.imports > 0) lines.push('Recipe import');
  if (usage.chatMessages > 0) lines.push('The AI chef');
  if (usage.scans > 0) lines.push('Photo meal logging');
  if (usage.aiMealPlans > 0)
    lines.push('Weeks the chef builds around you — plans come from our recipes');
  return lines;
}

// Onboarding V4 (flag `onboardingV4`, docs/onboarding-review-2026-10) — the
// short, Biscuit-led setup. Everything both platforms must agree on lives
// here: which steps a user sees, the tiles, the quick allergy chips, the
// inferred activity level and every string (one copy table, so mobile and web
// can't drift; scanned by `chefer/no-forbidden-copy`).

import type { GoalValue as Goal, OnboardingJob } from '@chefer/types';
import type { BiscuitLoop } from './biscuit/loops';
import {
  classifySafetyValue,
  serialiseSafetyPickerValue,
  type SafetyPickerValue,
} from './safety-classify';

export type OnboardingV4Step =
  | 'jobs'
  | 'goal'
  | 'aboutYou'
  | 'safety'
  | 'building'
  | 'ready'
  | 'reminders'
  | 'premium'
  | 'train';

/** Steps that ask something — the segments of the progress bar. */
export const ONBOARDING_V4_QUESTION_STEPS: readonly OnboardingV4Step[] = [
  'jobs',
  'goal',
  'aboutYou',
  'safety',
];

/** Jobs that mean "plan my food" (they get the first-week reveal). */
const PLAN_JOBS: readonly OnboardingJob[] = ['PLAN_MEALS', 'HOUSEHOLD'];
/** Jobs that need the allergy question. */
const FOOD_JOBS: readonly OnboardingJob[] = ['PLAN_MEALS', 'HOUSEHOLD', 'TRACK'];

/**
 * The ordered steps for these answers. Premium users skip the Premium step.
 * `offerReminders` (lane E1) adds "Remind me at mealtimes?" for food jobs —
 * the phone only: web can't send local notifications, so it never asks.
 */
export function onboardingV4Steps({
  jobs,
  isPremium,
  offerReminders = false,
}: {
  jobs: readonly OnboardingJob[];
  isPremium: boolean;
  offerReminders?: boolean;
}): OnboardingV4Step[] {
  const food = jobs.some((j) => FOOD_JOBS.includes(j));
  const plans = jobs.some((j) => PLAN_JOBS.includes(j));
  return [
    'jobs',
    'goal',
    'aboutYou',
    ...(food ? (['safety'] as const) : []),
    ...(plans ? (['building', 'ready'] as const) : []),
    ...(food && offerReminders ? (['reminders'] as const) : []),
    ...(isPremium ? [] : (['premium'] as const)),
    ...(jobs.includes('TRAIN') ? (['train'] as const) : []),
  ];
}

/** Progress for a step: which question segment is current (1-based) of how many. */
export function onboardingV4Progress(
  step: OnboardingV4Step,
  steps: readonly OnboardingV4Step[],
): { current: number; total: number } | null {
  const questions = steps.filter((s) => ONBOARDING_V4_QUESTION_STEPS.includes(s));
  const index = questions.indexOf(step);
  return index < 0 ? null : { current: index + 1, total: questions.length };
}

/** Every step in flow order — what `onboardingV4ResumeStep` measures "later" against. */
export const ONBOARDING_V4_STEP_ORDER: readonly OnboardingV4Step[] = [
  'jobs',
  'goal',
  'aboutYou',
  'safety',
  'building',
  'ready',
  'reminders',
  'premium',
  'train',
];

/**
 * Where a saved V4 draft resumes (UX-ONB-01: a killed app or "Leave for now"
 * comes back to the step the user was on). The reveal holds no saved plan, so
 * 'building'/'ready' resume at 'building' until a plan was built, then past
 * the reveal. A step that is no longer in the flow (Premium after upgrading)
 * resumes at the next one that is. `null` = nothing left to ask: finish.
 */
export function onboardingV4ResumeStep(
  saved: OnboardingV4Step,
  steps: readonly OnboardingV4Step[],
  planBuilt: boolean,
): OnboardingV4Step | null {
  let from = saved;
  if (saved === 'building' || saved === 'ready') {
    if (!planBuilt && steps.includes('building')) return 'building';
    from = 'reminders';
  }
  if (steps.includes(from)) return from;
  const after = ONBOARDING_V4_STEP_ORDER.indexOf(from);
  return steps.find((s) => ONBOARDING_V4_STEP_ORDER.indexOf(s) > after) ?? null;
}

export type OnboardingV4Icon =
  | 'calendar'
  | 'barbell'
  | 'pie'
  | 'people'
  | 'scale'
  | 'leaf'
  | 'restaurant';

export const ONBOARDING_V4_JOB_TILES: readonly {
  job: OnboardingJob;
  label: string;
  icon: OnboardingV4Icon;
}[] = [
  { job: 'PLAN_MEALS', label: 'Plan my meals', icon: 'calendar' },
  { job: 'TRAIN', label: 'Train', icon: 'barbell' },
  { job: 'TRACK', label: 'Track food', icon: 'pie' },
  { job: 'HOUSEHOLD', label: 'Feed my family', icon: 'people' },
];

/** `goal: null` = "Just good food" (no calorie target). */
export const ONBOARDING_V4_GOAL_TILES: readonly {
  goal: Goal | null;
  label: string;
  icon: OnboardingV4Icon;
  loop: BiscuitLoop;
}[] = [
  { goal: 'LOSE_WEIGHT', label: 'Lose weight', icon: 'scale', loop: 'goalLose' },
  { goal: 'GAIN_MUSCLE', label: 'Build muscle', icon: 'barbell', loop: 'goalMuscle' },
  { goal: 'EAT_HEALTHIER', label: 'Eat healthier', icon: 'leaf', loop: 'goalHealthy' },
  { goal: null, label: 'Just good food', icon: 'restaurant', loop: 'goalFood' },
];

export type OnboardingV4ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHTLY_ACTIVE'
  | 'MODERATELY_ACTIVE'
  | 'VERY_ACTIVE'
  | 'ATHLETE';

/**
 * V4 asks for training days instead of an activity level. Days unknown (the
 * user doesn't train with Chefer) → lightly active, the honest middle.
 */
export function activityFromTrainingDays(days: number | null): OnboardingV4ActivityLevel {
  if (days === null || days <= 0) return 'LIGHTLY_ACTIVE';
  if (days <= 2) return 'LIGHTLY_ACTIVE';
  if (days <= 4) return 'MODERATELY_ACTIVE';
  if (days <= 6) return 'VERY_ACTIVE';
  return 'ATHLETE';
}

/** The gym program's days a week (the API takes 2–6). No days picked → 3. */
export function programDaysFromWeekdays(weekdays: readonly number[]): number {
  if (weekdays.length === 0) return 3;
  return Math.max(2, Math.min(6, weekdays.length));
}

// ─── Anything you can't eat? ───────────────────────────────────────────────

export const ONBOARDING_V4_QUICK_SAFETY: readonly {
  key: string;
  label: string;
  /** Taxonomy ids it sets — a base diet, or one or more allergies. */
  diet?: 'vegetarian' | 'vegan';
  allergies?: readonly string[];
}[] = [
  { key: 'vegetarian', label: 'Vegetarian', diet: 'vegetarian' },
  { key: 'vegan', label: 'Vegan', diet: 'vegan' },
  { key: 'nuts', label: 'Nuts', allergies: ['tree-nuts'] },
  { key: 'peanuts', label: 'Peanuts', allergies: ['peanuts'] },
  { key: 'dairy', label: 'Dairy', allergies: ['dairy'] },
  { key: 'gluten', label: 'Gluten', allergies: ['gluten'] },
  { key: 'eggs', label: 'Eggs', allergies: ['egg'] },
  { key: 'fish', label: 'Fish & shellfish', allergies: ['fish', 'shellfish'] },
];

export const EMPTY_SAFETY_VALUE: SafetyPickerValue = {
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
};

/** "I eat everything": nothing in any list. */
export function eatsEverything(value: SafetyPickerValue): boolean {
  return (
    value.allergies.length + value.dietaryRestrictions.length + value.dislikedIngredients.length ===
    0
  );
}

function quickChip(key: string) {
  const chip = ONBOARDING_V4_QUICK_SAFETY.find((c) => c.key === key);
  if (!chip) throw new Error(`Unknown quick safety chip "${key}"`);
  return chip;
}

export function isQuickSafetyOn(value: SafetyPickerValue, key: string): boolean {
  const chip = quickChip(key);
  const classified = classifySafetyValue(value);
  if (chip.diet) return classified.dietBaseId === chip.diet;
  return (chip.allergies ?? []).every((id) => classified.allergyIds.includes(id));
}

/** Toggles a quick chip, keeping everything else (More options) as it was. */
export function toggleQuickSafety(value: SafetyPickerValue, key: string): SafetyPickerValue {
  const chip = quickChip(key);
  const classified = classifySafetyValue(value);
  const on = isQuickSafetyOn(value, key);
  if (chip.diet) {
    return serialiseSafetyPickerValue({ ...classified, dietBaseId: on ? null : chip.diet });
  }
  const ids = chip.allergies ?? [];
  const allergyIds = on
    ? classified.allergyIds.filter((id) => !ids.includes(id))
    : [...new Set([...classified.allergyIds, ...ids])];
  return serialiseSafetyPickerValue({ ...classified, allergyIds });
}

// ─── Copy ──────────────────────────────────────────────────────────────────

export const ONBOARDING_V4_COPY = {
  welcomeTitle: 'Eat well. Train smart.',
  welcomeLede: 'Your meals, shopping and workouts in one plan.',
  welcomeCaps: ['Plan', 'Shop', 'Scan', 'Train'] as const,
  welcomeStart: 'Get started',
  welcomeHaveAccount: 'I already have an account',
  accountTitle: 'Save your plan',
  accountLede: 'Takes ten seconds.',
  accountEmail: 'Continue with email',
  accountEmailTitle: 'Sign up with email',
  accountAgree: 'I’m 16+ and agree to the Terms and Privacy Policy',
  accountCreate: 'Create account',
  accountHaveAccount: 'Have an account?',
  accountAgreeRequired: 'Tick the box to continue',
  accountSignInInstead: 'Sign in instead',
  jobsTitle: 'What brings you here?',
  jobsLede: 'Pick any.',
  goalTitle: 'What’s your goal?',
  aboutTitle: 'About you',
  aboutTrainOn: 'I train on',
  aboutTarget: 'Your daily target',
  aboutTargetChange: 'Change',
  aboutActivityTitle: 'How active are you?',
  safetyTitle: 'Anything you can’t eat?',
  safetyLede: 'We check every meal against it.',
  safetyEverything: 'I eat everything',
  safetyOrPick: 'Or pick',
  safetyMore: 'More options',
  safetyBuild: 'Build my week',
  safetyContinue: 'Continue',
  buildingTitle: 'Building your week…',
  buildingMeals: (kcal: number | null) =>
    kcal ? `21 meals around ${kcal.toLocaleString('en-GB')} kcal` : 'A week of balanced meals',
  buildingDiet: 'Checked against your diet',
  buildingList: 'Writing your shopping list',
  buildingFailed: 'We couldn’t build your week just now.',
  buildingRetry: 'Try again',
  buildingSkip: 'Skip for now',
  readyTitle: 'Your week is ready',
  readyLede: 'Dinners shown. Breakfast and lunch are in too.',
  readyList: (n: number) => `${n} ${n === 1 ? 'item' : 'items'} on your list`,
  readyContinue: 'Looks good',
  readyLater: 'I’ll tweak it later',
  premiumEyebrow: 'PREMIUM',
  premiumTitle: 'Free for you, for now',
  premiumPerks: [
    'Ask the AI chef',
    'Log meals by photo',
    'Import recipes from videos',
    'Your week, ready every Monday',
  ] as const,
  premiumNote: 'No card. Nothing to cancel.',
  premiumTurnOn: 'Turn on Premium',
  premiumLater: 'Maybe later',
  premiumOnTitle: 'Premium is on',
  premiumOnTicks: ['AI chef', 'Photo meal logging', 'Recipe import', 'Weekly auto-plan'] as const,
  premiumFailed: 'Couldn’t turn on Premium. Nothing has changed.',
  trainTitle: 'Set up training',
  trainExperience: 'Lifting experience',
  trainExperienceNew: 'New or returning',
  trainExperienceExperienced: 'Experienced',
  trainWhere: 'Where you train',
  trainWhereGym: 'Gym',
  trainWhereDumbbells: 'Dumbbells',
  trainWhereBodyweight: 'Bodyweight',
  trainFits: (days: number) => `Fits your ${days} training ${days === 1 ? 'day' : 'days'}`,
  trainChange: 'Change',
  trainStart: 'Start training',
  continue: 'Continue',
  back: 'Back',
  doneTitle: (name: string | null) => (name ? `You’re all set, ${name}!` : 'You’re all set!'),
  doneBodyFood: 'Your week is planned. Open any meal to cook it.',
  doneBodyTrain: 'Your first workout is ready on Train.',
  doneBodyBoth: 'Your week is planned and your first workout is ready.',
  doneDismiss: 'Dismiss',
  leaveTitle: 'Leave setup?',
  leaveBody: 'You can finish it any time from Settings.',
  leaveConfirm: 'Leave',
  leaveCancel: 'Keep going',
} as const;

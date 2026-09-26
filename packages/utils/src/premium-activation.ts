import type { PlanFeatureKey } from '@chefer/types';

// ─── Post-upgrade activation (review P-8; audit F-PREM-1-5, F-PM-9) ──────────
// "Three things to do first" after the tier flips, ordered by what the user
// was looking at when they upgraded (the upgrade `source`) and without steps
// they already did. Shared by web's PostUpgradeActivation and mobile's
// post-upgrade sheet; each platform maps a step key to its own route. A user
// with a profile is never sent to onboarding (F-PM-9).

// Maps each upgrade `source` to the feature keys the user was looking at when
// the upgrade prompt opened (premium_plan.md §6.3). Unknown sources fall back
// to the default order.
export const SOURCE_FEATURE_PRIORITY: Partial<Record<string, PlanFeatureKey[]>> = {
  'meal-plan-banner': ['aiMealPlans', 'weeklyAutoGeneration'],
  'pool-exhaustion': ['aiMealPlans', 'aiMealSwaps'],
  'shopping-list': ['budgetAwarePlanning', 'pantryPlanning'],
  'preferences-locked': ['profilePersonalisation'],
  swap: ['aiMealSwaps'],
  'chat-quota': ['chatMessagesPerDay', 'aiMealPlans'],
  'chat-locked': ['chatMessagesPerDay', 'aiMealPlans'],
  'coach-review': ['adaptiveCoaching'],
  'snap-scan': ['photoLogging', 'adaptiveCoaching'],
  'recipe-import': ['recipeImport'],
  household: ['householdPlans'],
  pantry: ['pantryPlanning', 'budgetAwarePlanning'],
  'post-rating': ['aiMealPlans', 'weeklyAutoGeneration'],
  'monday-nudge': ['weeklyAutoGeneration'],
  'training-day': ['trainingNutrition', 'aiMealPlans'],
};

export type ActivationStepKey = 'profile' | 'household' | 'regenerate' | 'cheferize';

export interface ActivationStepCopy {
  key: ActivationStepKey;
  title: string;
  detail: string;
}

export const ACTIVATION_STEP_COPY: Record<ActivationStepKey, ActivationStepCopy> = {
  profile: {
    key: 'profile',
    title: 'Set your goal & body metrics',
    detail: 'Everything the AI chef builds starts from your target.',
  },
  household: {
    key: 'household',
    title: 'Add your table',
    detail: 'Servings, the shopping list and the week cost now scale to everyone you cook for.',
  },
  regenerate: {
    key: 'regenerate',
    title: 'Regenerate this week',
    detail: 'Turn the chef-picked plan into one built around you.',
  },
  cheferize: {
    key: 'cheferize',
    title: 'Cheferize a favourite recipe',
    detail: 'Paste any link — the chef adapts it to your goals.',
  },
};

/** Which activation step answers each premium perk. */
const STEP_FOR_FEATURE: Partial<Record<PlanFeatureKey, ActivationStepKey>> = {
  householdPlans: 'household',
  profilePersonalisation: 'profile',
  adaptiveCoaching: 'profile',
  aiMealPlans: 'regenerate',
  weeklyAutoGeneration: 'regenerate',
  budgetAwarePlanning: 'regenerate',
  pantryPlanning: 'regenerate',
  recipeImport: 'cheferize',
};

const DEFAULT_ORDER: ActivationStepKey[] = ['profile', 'regenerate', 'cheferize'];

/**
 * Up to three steps: the upgrade source's own first, then the defaults;
 * "Set your goal" disappears once the user has a profile.
 */
export function activationStepKeys(
  source: string | null,
  hasProfile: boolean,
): ActivationStepKey[] {
  const fromSource = (source ? (SOURCE_FEATURE_PRIORITY[source] ?? []) : [])
    .map((feature) => STEP_FOR_FEATURE[feature])
    .filter((key): key is ActivationStepKey => key !== undefined);
  const ordered = [...new Set([...fromSource, ...DEFAULT_ORDER])];
  return ordered.filter((key) => !(key === 'profile' && hasProfile)).slice(0, 3);
}

/** "One thing …" / "Two things …" / "Three things make it worth it immediately:" */
export function activationIntro(stepCount: number): string {
  if (stepCount === 1) return 'One thing makes it worth it immediately:';
  return `${stepCount === 2 ? 'Two' : 'Three'} things make it worth it immediately:`;
}

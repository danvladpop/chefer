import { SOURCE_FEATURE_PRIORITY } from '@/features/premium/premium-features';
import type { PlanFeatureKey } from '@chefer/types';

// ─── Post-upgrade activation steps (review P-8; audit F-PREM-1-5, F-PM-9) ─────
// "Three things to do first", ordered by what the user was looking at when
// they upgraded (the upgrade `source`) and without steps they already did.
// A user with a profile is never sent to /onboarding — it redirects them to
// the dashboard, a dead CTA (F-PM-9).

export type ActivationStepKey = 'profile' | 'household' | 'regenerate' | 'cheferize';

export interface ActivationStep {
  key: ActivationStepKey;
  href: string;
  title: string;
  detail: string;
}

const STEPS: Record<ActivationStepKey, ActivationStep> = {
  profile: {
    key: 'profile',
    href: '/onboarding',
    title: 'Set your goal & body metrics',
    detail: 'Everything the AI chef builds starts from your target.',
  },
  household: {
    key: 'household',
    href: '/preferences#household',
    title: 'Add your table',
    detail: 'Servings, the shopping list and the week cost now scale to everyone you cook for.',
  },
  regenerate: {
    key: 'regenerate',
    href: '/meal-plan',
    title: 'Regenerate this week',
    detail: 'Turn the chef-picked plan into one built around you.',
  },
  cheferize: {
    key: 'cheferize',
    href: '/recipes',
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
export function activationSteps(source: string | null, hasProfile: boolean): ActivationStep[] {
  const fromSource = (source ? (SOURCE_FEATURE_PRIORITY[source] ?? []) : [])
    .map((feature) => STEP_FOR_FEATURE[feature])
    .filter((key): key is ActivationStepKey => key !== undefined);
  const ordered = [...new Set([...fromSource, ...DEFAULT_ORDER])];
  return ordered
    .filter((key) => !(key === 'profile' && hasProfile))
    .slice(0, 3)
    .map((key) => STEPS[key]);
}

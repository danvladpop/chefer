import type { OnboardingIntent } from '@chefer/types';

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

export type OnboardingStepKey = 'intent' | 'table' | 'diet' | 'goal' | 'metrics' | 'cuisine';

/**
 * The onboarding steps for one audience (PM review §5, F-PM-6):
 * - the intent question comes first while it is unanswered,
 * - TRAIN stops after the question — gym setup comes first, food later,
 * - HOUSEHOLD adds "Who's at your table?" before the food steps,
 * - everyone else keeps the tier's food flow (free: diet → goal → metrics;
 *   premium: goal → metrics → diet → cuisine).
 */
export function onboardingSteps({
  intent,
  askIntent,
  isPremium,
}: {
  intent: OnboardingIntent | null;
  /** Show the question (false when the saved profile already has an intent). */
  askIntent: boolean;
  isPremium: boolean;
}): OnboardingStepKey[] {
  const head: OnboardingStepKey[] = askIntent ? ['intent'] : [];
  if (intent === 'TRAIN' && askIntent) return head;
  const food: OnboardingStepKey[] = isPremium
    ? ['goal', 'metrics', 'diet', 'cuisine']
    : ['diet', 'goal', 'metrics'];
  const table: OnboardingStepKey[] = intent === 'HOUSEHOLD' ? ['table'] : [];
  return [...head, ...table, ...food];
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

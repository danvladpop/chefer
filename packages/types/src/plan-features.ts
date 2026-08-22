// ─── Plan feature matrix ──────────────────────────────────────────────────────
// THE single source of truth for what each plan tier gets (launch plan PW-1).
// Product edits THIS file when the matrix changes; enforcement (API
// entitlements, quota checks) and marketing copy (upgrade prompts, perk
// lists) both render from it, so they cannot drift apart.
//
// Access semantics per tier:
//   true   → unlimited access
//   false  → no access
//   number → daily limit (0 would mean no access; prefer `false`)

/** `true` = unlimited, `false` = none, number = daily limit. */
export type FeatureAccess = boolean | number;

export interface PlanFeature {
  free: FeatureAccess;
  premium: FeatureAccess;
  /** Short name, used verbatim in perk lists and upgrade prompts. */
  label: string;
  /** One sentence of user-facing copy explaining the feature. */
  description: string;
  /**
   * Whether upgrade surfaces list this feature as a premium perk. Plumbing
   * entries (pure limits) set false so perk lists stay meaningful.
   */
  upsell: boolean;
}

export const PLAN_FEATURES = {
  aiMealPlans: {
    free: false,
    premium: true,
    label: 'AI meal plans tailored to you',
    description:
      'Weekly plans generated from your goals, body metrics, allergies and preferences — free plans use a chef-curated generic pool.',
    upsell: true,
  },
  profilePersonalisation: {
    free: false,
    premium: true,
    label: 'Personal profile: goals, body metrics, dietary needs',
    description:
      'Set your goal, body metrics, calorie targets, allergies and dietary restrictions, and every plan is built around them.',
    upsell: true,
  },
  aiMealSwaps: {
    free: false,
    premium: 30,
    label: 'AI-powered meal swaps',
    description:
      'Swap any meal for an AI alternative that fits your macros — free swaps draw from the curated pool.',
    upsell: true,
  },
  aiShoppingList: {
    free: false,
    premium: true,
    label: 'AI-consolidated shopping list',
    description:
      'Regenerate your shopping list with AI consolidation — merged quantities, sensible categories.',
    upsell: false,
  },
  planGenerationsPerDay: {
    free: 3,
    premium: 20,
    label: 'Daily plan generations',
    description: 'How many meal plans can be generated per day. Resets at midnight UTC.',
    upsell: false,
  },
  chatMessagesPerDay: {
    // Enforced when the AI chef chat goes live (roadmap P1-4); declared here
    // so the limit ships from the matrix on day one.
    free: 5,
    premium: true,
    label: 'Unlimited AI chef chat',
    description: 'Ask the AI chef anything about your plan — free users get 5 messages a day.',
    upsell: false,
  },
} as const satisfies Record<string, PlanFeature>;

export type PlanFeatureKey = keyof typeof PLAN_FEATURES;

/** Feature keys whose `upsell` flag is set — the canonical premium perk list. */
export const PREMIUM_PERK_KEYS = (Object.keys(PLAN_FEATURES) as PlanFeatureKey[]).filter(
  (key) => PLAN_FEATURES[key].upsell,
);

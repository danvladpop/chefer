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
  safetyPreferences: {
    // Free on purpose (P1-2): allergies and restrictions are safety, not an
    // upsell. Free curated plans are filtered by them; premium AI plans honour
    // them in generation.
    free: true,
    premium: true,
    label: 'Allergies, restrictions & dislikes respected',
    description:
      'Declare allergies, dietary restrictions and disliked ingredients — every plan on every tier avoids them.',
    upsell: false,
  },
  aiMealPlans: {
    free: false,
    premium: true,
    label: 'AI meal plans tailored to you',
    description:
      'Weekly plans generated from your goals, body metrics and preferences — free plans draw from a chef-curated pool filtered by your restrictions.',
    upsell: true,
  },
  profilePersonalisation: {
    free: false,
    premium: true,
    label: 'Personal targets: goals, body metrics, calories',
    description:
      'Set your goal, body metrics and calorie targets, and every plan is built around them.',
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
  budgetAwarePlanning: {
    free: false,
    premium: true,
    label: 'Budget-aware weekly plans',
    description:
      'Set "keep my week under €X" and generation favours affordable meals to stay within it — every tier sees the estimated week cost.',
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
  weeklyAutoGeneration: {
    // Enforced by WeeklyPlanWorker's eligibility query (PW-5) — subscribers
    // only (admins get access-premium, not subscriber perks).
    free: false,
    premium: true,
    label: 'Your week, ready every Monday',
    description:
      'Every Sunday the chef pre-generates next week around your ratings, pins and targets — open the app Monday to a finished plan.',
    upsell: true,
  },
  planGenerationsPerDay: {
    free: 3,
    premium: 20,
    label: 'Daily plan generations',
    description: 'How many meal plans can be generated per day. Resets at midnight UTC.',
    upsell: false,
  },
  chatMessagesPerDay: {
    // Enforced by ChatService.assertChatQuota (P1-4).
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

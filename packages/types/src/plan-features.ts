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
  // ── Premium expansion (premium_plan.md) — keys land in wave 0, features
  //    per wave. Copy is live on upgrade surfaces from day one.
  adaptiveCoaching: {
    free: false,
    premium: true,
    label: 'A chef that adapts to your progress',
    description:
      'Weekly reviews of what you actually ate and how your weight is trending — your calorie targets adjust automatically, like a coach would.',
    upsell: true,
  },
  photoLogging: {
    free: false,
    premium: true,
    label: 'Snap a photo, log the meal',
    description:
      'Photograph any plate and the chef estimates the dish and macros — then quietly rebalances the rest of your week to keep you on track.',
    upsell: true,
  },
  recipeImport: {
    free: false,
    premium: true,
    label: 'Cheferize any recipe from the internet',
    description:
      'Paste a link or snap a cookbook page — the chef imports it, adapts it to your allergies and goals, and slots it into your week.',
    upsell: true,
  },
  householdPlans: {
    free: false,
    premium: true,
    label: 'One plan that feeds the whole table',
    description:
      'Add your partner and kids with their own allergies and portions — plans, servings and the shopping list scale for everyone.',
    upsell: true,
  },
  pantryPlanning: {
    free: false,
    premium: true,
    label: 'Plans that cook from your pantry',
    description:
      'Chefer remembers what you bought and plans around it — fewer duplicates, visible savings, zero-waste weeks.',
    upsell: true,
  },
  mealScansPerDay: {
    // Enforced via AiCallLog type SCAN (F4). Pure limit plumbing.
    free: false,
    premium: 10,
    label: 'Daily photo meal scans',
    description: 'How many meal photos can be analysed per day. Resets at midnight UTC.',
    upsell: false,
  },
  recipeImportsPerDay: {
    // Enforced via AiCallLog type RECIPE_IMPORT (F5). Free tier gets one
    // extraction preview a day (the §6.4 ghost state); premium gets the
    // full import + Cheferize flow.
    free: 1,
    premium: 5,
    label: 'Daily recipe imports',
    description: 'How many recipes can be imported per day. Resets at midnight UTC.',
    upsell: false,
  },
  householdMembers: {
    // Cap on HouseholdMember rows per user (F2). Pure limit plumbing.
    free: false,
    premium: 5,
    label: 'Household members',
    description: 'How many household members can share your plan.',
    upsell: false,
  },
} as const satisfies Record<string, PlanFeature>;

export type PlanFeatureKey = keyof typeof PLAN_FEATURES;

/** Feature keys whose `upsell` flag is set — the canonical premium perk list. */
export const PREMIUM_PERK_KEYS = (Object.keys(PLAN_FEATURES) as PlanFeatureKey[]).filter(
  (key) => PLAN_FEATURES[key].upsell,
);

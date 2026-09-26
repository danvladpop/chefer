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
    // Per-user AI is premium-only (owner decision 2026-09-25): free users see
    // a locked chat preview. Enforced by reserveChatMessage (lib/quotas.ts).
    free: false,
    premium: true,
    label: 'AI chef chat',
    description:
      'Ask the AI chef anything — it can swap meals, log what you ate and import recipes for you.',
    upsell: true,
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
    // Enforced via AiCallLog type RECIPE_IMPORT (F5). Premium-only since
    // 2026-09-25 (per-user AI is premium): free users see a canned example.
    free: false,
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
  gymTraining: {
    // Free on purpose (gym_plan.md D9): the whole gym side — library, routines,
    // offline logging, progression and stats — is free on every tier. A future
    // premium gym tier is an edit to THIS entry, nothing else.
    free: true,
    premium: true,
    label: 'Gym training & progressive overload',
    description:
      'Exercise library with technique videos, editable routines, offline workout logging and week-over-week progression suggestions.',
    upsell: false,
  },
  aiNutritionEstimatesPerDay: {
    // "Auto-fill with AI" on the custom-ingredient form — per-user AI, so
    // premium-only; it used to be an ungated AI call (audit F-PAN-2-4).
    // Enforced via AiCallLog type INGREDIENT_PRICES.
    free: false,
    premium: 30,
    label: 'AI nutrition auto-fill',
    description: "Estimate a custom ingredient's nutrition with AI.",
    upsell: false,
  },
} as const satisfies Record<string, PlanFeature>;

export type PlanFeatureKey = keyof typeof PLAN_FEATURES;

/** Feature keys whose `upsell` flag is set — the canonical premium perk list. */
export const PREMIUM_PERK_KEYS = (Object.keys(PLAN_FEATURES) as PlanFeatureKey[]).filter(
  (key) => PLAN_FEATURES[key].upsell,
);

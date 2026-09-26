import type { LucideIcon } from 'lucide-react';
import {
  CalendarCheck,
  CalendarDays,
  Camera,
  Dumbbell,
  Link2,
  RefreshCw,
  Refrigerator,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { PlanFeatureKey } from '@chefer/types';

// ─── /premium feature-card registry (premium_plan.md §6.2) ────────────────────
// One entry per SHIPPED premium pillar — copy comes from the PLAN_FEATURES
// matrix (label/description); this file only adds presentation (icon, order).
//
// REGISTRY FILE for wave agents: when your feature ships, append your card
// here and remove your key from COMING_SOON_KEYS. Adjacent-line conflicts at
// integration are expected and mechanical.

export interface PremiumFeatureCard {
  key: PlanFeatureKey;
  icon: LucideIcon;
}

export const PREMIUM_FEATURE_CARDS: PremiumFeatureCard[] = [
  { key: 'aiMealPlans', icon: CalendarDays },
  { key: 'profilePersonalisation', icon: Target },
  { key: 'aiMealSwaps', icon: RefreshCw },
  { key: 'budgetAwarePlanning', icon: Wallet },
  { key: 'weeklyAutoGeneration', icon: CalendarCheck },
  { key: 'adaptiveCoaching', icon: TrendingUp },
  { key: 'photoLogging', icon: Camera },
  { key: 'recipeImport', icon: Link2 },
  { key: 'householdPlans', icon: Users },
  { key: 'pantryPlanning', icon: Refrigerator },
  { key: 'trainingNutrition', icon: Dumbbell },
];

/** Matrix keys announced on /premium as "cooking now" until their wave lands. */
export const COMING_SOON_KEYS: PlanFeatureKey[] = [];

/**
 * Free-column labels for the comparison table (review P-4): where the free
 * tier has a real (lesser) equivalent, name it instead of showing a dash —
 * a FREE column that opens with three "—"s reads as "free gets nothing".
 * Marketing copy only; the PLAN_FEATURES matrix stays the enforcement truth.
 */
export const FREE_EQUIVALENT_LABELS: Partial<Record<PlanFeatureKey, string>> = {
  aiMealPlans: 'Chef-curated',
  profilePersonalisation: 'Stored, shown on your dashboard',
  aiMealSwaps: 'Curated swaps',
  aiShoppingList: 'Standard list',
  photoLogging: 'Manual quick-add',
  trainingNutrition: 'Protein from your bodyweight',
  // Members and their allergies are free (P2-3); only the scaling is premium.
  householdPlans: 'Members + their allergies',
};

// ── Source-aware perk ordering (upgrade dialog v2, premium_plan.md §6.3) ──
// Maps each upgrade `source` to the feature keys the user was looking at when
// the dialog opened; those perks render first, expanded. Pure presentation —
// unknown sources fall back to the default matrix order.
// Lives in @chefer/utils so mobile's post-upgrade sheet orders steps the same.
export { SOURCE_FEATURE_PRIORITY } from '@chefer/utils';

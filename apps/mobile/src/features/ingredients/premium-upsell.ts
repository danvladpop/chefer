import { router } from 'expo-router';

// ─── Premium upsell entry point (T-40.8, UX-40 slice 2) ────────────────────
// L-MONEY is building the job-led `PremiumSheet` / `openPremium(source)`
// (PAT-3, technical-plan.md §2.3) in parallel this wave — `PremiumSheet`
// (apps/mobile/src/features/premium/premium-sheet.tsx) is still a UI shell
// waiting on L-MONEY's copy and `onTurnOnPremium` wiring, so it isn't ready
// to open directly yet.
//
// Until then this mirrors the ONE upsell entry point that already works
// today elsewhere in the app (see apps/mobile/app/import-recipe.tsx's locked
// state): push the existing `/profile` screen with an upgrade `source`
// query param, which the Profile plan card reads to show the right pitch.
//
// Isolated here as a single function so swapping it for the real
// `openPremium('ingredient-autofill')` later is a one-line change at the
// two call sites (custom-ingredient-sheet.tsx) — nothing else needs to know
// which mechanism is behind it.
export function openIngredientAutofillUpsell(): void {
  router.push({ pathname: '/profile', params: { source: 'ingredient-autofill' } });
}

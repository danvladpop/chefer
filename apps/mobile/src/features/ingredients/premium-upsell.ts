import { openPremium } from '../premium/open-premium';

// ─── Premium upsell entry point (T-40.8, T-40.11, UX-40 slice 2) ────────────
// "Fill in for me" on a free account opens the job-led premium sheet with
// source `ingredient-autofill` (the pitch entry lives in
// packages/utils/src/premium-pitch.ts). Kept as one function so the custom
// ingredient sheet does not need to know which mechanism is behind it.
//
// iOS presents a Modal from the view controller that owns it, and the custom
// ingredient sheet is itself a Modal: the premium sheet renders in the most
// recently mounted <PremiumHost />, so mounting one inside that sheet's body
// (as AiConsentHost is) lets it nest instead of failing to present.
export function openIngredientAutofillUpsell(): void {
  openPremium('ingredient-autofill');
}

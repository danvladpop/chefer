// ─── Regenerate confirm copy (UX-PLAN-01) ───────────────────────────────────────
// What "Regenerate" tells the user it will replace. Shared by the mobile and web
// plan screens so the promise they make is the same one the server keeps:
// regenerating the CURRENT week keeps the days that are over and any meal
// already logged (meal-plan.service `loadKeptSlots`); a future week is replaced
// whole.

/** The body of the "Regenerate this week?" confirm. */
export function regenerateConfirmBody(weekOffset: number, plannedMealsCount: number): string {
  if (weekOffset <= 0) {
    return "This replaces your upcoming meals. Past days and meals you've already logged stay as they are.";
  }
  return `This replaces the ${plannedMealsCount} planned meal${plannedMealsCount === 1 ? '' : 's'}.`;
}

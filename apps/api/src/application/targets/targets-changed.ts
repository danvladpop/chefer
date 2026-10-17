// Day rebalance (2026-10-16): one seam for "this user's targets just moved".
// The services that change targets (preferences, own targets, coach, gym setup,
// routine days) call `notifyTargetsChanged`; the server registers the plan
// refit at startup (index.ts → meal-plan/day-fit.ts `refitAfterTargetChange`).
// A seam rather than a direct import: no import cycle with the meal-plan
// graph, and unit tests of those services stay free of plan side effects.

type Listener = (userId: string) => Promise<void>;

let listener: Listener | null = null;

export function setTargetsChangedListener(next: Listener | null): void {
  listener = next;
}

/** Fire-and-await; never throws (the change that caused it has already succeeded). */
export async function notifyTargetsChanged(userId: string): Promise<void> {
  if (!listener) return;
  try {
    await listener(userId);
  } catch (err) {
    console.error('[targets] targets-changed listener failed:', err);
  }
}

// UX-GYM-17: "strength per kg of body weight" must never plot a raw kg e1RM.
// Shared by the mobile Stats tab and the web strength-trend chart.

export interface DatedBodyweight {
  localDate: string;
  weightKg: number;
}

/**
 * The body weight to divide by on `localDate`: the latest weigh-in on or before
 * that day (carried forward), else `fallbackKg` — the weight from the profile /
 * onboarding. Null when neither exists (the point is then left off the chart,
 * never plotted as a raw kg figure).
 */
export function bodyweightOn(
  points: readonly DatedBodyweight[],
  localDate: string,
  fallbackKg: number | null = null,
): number | null {
  const sorted = [...points].sort((a, b) => a.localDate.localeCompare(b.localDate));
  let best: number | null = null;
  for (const p of sorted) {
    if (p.localDate > localDate) break;
    best = p.weightKg;
  }
  const chosen = best ?? fallbackKg;
  return chosen !== null && chosen > 0 ? chosen : null;
}

/** e1RM ÷ body weight (a "×" ratio, 2 decimals); null without a usable body weight. */
export function relativeStrength(e1rmKg: number, bodyweightKg: number | null): number | null {
  if (bodyweightKg === null || !(bodyweightKg > 0)) return null;
  return Math.round((e1rmKg / bodyweightKg) * 100) / 100;
}

/** "1.45×" — the ratio as the chart axis and captions print it. */
export function formatRelativeStrength(ratio: number): string {
  return `${ratio.toFixed(2)}×`;
}

// Pure helpers for cook mode (P1-3) — no imports so they unit-test cleanly.

/** Pulls a duration out of instruction text ("simmer for 12-15 minutes"). */
export function parseStepDuration(text: string): number | null {
  const match = /(\d+)\s*[-\u2013]?\s*(\d+)?\s*(min|minute|hour|hr)/i.exec(text);
  if (!match) return null;
  const a = parseInt(match[1] ?? '0', 10);
  const b = match[2] ? parseInt(match[2], 10) : null;
  const value = b ?? a; // ranges use the upper bound — better an over-timer than raw food
  const isHours = /hour|hr/i.test(match[3] ?? '');
  const seconds = value * (isHours ? 3600 : 60);
  // Sanity: ignore absurd parses (an overnight marinade is not an inline timer)
  return seconds > 0 && seconds <= 4 * 3600 ? seconds : null;
}

/** breakfast < 11:00, lunch < 16:00, otherwise dinner. */
export function guessMealType(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  return 'dinner';
}

/**
 * The servings cook mode and the recipe page start at (P1-1, backlog P2-3):
 * a premium household's table portions (`portionSum`, null otherwise) or the
 * recipe's own servings, multiplied by the plan slot's portion when opened
 * from the plan. The two compose — neither replaces the other.
 */
export function defaultCookServings(
  baseServings: number,
  portionSum: number | null,
  planPortion = 1,
): number {
  return Math.round((portionSum ?? baseServings) * planPortion * 100) / 100;
}

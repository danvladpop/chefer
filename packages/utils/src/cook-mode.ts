// Pure helpers for cook mode (P1-3) — only pure imports so they unit-test cleanly.
import { portionsFor } from './portions';

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
 * The servings cook mode and the recipe page start at (P1-1, backlog P2-3,
 * UX-REC-02): the whole table's servings — the user's own plan portion plus
 * each household member's `portionFactor` (see `portionsFor`). The portion is
 * the EATER's only; it is added to the members, never multiplied across them
 * (owner 2× + Mia ½ + Noah 1 = 3½, not ceil(2½) × 2). With no members the
 * recipe's own servings are the base, scaled by the eater's portion.
 */
export function defaultCookServings(
  baseServings: number,
  members: readonly { portionFactor: number }[] | null | undefined,
  planPortion = 1,
  cookingFor?: number | null,
): number {
  if (members && members.length > 0) {
    return portionsFor({ eaterPortion: planPortion, members }).cookServings;
  }
  // No members: the recipe's own servings scaled by the eater's portion, but
  // never fewer than a "cooking for N" table eats (a one-serving recipe is
  // cooked for the table; a multi-serving recipe is already a pot for several).
  const { eaterPortion, cookServings } = portionsFor({ eaterPortion: planPortion, cookingFor });
  return Math.round(Math.max(baseServings * eaterPortion, cookServings) * 100) / 100;
}

/**
 * bug B-21: the "Enjoy your {meal}!" finish screen used to fall back to
 * `guessMealType()` (the CLOCK) whenever cook mode was opened with no
 * `meal` param — so cooking dinner at 6 pm could read "Enjoy your lunch!".
 * With no real meal name, the generic "Enjoy!" is honest instead of a guess.
 */
export function finishMealCopy(meal?: string | null): string {
  return meal ? `Enjoy your ${meal}!` : 'Enjoy!';
}

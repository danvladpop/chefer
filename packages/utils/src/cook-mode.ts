// Pure helpers for cook mode (P1-3) — only pure imports so they unit-test cleanly.
import { portionsFor } from './portions';
import { formatScaledQuantity } from './scaled-quantity';
import type { UnitSystem } from './units';

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

// ─── Servings (UX-COOK-05) ───────────────────────────────────────────────────

/** The most servings the recipe page and cook mode will scale to — one cap for both. */
export const MAX_COOK_SERVINGS = 20;

/** Clamp a servings stepper value to 1…MAX_COOK_SERVINGS. */
export function clampCookServings(value: number): number {
  return Math.min(MAX_COOK_SERVINGS, Math.max(1, value));
}

/**
 * The `servings` route param the recipe page hands to cook mode ("6", "2.5"):
 * null when absent or not a number, otherwise clamped to the stepper's range.
 */
export function parseServingsParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampCookServings(Math.round(value * 100) / 100);
}

// ─── Ingredient amounts inside a step (UX-COOK-04) ───────────────────────────

export type CookIngredient = { name: string; quantity: number; unit: string };

export type StepAmount = {
  /** Index into the recipe's ingredient list. */
  index: number;
  name: string;
  /** The scaled amount in the user's units ("1½ cups", "To taste"). */
  amount: string;
};

/** Words that describe an ingredient without identifying it ("chopped", "fresh"). */
const GENERIC_WORDS = new Set([
  'fresh',
  'dried',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'grated',
  'ground',
  'large',
  'small',
  'medium',
  'whole',
  'extra',
  'virgin',
  'finely',
  'roughly',
  'optional',
  'sauce',
  'powder',
  'paste',
  'juice',
  'zest',
  'clove',
  'leaf',
  'piece',
  'and',
  'the',
  'for',
  'with',
]);

/** Lower-case, letters only, crude singular ("tomatoes" → "tomato", "cloves" → "clove"). */
function singular(word: string): string {
  const w = word.toLowerCase().replace(/[^a-zÀ-ɏ]/g, '');
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ches|shes|sses|xes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zÀ-ɏ]+/)
    .filter(Boolean)
    .map(singular);
}

/**
 * The indexes of the ingredients a step talks about, in recipe order. Matches
 * the whole ingredient name or any identifying word of it ("garlic cloves" is
 * found by "garlic"), ignoring "(canned)" notes and descriptors like "fresh".
 * Deliberately generous: an extra amount is harmless, a missing one sends the
 * cook back to the ingredient list with floury hands.
 */
export function matchStepIngredients(
  stepText: string,
  ingredients: readonly { name: string }[],
): number[] {
  const stepWords = words(stepText);
  if (stepWords.length === 0) return [];
  const stepSet = new Set(stepWords);
  const stepJoined = ` ${stepWords.join(' ')} `;
  const hits: number[] = [];
  ingredients.forEach((ingredient, index) => {
    const core = ingredient.name.replace(/\([^)]*\)/g, '').split(',')[0] ?? '';
    const all = words(core).filter((w) => w.length >= 3);
    if (all.length === 0) return;
    if (stepJoined.includes(` ${all.join(' ')} `)) {
      hits.push(index);
      return;
    }
    const specific = all.filter((w) => !GENERIC_WORDS.has(w));
    const keys = specific.length > 0 ? specific : all;
    if (keys.some((w) => stepSet.has(w))) hits.push(index);
  });
  return hits;
}

/** The step's ingredients with amounts scaled to the chosen servings, in the user's units. */
export function stepIngredientAmounts(
  stepText: string,
  ingredients: readonly CookIngredient[],
  scale: number,
  system: UnitSystem,
): StepAmount[] {
  return matchStepIngredients(stepText, ingredients).flatMap((index) => {
    const ingredient = ingredients[index];
    if (!ingredient) return [];
    return [
      {
        index,
        name: ingredient.name,
        amount: formatScaledQuantity(ingredient.quantity, ingredient.unit, scale, system),
      },
    ];
  });
}

// ─── Step timers (UX-COOK-01) ────────────────────────────────────────────────
// A timer is an absolute `endsAt` while it runs, so it survives step changes,
// backgrounding and a screen re-render; only the display ticks.

export type CookTimer = {
  /** The step's own duration, for reset. */
  durationSec: number;
  /** Epoch ms the timer finishes, while running; null when idle or paused. */
  endsAt: number | null;
  /** Seconds left when not running (the full duration when idle). */
  remainingSec: number;
};

export type CookTimerStatus = 'idle' | 'running' | 'paused' | 'done';

export function newCookTimer(durationSec: number): CookTimer {
  return { durationSec, endsAt: null, remainingSec: durationSec };
}

/** Seconds left, rounded up (a 0.4 s remainder still reads "0:01"). */
export function cookTimerRemaining(timer: CookTimer, now: number): number {
  if (timer.endsAt === null) return Math.max(0, timer.remainingSec);
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function cookTimerStatus(timer: CookTimer, now: number): CookTimerStatus {
  if (timer.endsAt !== null) return timer.endsAt <= now ? 'done' : 'running';
  if (timer.remainingSec <= 0) return 'done';
  return timer.remainingSec >= timer.durationSec ? 'idle' : 'paused';
}

/** Start (or resume) from what is left; a finished timer restarts from the full time. */
export function startCookTimer(timer: CookTimer, now: number): CookTimer {
  const left = cookTimerStatus(timer, now) === 'done' ? timer.durationSec : timer.remainingSec;
  const base = left > 0 ? left : timer.durationSec;
  return { ...timer, endsAt: now + base * 1000, remainingSec: base };
}

export function pauseCookTimer(timer: CookTimer, now: number): CookTimer {
  if (timer.endsAt === null) return timer;
  return { ...timer, endsAt: null, remainingSec: cookTimerRemaining(timer, now) };
}

export function resetCookTimer(timer: CookTimer): CookTimer {
  return newCookTimer(timer.durationSec);
}

/** "4:05", or "1:02:03" past an hour. */
export function formatCookTimer(totalSec: number): string {
  const total = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Reads back a persisted timer map; anything malformed is dropped. */
export function isCookTimer(value: unknown): value is CookTimer {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Partial<CookTimer>;
  return (
    typeof t.durationSec === 'number' &&
    typeof t.remainingSec === 'number' &&
    (t.endsAt === null || typeof t.endsAt === 'number')
  );
}

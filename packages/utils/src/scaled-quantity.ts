import { formatQuantity, type UnitSystem } from './units';

// ─── Scaled ingredient quantity display (T-BUG-52, bug B-52) ──────────────────
// Scaling a recipe's servings up/down (recipe detail, cook mode) used to
// print raw decimals straight from the multiplication: "1.7 / 5 servings",
// "3.1 ml cinnamon", "1.5 pinch", "2 to taste salt". This module renders a
// scaled amount the way a kitchen recipe card would: a fraction at a fixed
// width, and "to taste" ingredients that are never scaled at all.

const UNSCALABLE_UNITS = new Set(['to taste', 'taste', 'as needed']);

/** True for units a serving-size scale should never touch ("to taste"). */
export function isUnscalableUnit(unit: string): boolean {
  const key = unit.trim().toLowerCase();
  return UNSCALABLE_UNITS.has(key) || key.includes('to taste');
}

const FRACTIONS: readonly [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
  [0.875, '⅞'],
];
const FRACTION_TOLERANCE = 0.03;

/**
 * Renders a quantity as a whole number, a kitchen fraction ("1¾"), or (when
 * no simple fraction is close enough) one decimal place — never a long raw
 * decimal. Fixed-width in spirit: always a short, one-glance kitchen amount.
 */
export function formatFractionalQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity < 0) return String(quantity);
  const whole = Math.floor(quantity + 1e-9);
  const frac = quantity - whole;

  if (frac < 0.02) return String(whole);

  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(frac - value) <= FRACTION_TOLERANCE) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }

  const rounded = Math.round(quantity * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

/**
 * Formats an ingredient quantity scaled by `scale` (the servings adjuster):
 * "to taste" lines are never scaled and render without a number; every
 * other line is scaled, converted to the user's unit system (`formatQuantity`)
 * and then re-rendered with a kitchen fraction instead of a raw decimal.
 */
export function formatScaledQuantity(
  quantity: number,
  unit: string,
  scale: number,
  system: UnitSystem,
): string {
  if (isUnscalableUnit(unit)) return 'To taste';

  const converted = formatQuantity(quantity * scale, unit, system);
  const match = /^(-?\d+(?:\.\d+)?)(\s.*)?$/.exec(converted);
  if (!match?.[1]) return converted;
  const numeric = Number(match[1]);
  const rest = match[2] ?? '';
  return `${formatFractionalQuantity(numeric)}${rest}`;
}

/**
 * The current/base servings pair for the stepper display ("1¾ / 5" instead
 * of "1.7 / 5").
 */
export function formatServingsPair(current: number, base: number): string {
  return `${formatFractionalQuantity(current)} / ${formatFractionalQuantity(base)}`;
}

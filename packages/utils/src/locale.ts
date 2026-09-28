import type { DisplayCurrency } from '@chefer/types';
import type { UnitSystem } from './units';

// ─── Location defaults (backlog P2-6) ─────────────────────────────────────────
// A new account starts in the unit system and currency of the device's region
// instead of metric + EUR for everyone. The client reads the region from the
// standard Intl APIs (no native dependency — Hermes ships them) and sends it
// with auth.register; the API maps it through defaultsForRegion below.

/** The world's non-metric holdouts: the US, Liberia and Myanmar. */
export const IMPERIAL_REGIONS: ReadonlySet<string> = new Set(['US', 'LR', 'MM']);

/**
 * Euro-area members (2026, incl. Bulgaria from 1 Jan 2026). Listed so the rule
 * is explicit; every region not mapped below falls back to EUR anyway.
 */
export const EUROZONE_REGIONS: ReadonlySet<string> = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
]);

const CURRENCY_BY_REGION: Readonly<Record<string, DisplayCurrency>> = {
  US: 'USD',
  GB: 'GBP',
  RO: 'RON',
};

export type DisplayDefaults = { preferredUnits: UnitSystem; currency: DisplayCurrency };

/**
 * Unit system + currency for an ISO-3166 alpha-2 region. US/LR/MM → IMPERIAL,
 * everyone else METRIC. US → USD, GB → GBP, RO → RON, eurozone and everyone
 * else → EUR. Unknown / missing regions get METRIC + EUR.
 */
export function defaultsForRegion(region: string | null | undefined): DisplayDefaults {
  const r = (region ?? '').trim().toUpperCase();
  return {
    preferredUnits: IMPERIAL_REGIONS.has(r) ? 'IMPERIAL' : 'METRIC',
    currency: CURRENCY_BY_REGION[r] ?? 'EUR',
  };
}

/**
 * The region of a BCP-47 locale tag ("en-GB" → "GB", "ro_RO" → "RO"). A tag
 * without a region is maximised by Intl.Locale ("en" → "US") where available.
 */
export function regionFromLocale(locale: string | null | undefined): string | null {
  const tag = (locale ?? '').trim().replace(/_/g, '-');
  if (tag === '') return null;
  // An explicit two-letter region subtag wins ("en-GB", "zh-Hant-TW").
  const explicit = /-([A-Za-z]{2})(?:-|$)/.exec(tag);
  if (explicit?.[1]) return explicit[1].toUpperCase();
  try {
    const region = new Intl.Locale(tag).maximize().region;
    if (typeof region === 'string' && /^[A-Z]{2}$/.test(region)) return region;
  } catch {
    // Malformed tag — no region.
  }
  return null;
}

/**
 * Best-effort region of the current device/browser. Pass the platform's own
 * locale list first (web: navigator.languages); the Intl default locale is
 * the fallback. Returns null when nothing carries a region.
 */
export function detectRegion(
  preferredLocales: readonly (string | undefined)[] = [],
): string | null {
  const candidates = [...preferredLocales];
  try {
    candidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Intl unavailable — only the passed locales count.
  }
  for (const locale of candidates) {
    const region = regionFromLocale(locale);
    if (region) return region;
  }
  return null;
}

// ─── Height conversion (bug B-43, T-03.8) ──────────────────────────────────────
// The metric-only body-weight helpers (weight.ts) already have a kg<->lb pair
// (`bodyWeightInUnit`/`LB_PER_KG`); height has no such shared helper yet — web's
// step-metrics.tsx converts inline. One inches figure (not a ft/in split), so
// it drops straight into a single text field on both platforms.

export const CM_PER_IN = 2.54;

/** cm -> inches, rounded to 0.1 (175 cm -> 68.9 in). */
export function cmToIn(cm: number): number {
  return Math.round((cm / CM_PER_IN) * 10) / 10;
}

/** inches -> cm, rounded to 0.1 (69 in -> 175.3 cm). */
export function inToCm(inches: number): number {
  return Math.round(inches * CM_PER_IN * 10) / 10;
}

// ─── Units follow typed values (bug B-43, T-03.8) ──────────────────────────────
// An en-US phone in Romania defaults to Imperial from the device region, but
// the metrics/How-you-cook steps still take a plain number: someone who
// types "170" for height and "65" for weight typed CENTIMETRES and
// KILOGRAMS, not the 67-inch/143-lb reading that number would be under the
// current unit system. `inferUnitsFromInput` reads the two typed values
// against `currentUnits` and says whether the OTHER system fits them far
// better — the caller (the step) then switches units and shows the
// `Switched to … because you entered …` notice with `Undo`.

/** A typed value is "plausible" for a system when it falls in this range. */
const PLAUSIBLE_HEIGHT_CM: readonly [number, number] = [100, 230];
const PLAUSIBLE_HEIGHT_IN: readonly [number, number] = [39, 91]; // ~100–230 cm in inches
const PLAUSIBLE_WEIGHT_KG: readonly [number, number] = [25, 250];
const PLAUSIBLE_WEIGHT_LB: readonly [number, number] = [55, 550]; // ~25–250 kg in lb

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return value >= min && value <= max;
}

export interface UnitInferenceInput {
  /** The typed height, in whatever unit `currentUnits` currently implies. */
  heightValue: number | null;
  /** The typed weight, in whatever unit `currentUnits` currently implies. */
  weightValue: number | null;
  currentUnits: UnitSystem;
}

export interface UnitInferenceResult {
  /** The system the typed values actually fit — `currentUnits` when nothing suggests a switch. */
  suggestedUnits: UnitSystem;
  /** True only when `suggestedUnits` differs from `currentUnits` — the caller shows the notice. */
  shouldSwitch: boolean;
}

/**
 * Height is the stronger signal (weight ranges overlap more between the two
 * systems — 65 reads as a plausible lb figure too, just an unlikely one) —
 * height alone decides when it's implausible for `currentUnits` but
 * plausible for the other; weight only breaks a tie when height is absent.
 */
export function inferUnitsFromInput(input: UnitInferenceInput): UnitInferenceResult {
  const { heightValue, weightValue, currentUnits } = input;
  const other: UnitSystem = currentUnits === 'METRIC' ? 'IMPERIAL' : 'METRIC';

  const plausibleFor = (units: UnitSystem): boolean => {
    const heightOk =
      heightValue === null ||
      inRange(heightValue, units === 'METRIC' ? PLAUSIBLE_HEIGHT_CM : PLAUSIBLE_HEIGHT_IN);
    const weightOk =
      weightValue === null ||
      inRange(weightValue, units === 'METRIC' ? PLAUSIBLE_WEIGHT_KG : PLAUSIBLE_WEIGHT_LB);
    return heightOk && weightOk;
  };

  // Nothing typed yet, or it already fits the current system — no switch.
  if ((heightValue === null && weightValue === null) || plausibleFor(currentUnits)) {
    return { suggestedUnits: currentUnits, shouldSwitch: false };
  }
  // Implausible for the current system: switch only when the OTHER system
  // actually fits better — never swap to a system the values don't fit
  // either (e.g. a typo), which would just trade one wrong guess for another.
  if (plausibleFor(other)) {
    return { suggestedUnits: other, shouldSwitch: true };
  }
  return { suggestedUnits: currentUnits, shouldSwitch: false };
}

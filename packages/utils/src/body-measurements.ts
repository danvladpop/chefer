import {
  BODY_FAT_PCT_MAX,
  BODY_FAT_PCT_MIN,
  BODY_LENGTH_CM_MAX,
  BODY_LENGTH_CM_MIN,
  BODY_MEASURE_FIELDS,
  BODY_MEASURES,
  type BodyMeasure,
  type BodyMeasurementDto,
  type BodyMeasurementValues,
} from '@chefer/types';
import { CM_PER_IN } from './locale';
import type { UnitSystem } from './units';

// ─── Body measurements in the user's units (lane D3) ─────────────────────────
// The API stores cm and %. IMPERIAL users see and type inches; these helpers
// convert at the edge so web and the app agree on every number and message.

/** "cm" or "in" for the user's unit system. */
export function bodyLengthUnit(system: UnitSystem): 'cm' | 'in' {
  return system === 'IMPERIAL' ? 'in' : 'cm';
}

/** The unit a measure is typed and shown in. */
export function measureUnit(measure: BodyMeasure, system: UnitSystem): 'cm' | 'in' | '%' {
  return measure === 'bodyFat' ? '%' : bodyLengthUnit(system);
}

/** A stored value (cm, or % for body fat) in the user's unit, rounded to 0.1. */
export function measureInUnit(measure: BodyMeasure, value: number, system: UnitSystem): number {
  const shown = measure !== 'bodyFat' && system === 'IMPERIAL' ? value / CM_PER_IN : value;
  return Math.round(shown * 10) / 10;
}

/**
 * "82.5 cm" / "32.5 in" / "21.4 %". With `signed`, a change reads "+1.0 cm" /
 * "−0.5 in" (one decimal always, a real minus sign).
 */
export function formatMeasure(
  measure: BodyMeasure,
  value: number,
  system: UnitSystem,
  options: { signed?: boolean } = {},
): string {
  const shown = measureInUnit(measure, value, system);
  const unit = measureUnit(measure, system);
  if (options.signed) {
    return `${shown > 0 ? '+' : shown < 0 ? '−' : ''}${Math.abs(shown).toFixed(1)} ${unit}`;
  }
  return `${shown} ${unit}`;
}

export type MeasureParseResult =
  | { ok: true; value: number | undefined }
  | { ok: false; error: string };

/**
 * Parses one typed measure in the user's unit and returns what the API takes
 * (cm or %), rounded to 0.1. Empty means "not measured" (`undefined`).
 * Accepts "82.5" and "82,5"; rejects exponents and implausible values.
 */
export function parseMeasure(
  measure: BodyMeasure,
  input: string,
  system: UnitSystem,
): MeasureParseResult {
  const text = input.trim().replace(',', '.');
  if (text === '') return { ok: true, value: undefined };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Use a number like 82.5.' };
  const typed = Number(text);
  if (measure === 'bodyFat') {
    if (typed < BODY_FAT_PCT_MIN || typed > BODY_FAT_PCT_MAX) {
      return {
        ok: false,
        error: `Body fat must be between ${BODY_FAT_PCT_MIN} and ${BODY_FAT_PCT_MAX} %.`,
      };
    }
    return { ok: true, value: Math.round(typed * 10) / 10 };
  }
  const cm = system === 'IMPERIAL' ? typed * CM_PER_IN : typed;
  if (cm < BODY_LENGTH_CM_MIN || cm > BODY_LENGTH_CM_MAX) {
    const unit = bodyLengthUnit(system);
    const [min, max] =
      system === 'IMPERIAL'
        ? [Math.ceil(BODY_LENGTH_CM_MIN / CM_PER_IN), Math.floor(BODY_LENGTH_CM_MAX / CM_PER_IN)]
        : [BODY_LENGTH_CM_MIN, BODY_LENGTH_CM_MAX];
    return { ok: false, error: `Must be between ${min} and ${max} ${unit}.` };
  }
  return { ok: true, value: Math.round(cm * 10) / 10 };
}

export type MeasurementFormResult =
  | { ok: true; values: BodyMeasurementValues }
  | { ok: false; errors: Partial<Record<BodyMeasure, string>>; formError?: string };

/**
 * Parses a whole measurement form (one text per measure). Every filled field
 * must be valid, and at least one must be filled.
 */
export function parseMeasurementForm(
  texts: Partial<Record<BodyMeasure, string>>,
  system: UnitSystem,
): MeasurementFormResult {
  const values: BodyMeasurementValues = {};
  const errors: Partial<Record<BodyMeasure, string>> = {};
  for (const measure of BODY_MEASURES) {
    const result = parseMeasure(measure, texts[measure] ?? '', system);
    if (!result.ok) errors[measure] = result.error;
    else if (result.value !== undefined) values[BODY_MEASURE_FIELDS[measure]] = result.value;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(values).length === 0) {
    return { ok: false, errors: {}, formError: 'Enter at least one measurement.' };
  }
  return { ok: true, values };
}

export interface MeasurePoint {
  measuredOn: string;
  value: number;
}

/** One measure's history, oldest first, skipping days it wasn't measured. */
export function measureSeries(
  entries: readonly BodyMeasurementDto[],
  measure: BodyMeasure,
): MeasurePoint[] {
  const field = BODY_MEASURE_FIELDS[measure];
  return entries
    .flatMap((e) => {
      const value = e[field];
      return value === null ? [] : [{ measuredOn: e.measuredOn, value }];
    })
    .sort((a, b) => (a.measuredOn < b.measuredOn ? -1 : a.measuredOn > b.measuredOn ? 1 : 0));
}

/** The measures that have at least one value, in display order. */
export function measuredMeasures(entries: readonly BodyMeasurementDto[]): BodyMeasure[] {
  return BODY_MEASURES.filter((m) => entries.some((e) => e[BODY_MEASURE_FIELDS[m]] !== null));
}

/**
 * The change from the first to the last value, as neutral copy: "−2.0 cm
 * since your first entry" / "No change since your first entry", or null with
 * fewer than two values. A direction, never a verdict.
 */
export function measureChangeText(
  series: readonly MeasurePoint[],
  measure: BodyMeasure,
  system: UnitSystem,
): string | null {
  const first = series.at(0);
  const last = series.at(-1);
  if (!first || !last || series.length < 2) return null;
  const delta = last.value - first.value;
  if (Math.abs(measureInUnit(measure, delta, system)) < 0.1) {
    return 'No change since your first entry';
  }
  return `${formatMeasure(measure, delta, system, { signed: true })} since your first entry`;
}

// ─── Copy (web and the app) ───────────────────────────────────────────────────

export const MEASUREMENTS_COPY = {
  title: 'Body measurements',
  intro: 'Track your waist, hips, chest, arms, thighs and body fat — free, and in your units.',
  add: 'Add measurements',
  save: 'Save measurements',
  saving: 'Saving…',
  saved: 'Measurements saved',
  empty: 'No measurements yet. Measure what you like — every field is optional.',
  oneEntry: 'Add another entry on a later day to see the change.',
  declined:
    'Your measurements weren’t saved, because Chefer doesn’t have permission to store health information.',
  deleteLabel: (day: string) => `Delete the measurements from ${day}`,
  deleteError: "Couldn't delete that entry. Try again in a moment.",
  entries: 'Entries',
} as const;

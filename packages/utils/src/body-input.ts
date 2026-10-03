import { LB_PER_KG, type BodyUnits } from '@chefer/types';
import { CM_PER_IN } from './locale';

// ─── Typed body-metric fields (UX-ONB-05) ──────────────────────────────────────
// Height and weight are typed as text (so a field never reformats under the
// thumb) and stored as cm / kg. These pure helpers turn the typed text into the
// stored number and back, for every form that has the fields: onboarding and
// Preferences on mobile, onboarding on web. Imperial height is TWO fields —
// feet and inches — not one total-inches figure.

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Typed text -> number ("1,80" reads as 1.8, like a decimal comma), or null when empty/not a number. */
export function parseBodyNumber(raw: string): number | null {
  const n = parseFloat(raw.trim().replace(',', '.'));
  return raw.trim() === '' || Number.isNaN(n) ? null : n;
}

/** Whole feet plus the remaining inches (0.1 precision) of a length in inches; 71.97 in is 6 ft 0 in. */
export function splitInches(totalInches: number): { feet: number; inches: number } {
  let feet = Math.floor(totalInches / 12);
  let inches = round1(totalInches - feet * 12);
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

/** cm -> feet + inches (177.8 cm is 5 ft 10 in). */
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  return splitInches(cm / CM_PER_IN);
}

/** feet + inches -> cm, rounded to 0.1 (5 ft 10 in is 177.8 cm). */
export function ftInToCm(feet: number, inches: number): number {
  return round1((feet * 12 + inches) * CM_PER_IN);
}

/**
 * Stored height (cm) from the typed fields. Metric: `primary` is cm and
 * `inches` is ignored. Imperial: `primary` is feet, `inches` the extra inches
 * (empty counts as 0). Null while nothing is typed.
 */
export function heightCmFromText(primary: string, inches: string, units: BodyUnits): number | null {
  const first = parseBodyNumber(primary);
  if (units !== 'IMPERIAL') return first;
  const extra = parseBodyNumber(inches);
  if (first === null && extra === null) return null;
  return ftInToCm(first ?? 0, extra ?? 0);
}

/** Stored weight (kg) from the typed weight (kg, or lb when imperial). */
export function weightKgFromText(raw: string, units: BodyUnits): number | null {
  const typed = parseBodyNumber(raw);
  if (typed === null) return null;
  return units === 'IMPERIAL' ? typed / LB_PER_KG : typed;
}

/**
 * The single height figure `inferUnitsFromInput` reads: cm when metric; total
 * inches when imperial. A feet field of 10 or more cannot be feet, so it is
 * read as what it most likely is, a centimetre value typed into the wrong
 * unit (170 in the feet field is 170, not 2,040 inches).
 */
export function heightValueForInference(
  primary: string,
  inches: string,
  units: BodyUnits,
): number | null {
  const first = parseBodyNumber(primary);
  if (units !== 'IMPERIAL') return first;
  if (first !== null && first >= 10) return first;
  const extra = parseBodyNumber(inches);
  if (first === null && extra === null) return null;
  return (first ?? 0) * 12 + (extra ?? 0);
}

export interface BodyFieldTexts {
  /** cm when metric, feet when imperial. */
  heightText: string;
  /** Imperial only; empty when metric. */
  inchesText: string;
  /** kg when metric, lb when imperial. */
  weightText: string;
}

/** The field texts that show the stored cm / kg in `units` (empty for a missing value). */
export function bodyFieldTexts(
  metrics: { heightCm: number | null; weightKg: number | null },
  units: BodyUnits,
): BodyFieldTexts {
  let heightText = '';
  let inchesText = '';
  if (metrics.heightCm !== null) {
    if (units === 'IMPERIAL') {
      const { feet, inches } = cmToFtIn(metrics.heightCm);
      heightText = String(feet);
      inchesText = String(inches);
    } else {
      heightText = String(round1(metrics.heightCm));
    }
  }
  const weightText =
    metrics.weightKg === null
      ? ''
      : String(round1(units === 'IMPERIAL' ? metrics.weightKg * LB_PER_KG : metrics.weightKg));
  return { heightText, inchesText, weightText };
}

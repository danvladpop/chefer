// ─── Cardio rules (pure) — T-42.4, 06 §5/§6 ───────────────────────────────────
// No stored progression exists for cardio (Δ2.2): "Next time" is a pure
// function of the last logged exposure, not a fold like the strength engine.
// Kept decoupled from WorkoutSessionDoc/SessionSummaryDto on purpose — the
// caller (mobile T-42.3) extracts the last exposure's fields itself, so this
// module has no dependency on which offline read model carries them.
//
// NOTE for the next lane touching this: packages/types/src/gym/dto.ts's
// SessionSummaryDto['exercises'][number]['sets'] does not yet carry the
// seven cardio fields sessionSetDocSchema has (durationSec, distanceM, …) —
// dto.ts is outside this lane's ownership this wave, so `bootstrap.
// recentSessions` cannot show cardio history until that type gains them.
// See the session final report.

import { CARDIO_CATALOG_BY_ID, type CardioCatalogEntry, type DistanceUnit } from '@chefer/types';
import { round2 } from './loads';

function round1(x: number): number {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

// ─── Duration ─────────────────────────────────────────────────────────────────

/** "45 min", "1 h 30 min" — the summary/history label (whole minutes). */
export function formatDurationMinutes(durationSec: number): string {
  const totalMin = Math.round(durationSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "20:00" / "1:05:30" — the running clock (mm:ss, or h:mm:ss past an hour). */
export function formatDurationClock(durationSec: number): string {
  const s = Math.max(0, Math.floor(durationSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Distance ─────────────────────────────────────────────────────────────────

const METRES_PER_KM = 1000;
const METRES_PER_MI = 1609.344;

/** Any display unit a cardio entry logs distance in — the rower is always metres (06 §6). */
export type CardioDistanceUnit = DistanceUnit | 'M';

/** Display-unit value → canonical metres (storage unit, sessionSetDocSchema.distanceM). */
export function toMetres(value: number, unit: CardioDistanceUnit): number {
  if (unit === 'KM') return round2(value * METRES_PER_KM);
  if (unit === 'MI') return round2(value * METRES_PER_MI);
  return round2(value);
}

/** Canonical metres → "5.2 km" / "3.2 mi" / "500 m" (whole metres for the rower). */
export function formatDistance(metres: number, unit: CardioDistanceUnit): string {
  if (unit === 'KM') return `${round1(metres / METRES_PER_KM)} km`;
  if (unit === 'MI') return `${round1(metres / METRES_PER_MI)} mi`;
  return `${Math.round(metres)} m`;
}

/**
 * "5:30 /km" / "8:51 /mi" / "2:00 /500m" (the rower's conventional split).
 * null when either input is 0 (nothing to divide by).
 */
export function pace(
  distanceM: number,
  durationSec: number,
  unit: CardioDistanceUnit,
): string | null {
  if (distanceM <= 0 || durationSec <= 0) return null;
  if (unit === 'M') {
    const secPer500 = durationSec / (distanceM / 500);
    return `${formatDurationClock(secPer500)} /500m`;
  }
  const perUnit = unit === 'KM' ? METRES_PER_KM : METRES_PER_MI;
  const secPerUnit = durationSec / (distanceM / perUnit);
  return `${formatDurationClock(secPerUnit)} /${unit === 'KM' ? 'km' : 'mi'}`;
}

// ─── Effort (06 §2 — the wearable-less intensity input) ───────────────────────

export type EffortLabel = 'Easy' | 'Moderate' | 'Hard';

/** Easy/Moderate/Hard chips map to fixed RPE anchors; `Exact effort ▸` sends 1–10 directly. */
export const EFFORT_CHIP_RPE: Record<EffortLabel, number> = { Easy: 3, Moderate: 5, Hard: 7 };

/** The nearest chip label for a stored RPE (for re-rendering a past entry), or null if unset. */
export function effortLabelForRpe(intensityRpe: number | undefined): EffortLabel | null {
  if (intensityRpe === undefined) return null;
  if (intensityRpe <= 3) return 'Easy';
  if (intensityRpe <= 6) return 'Moderate';
  return 'Hard';
}

// ─── Next time (Δ2.2: pure function of the last exposure, no stored state) ────

export interface CardioExposure {
  durationSec?: number;
  distanceM?: number;
  intensityRpe?: number;
}

export interface CardioNextTime {
  kind: 'start' | 'hold';
  /** "Log your first time and we'll show what's next." / "Same as last time: 20 min · 5.0 km at Moderate." */
  text: string;
}

/**
 * Minimal W2 rule (T-42.7's progression table — +5–10 % duration/distance —
 * is W5): no history → start; a logged exposure → hold at the same
 * time/distance/effort, worded as "Same as last time".
 */
export function cardioNextTime(
  lastExposure: CardioExposure | null | undefined,
  distanceUnit: CardioDistanceUnit,
): CardioNextTime {
  if (lastExposure?.durationSec === undefined) {
    return { kind: 'start', text: "Log your first time and we'll show what's next." };
  }
  const parts = [formatDurationMinutes(lastExposure.durationSec)];
  if (lastExposure.distanceM !== undefined) {
    parts.push(formatDistance(lastExposure.distanceM, distanceUnit));
  }
  const effort = effortLabelForRpe(lastExposure.intensityRpe);
  return {
    kind: 'hold',
    text: `Same as last time: ${parts.join(' · ')}${effort ? ` at ${effort}` : ''}.`,
  };
}

// ─── Catalogue presets (T-42.1's MET/metric data, re-exposed here for the UI) ─

export function cardioPresetsFor(exerciseId: string): CardioCatalogEntry | null {
  return CARDIO_CATALOG_BY_ID.get(exerciseId) ?? null;
}

/** Whether this catalogue entry's `distance` field is metres (rower) vs the user's unit. */
export function distanceUnitFor(exerciseId: string, profileUnit: DistanceUnit): CardioDistanceUnit {
  return cardioPresetsFor(exerciseId)?.distanceInMetres ? 'M' : profileUnit;
}

// ─── Calories burned for a finished session (pure) ───────────────────────────
// The kcal tile on Today's training card and the workout summary (10 Oct
// redesign follow-up). Standard MET formula:
//
//   kcal = MET × bodyweight (kg) × hours
//
// Per completed working set, in this order:
//  1. a user-entered `caloriesKcal` (an activity or a cardio set "from your
//     watch") wins — it is the user's number, never re-estimated;
//  2. a cardio entry with a `durationSec` uses its own MET from the cardio
//     catalogue (`CARDIO_CATALOG_BY_ID`, 2024 Adult Compendium ranges) — the
//     midpoint, or interpolated by the logged effort (RPE 1–10);
//     a `durationSec` on an exercise outside the catalogue (a custom cardio
//     entry) uses the catalogue's `other-activity` range;
//  3. everything else is strength work, billed at STRENGTH_MET over the
//     session's remaining active time.
//
// Active time is finishedAt − startedAt (sessions carry no pause record), so a
// "Save for later" session resumed hours later would read as a marathon. The
// strength share is therefore capped at a plausible length for the sets
// actually done, and the whole span at MAX_ACTIVE_SEC.
//
// No bodyweight → no estimate (we never guess one): only a user-entered total
// can still be returned.

import { CARDIO_CATALOG_BY_ID, type CardioCatalogEntry } from '@chefer/types';

/**
 * Resistance training MET. Compendium of Physical Activities (Ainsworth et al.
 * 2011, carried into the 2024 Adult Compendium), code 02054 "resistance
 * (weight) training, multiple exercises, 8–15 repetitions at varied
 * resistance" = 3.5 MET. The vigorous/power-lifting code (02050) is 6.0, but
 * our time base is the whole session wall clock — rests between sets
 * included — so the conservative general value avoids the over-estimates
 * people distrust in fitness apps.
 */
export const STRENGTH_MET = 3.5;

/** A session longer than this is not all exercise (a forgotten Finish). */
export const MAX_ACTIVE_SEC = 3 * 60 * 60;
/** Upper bound of time one working strength set accounts for (set + a long rest). */
export const MAX_SEC_PER_STRENGTH_SET = 5 * 60;
/** Warm-up / setup allowance on top of the per-set bound. */
export const STRENGTH_SETUP_SEC = 10 * 60;

const FALLBACK_CARDIO_ID = 'other-activity';

/** The structural slice of a session (doc summary or bootstrap copy) the estimate reads. */
export interface BurnSession {
  startedAt: string;
  finishedAt: string | null;
  exercises: readonly {
    exerciseId: string;
    skipped: boolean;
    sets: readonly {
      isWarmup: boolean;
      completed: boolean;
      durationSec?: number | undefined;
      intensityRpe?: number | undefined;
      caloriesKcal?: number | undefined;
    }[];
  }[];
}

export interface SessionKcal {
  kcal: number;
  /** True when any part of the total is our estimate (not only user-entered). */
  isEstimate: boolean;
}

/** The MET of a cardio entry: the range midpoint, or placed in the range by effort. */
export function cardioMet(entry: CardioCatalogEntry, intensityRpe?: number): number {
  if (intensityRpe === undefined) return (entry.metLow + entry.metHigh) / 2;
  const t = Math.min(1, Math.max(0, (intensityRpe - 1) / 9));
  return entry.metLow + (entry.metHigh - entry.metLow) * t;
}

/** Estimates read as round numbers: nearest 5 under 100, nearest 10 from 100. */
export function roundKcalEstimate(kcal: number): number {
  const step = kcal < 100 ? 5 : 10;
  return Math.round(kcal / step) * step;
}

function wallSeconds(startedAt: string, finishedAt: string | null): number {
  if (!finishedAt) return 0;
  const sec = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000;
  return Number.isFinite(sec) ? Math.max(0, Math.min(sec, MAX_ACTIVE_SEC)) : 0;
}

/**
 * Calories burned in a finished session: `{ kcal, isEstimate }`, or null when
 * nothing can be said (no bodyweight and nothing logged, no duration, nothing done).
 */
export function estimateSessionKcal({
  session,
  bodyweightKg,
}: {
  session: BurnSession;
  bodyweightKg: number | null | undefined;
}): SessionKcal | null {
  let loggedKcal = 0;
  let hasLogged = false;
  let coveredSec = 0;
  let cardioKcalPerKg = 0;
  let strengthSets = 0;

  for (const ex of session.exercises) {
    if (ex.skipped) continue;
    for (const set of ex.sets) {
      if (!set.completed || set.isWarmup) continue;
      const durationSec = set.durationSec ?? 0;
      if (set.caloriesKcal !== undefined) {
        loggedKcal += set.caloriesKcal;
        hasLogged = true;
        coveredSec += durationSec;
      } else if (durationSec > 0) {
        const entry =
          CARDIO_CATALOG_BY_ID.get(ex.exerciseId) ?? CARDIO_CATALOG_BY_ID.get(FALLBACK_CARDIO_ID);
        if (!entry) continue;
        cardioKcalPerKg += (cardioMet(entry, set.intensityRpe) * durationSec) / 3600;
        coveredSec += durationSec;
      } else if (!CARDIO_CATALOG_BY_ID.has(ex.exerciseId)) {
        strengthSets += 1;
      }
    }
  }

  const strengthSec =
    strengthSets > 0
      ? Math.max(
          0,
          Math.min(
            wallSeconds(session.startedAt, session.finishedAt) - coveredSec,
            strengthSets * MAX_SEC_PER_STRENGTH_SET + STRENGTH_SETUP_SEC,
          ),
        )
      : 0;

  const weight = bodyweightKg !== null && bodyweightKg !== undefined && bodyweightKg > 0;
  const estimated = weight
    ? (cardioKcalPerKg + (STRENGTH_MET * strengthSec) / 3600) * bodyweightKg
    : 0;

  if (estimated > 0) {
    const kcal = roundKcalEstimate(loggedKcal + estimated);
    return kcal > 0 ? { kcal, isEstimate: true } : null;
  }
  if (hasLogged && loggedKcal > 0) return { kcal: Math.round(loggedKcal), isEstimate: false };
  return null;
}

export interface SessionKcalCopy {
  /** "~310" (estimate) or "313" (logged). */
  value: string;
  /** The tile caption. */
  label: string;
  /** The full accessibility label. */
  spoken: string;
  /** Where the number comes from (accessibility hint). */
  hint: string;
}

/**
 * The kcal tile's copy, shared so every surface words an estimate the same:
 * "~310" · "kcal burned (est.)" for our estimate, "313" · "kcal you logged"
 * for the user's own number. `spoken` never leaves the estimate implicit.
 */
export function sessionKcalCopy(burn: SessionKcal): SessionKcalCopy {
  if (burn.isEstimate) {
    return {
      value: `~${burn.kcal}`,
      label: 'kcal burned (est.)',
      spoken: `About ${burn.kcal} kilocalories burned, estimated`,
      hint: 'Estimated from your body weight and workout time',
    };
  }
  return {
    value: String(burn.kcal),
    label: 'kcal you logged',
    spoken: `${burn.kcal} kilocalories burned, as you logged`,
    hint: 'The calories you entered for this workout',
  };
}

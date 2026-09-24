// Estimated 1RM — research §1.10 (Epley, RIR-adjusted, ≤10 reps valid).
import type { ExposureSet, Rir } from '@chefer/types';
import { round2 } from './loads';

export type E1rmConfidence = 'ok' | 'low' | 'excluded';

/** ≤ 10 reps: ok; 11–12: low confidence (faded point); > 12 or < 1: excluded. */
export function e1rmConfidence(reps: number): E1rmConfidence {
  if (reps < 1 || reps > 12) {
    return 'excluded';
  }
  return reps <= 10 ? 'ok' : 'low';
}

/** Epley e1RM, using reps + RIR when the chip is present. null when excluded (>12 reps). */
export function epley(weightKg: number, reps: number, rir?: number | null): number | null {
  if (e1rmConfidence(reps) === 'excluded') {
    return null;
  }
  const effective = reps + Math.min(3, Math.max(0, rir ?? 0));
  return effective <= 1 ? round2(weightKg) : round2(weightKg * (1 + effective / 30));
}

/** Best working-set e1RM of one exposure (RIR applies to the last working set only). */
export function bestE1rm(
  sets: ExposureSet[],
  lastSetRir: Rir | null,
): { e1rmKg: number; weightKg: number; reps: number; lowConfidence: boolean } | null {
  const working = sets.filter((s) => !s.isWarmup && s.completed);
  let best: { e1rmKg: number; weightKg: number; reps: number; lowConfidence: boolean } | null =
    null;
  for (let idx = 0; idx < working.length; idx++) {
    const s = working[idx];
    if (!s || s.weightKg <= 0) {
      continue;
    }
    const e = epley(s.weightKg, s.reps, idx === working.length - 1 ? lastSetRir : null);
    if (e !== null && (best === null || e > best.e1rmKg)) {
      best = {
        e1rmKg: e,
        weightKg: s.weightKg,
        reps: s.reps,
        lowConfidence: e1rmConfidence(s.reps) === 'low',
      };
    }
  }
  return best;
}

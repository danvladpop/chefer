// Estimated 1RM — research §1.10 (Epley, RIR-adjusted, ≤10 reps valid).
import type { ExposureSet, Rir } from '@chefer/types';
import { notImplemented } from './_stub';

export type E1rmConfidence = 'ok' | 'low' | 'excluded';

/** Epley e1RM, using reps + RIR when the chip is present. null when excluded (>12 reps). */
export function epley(weightKg: number, reps: number, rir?: number | null): number | null {
  return notImplemented(`epley(${weightKg}, ${reps}, ${rir})`);
}

export function e1rmConfidence(reps: number): E1rmConfidence {
  return notImplemented(`e1rmConfidence(${reps})`);
}

/** Best working-set e1RM of one exposure (RIR applies to the last working set only). */
export function bestE1rm(
  sets: ExposureSet[],
  lastSetRir: Rir | null,
): { e1rmKg: number; weightKg: number; reps: number; lowConfidence: boolean } | null {
  return notImplemented(`bestE1rm(${sets.length}, ${lastSetRir})`);
}

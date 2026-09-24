// Warm-up generation — research §1.9. Warm-ups never count as volume or progression.
import type { EquipmentProfile, ExerciseSlot, WarmupSet } from '@chefer/types';
import { KG_EPS, roundToAchievable, stepDown } from './loads';

const RAMPED_EQUIPMENT = new Set(['BARBELL', 'SMITH', 'MACHINE', 'DUMBBELL']);

/**
 * Full ramp for the first exercise of a movement pattern: (empty bar × 10 for
 * barbells at W ≥ 40 kg), 50 % × 8, 70 % × 5, and 85 % × 2 when W ≥ 80 kg or the
 * range tops out at ≤ 6. Later exercises for the same pattern get one 60 % × 6
 * feeler at W ≥ 40 kg. Loads round to the nearest achievable; a set within one
 * step of the previous warm-up or of W, or lighter than the empty bar, is dropped.
 */
export function warmupSets(input: {
  slot: ExerciseSlot;
  workingKg: number;
  /** First exercise of the session for this movement pattern → full ramp. */
  isFirstForPattern: boolean;
  profile: EquipmentProfile;
}): WarmupSet[] {
  const { slot, workingKg: W, profile } = input;
  const ex = slot.exercise;
  if (!RAMPED_EQUIPMENT.has(ex.equipment) || ex.loadType !== 'WEIGHTED' || ex.isTimed || W <= 0) {
    return [];
  }
  const barbell = ex.equipment === 'BARBELL' || ex.equipment === 'SMITH';
  const raw: { kg: number; reps: number }[] = [];
  if (!input.isFirstForPattern) {
    if (W >= 40) {
      raw.push({ kg: W * 0.6, reps: 6 });
    }
  } else {
    if (ex.equipment === 'BARBELL' && W >= 40) {
      raw.push({ kg: profile.barWeightKg, reps: 10 });
    }
    raw.push({ kg: W * 0.5, reps: 8 }, { kg: W * 0.7, reps: 5 });
    if (W >= 80 || slot.repMax <= 6) {
      raw.push({ kg: W * 0.85, reps: 2 });
    }
  }
  const out: WarmupSet[] = [];
  for (const { kg, reps } of raw) {
    const load = roundToAchievable(kg, slot, profile, 'nearest');
    // "One step" = the gap to the next lighter achievable load.
    const step = Math.max(load - stepDown(load, slot, profile), 2 * KG_EPS);
    const prev = out[out.length - 1];
    const tooLight = barbell && load < profile.barWeightKg - KG_EPS;
    const nearW = W - load <= step + KG_EPS;
    const nearPrev = prev !== undefined && load - prev.weightKg <= step + KG_EPS;
    if (tooLight || load <= 0 || nearW || nearPrev) {
      continue;
    }
    out.push({ weightKg: load, reps });
  }
  return out;
}

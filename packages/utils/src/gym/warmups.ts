// Warm-up generation — research §1.9. Warm-ups never count as volume or progression.
import type { EquipmentProfile, ExerciseSlot, WarmupSet } from '@chefer/types';
import { notImplemented } from './_stub';

export function warmupSets(input: {
  slot: ExerciseSlot;
  workingKg: number;
  /** First exercise of the session for this movement pattern → full ramp. */
  isFirstForPattern: boolean;
  profile: EquipmentProfile;
}): WarmupSet[] {
  return notImplemented(`warmupSets(${input.slot.exercise.id})`);
}

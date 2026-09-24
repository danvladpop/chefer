// Progression engine — research §1 (double progression, RIR adjustments,
// calibration, stall/deload, break re-entry). Pure and deterministic: the API
// folds it over history (source of truth) and the phone runs the same fold
// optimistically offline, so outputs MUST NOT depend on anything but inputs.
import type {
  EquipmentProfile,
  ExerciseSlot,
  Exposure,
  ProgressionOverride,
  ProgressionState,
  Suggestion,
  TrainingExperience,
  TrainingProfileFacts,
  WeightUnit,
} from '@chefer/types';
import { notImplemented } from './_stub';

/** Bump whenever any output changes (stored with every suggestion). */
export const ENGINE_VERSION = 1;

/** Rep-range bucket key (research §1.2): shared state across slots with the same range. */
export function repBucket(repMin: number, repMax: number): string {
  return `${repMin}-${repMax}`;
}

export function progressionKey(exerciseId: string, bucket: string): string {
  return `${exerciseId}|${bucket}`;
}

/** Starting state: known weight → no calibration; otherwise starting guess (research §1.7). */
export function initialState(input: {
  slot: ExerciseSlot;
  profile: EquipmentProfile;
  experience: TrainingExperience;
  knownWeightKg?: number | null;
}): ProgressionState {
  return notImplemented(`initialState(${input.slot.exercise.id})`);
}

/** Apply one finished exposure; the returned state's `next` is the raw suggestion (research §1.5). */
export function applyExposure(input: {
  slot: ExerciseSlot;
  state: ProgressionState;
  exposure: Exposure;
  profile: EquipmentProfile;
  experience: TrainingExperience;
}): ProgressionState {
  return notImplemented(`applyExposure(${input.slot.exercise.id})`);
}

/**
 * Final prescription for the next session on `today` (localDate): applies the
 * break re-entry gap (§1.8), an active deload (§1.6) and a user override (D5c)
 * on top of state.next.
 */
export function prescribe(input: {
  slot: ExerciseSlot;
  state: ProgressionState;
  override: ProgressionOverride | null;
  profile: EquipmentProfile;
  facts: TrainingProfileFacts;
  today: string;
  deload: boolean;
}): Suggestion {
  return notImplemented(`prescribe(${input.slot.exercise.id})`);
}

/**
 * Fold the engine over an exercise's completed exposures (sorted by
 * performedAt inside). Deterministic: same inputs → same state.
 */
export function foldHistory(input: {
  slot: ExerciseSlot;
  exposures: Exposure[];
  profile: EquipmentProfile;
  experience: TrainingExperience;
  knownWeightKg?: number | null;
}): ProgressionState {
  return notImplemented(`foldHistory(${input.slot.exercise.id})`);
}

/** One-sentence explanation shown under the suggestion (research §1.11 wording). */
export function explain(suggestion: Suggestion, unit: WeightUnit): string {
  return notImplemented(`explain(${suggestion.reasonCode}, ${unit})`);
}

/** Label/value rows for the "Why?" sheet. */
export function explainInputs(
  suggestion: Suggestion,
  unit: WeightUnit,
): { label: string; value: string }[] {
  return notImplemented(`explainInputs(${suggestion.reasonCode}, ${unit})`);
}

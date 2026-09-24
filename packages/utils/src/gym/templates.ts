// Template selection & instantiation — research §3.5.
import type { RecommendInput, RoutineDayDoc, RoutineLike } from '@chefer/types';
import { notImplemented } from './_stub';
import type { ExerciseLookup } from './volume';

export function recommendTemplate(input: RecommendInput): {
  key: string;
  reason: string;
  alternatives: string[];
} {
  return notImplemented(
    `recommendTemplate(${input.days}, ${input.experience}, ${input.equipmentAccess})`,
  );
}

/** Template → routine draft (no ids), with equipment swaps applied. */
export function instantiateTemplate(
  key: string,
  equipmentAccess: RecommendInput['equipmentAccess'],
  lookup: ExerciseLookup,
): { name: string; templateKey: string; weeklyGoal: number; days: RoutineDayDoc[] } {
  return notImplemented(`instantiateTemplate(${key}, ${equipmentAccess}, ${typeof lookup})`);
}

/** Σ sets × (40 s + rest) + warm-up allowance, minutes (research §2.3 V6). */
export function estimateDurationMin(
  day: RoutineLike['days'][number],
  lookup: ExerciseLookup,
): number {
  return notImplemented(`estimateDurationMin(${day.name}, ${typeof lookup})`);
}

// Template selection & instantiation — research §3.5.
import {
  EQUIPMENT_ACCESS_SETS,
  EQUIPMENT_SWAPS,
  EXERCISE_CATALOG,
  PROGRAM_TEMPLATES,
  TEMPLATE_BY_KEY,
  type ExerciseMeta,
  type GymEquipmentAccess,
  type RecommendInput,
  type RoutineDayDoc,
  type RoutineExerciseDoc,
  type RoutineLike,
  type TrainingExperience,
} from '@chefer/types';
import { durationMinutes } from './duration';
import type { ExerciseLookup } from './volume';

/** Default target RIR (research §3): 2 on compounds, 1 on isolation. */
export function defaultTargetRir(meta: ExerciseMeta | undefined): number {
  return meta?.category === 'ISOLATION' ? 1 : 2;
}

function keyFor(prefix: 'fb2' | 'fb3' | 'ul4' | 'ppl6', experience: TrainingExperience): string {
  return `${prefix}-${experience === 'BEGINNER' ? 'beginner' : 'intermediate'}`;
}

const EQUIPMENT_NOTE: Record<RecommendInput['equipmentAccess'], string> = {
  FULL_GYM: '',
  DUMBBELLS: ' Barbell and machine lifts are swapped for dumbbell versions.',
  BODYWEIGHT: ' Lifts are swapped for bodyweight versions you can do at home.',
};

export function recommendTemplate(input: RecommendInput): {
  key: string;
  reason: string;
  alternatives: string[];
} {
  const { days, experience } = input;
  const beginner = experience === 'BEGINNER';
  let key: string;
  let reason: string;
  if (days <= 2) {
    key = keyFor('fb2', experience);
    reason =
      'Two full-body days are enough to build a base and keep what you have. 3 days grows more.';
  } else if (days === 3) {
    key = keyFor('fb3', experience);
    reason = beginner
      ? 'Full Body 3× is the best start: every muscle three times a week with simple, stable lifts.'
      : 'Full Body 3× trains every muscle often, which suits three training days best.';
  } else if (days === 4) {
    key = keyFor('ul4', experience);
    reason = 'Upper/Lower 4× gives every muscle two sessions a week with short, focused days.';
  } else if (days === 5) {
    key = keyFor('ul4', experience);
    reason = beginner
      ? 'Upper/Lower 4× covers everything in four days; use a 5th day for weak points if you like.'
      : 'Upper/Lower 4× plus an optional 5th arms-and-shoulders day fits five days best.';
  } else if (beginner) {
    key = keyFor('ul4', experience);
    reason =
      '6 days is a big jump; most beginners stick better with 3–4. We recommend Upper/Lower 4×, and Push/Pull/Legs 6× is still there if you want it.';
  } else {
    key = keyFor('ppl6', experience);
    reason = 'Push/Pull/Legs 6× gives the most frequency and volume for six training days.';
  }
  // Capped at 3 so the setup UIs show a manageable list; closest-by-days wins ties,
  // which is how ul3 (3 days) surfaces for 3-day requests without growing the list
  // for every other day count now that there are 5 templates per experience.
  const alternatives = PROGRAM_TEMPLATES.filter((t) => t.experience === experience && t.key !== key)
    .sort(
      (a, b) =>
        Math.abs(a.daysPerWeek - days) - Math.abs(b.daysPerWeek - days) ||
        a.daysPerWeek - b.daysPerWeek,
    )
    .slice(0, 3)
    .map((t) => t.key);
  return { key, reason: reason + EQUIPMENT_NOTE[input.equipmentAccess], alternatives };
}

/** Research §3.5: dumbbell gyms widen ranges (big DB jumps) — compounds 8–15, isolation 12–20. */
function adaptRange(
  meta: ExerciseMeta | undefined,
  swapped: boolean,
  repMin: number,
  repMax: number,
  access: RecommendInput['equipmentAccess'],
): [number, number] {
  if (!meta) {
    return [repMin, repMax];
  }
  if (meta.loadType !== 'WEIGHTED' || meta.isTimed) {
    // Reps-first progression needs the exercise's own (wide) range.
    return swapped ? [meta.repMin, meta.repMax] : [repMin, repMax];
  }
  if (access === 'DUMBBELLS' && meta.equipment === 'DUMBBELL') {
    return meta.category === 'COMPOUND' ? [8, Math.max(repMax, 15)] : [12, Math.max(repMax, 20)];
  }
  // Swapping keeps the slot's sets and reps (research §3 conventions).
  return [repMin, repMax];
}

/** Can a user with this equipment answer do this exercise? (audit F-GYM-2-1) */
export function isWithinEquipmentAccess(
  meta: Pick<ExerciseMeta, 'equipment'>,
  access: GymEquipmentAccess,
): boolean {
  return EQUIPMENT_ACCESS_SETS[access].includes(meta.equipment);
}

/**
 * Closest in-set stand-in for an exercise the user can't do: same swap group
 * first, then same movement pattern; ties go to the same category and the
 * same primary muscle, then catalog order (deterministic). null = nothing
 * trains that pattern with this equipment, so the slot is dropped.
 */
export function closestAccessibleAlternative(
  meta: ExerciseMeta,
  access: GymEquipmentAccess,
  pool: readonly ExerciseMeta[] = EXERCISE_CATALOG,
): ExerciseMeta | null {
  let best: ExerciseMeta | null = null;
  let bestScore = 0;
  for (const candidate of pool) {
    if (candidate.id === meta.id || !isWithinEquipmentAccess(candidate, access)) {
      continue;
    }
    let score = 0;
    if (meta.swapGroup !== null && candidate.swapGroup === meta.swapGroup) {
      score += 8;
    }
    if (candidate.movementPattern === meta.movementPattern) {
      score += 4;
    }
    if (score === 0) {
      continue;
    }
    if (candidate.category === meta.category) {
      score += 2;
    }
    if (candidate.primaryMuscles[0] === meta.primaryMuscles[0]) {
      score += 1;
    }
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Resolve one template slot for an equipment answer: the curated swap table
 * first (research §3.5), then — if that still leaves equipment the user
 * doesn't have — the closest in-set alternative. null = drop the slot.
 * Unknown exercises (lookup miss) are kept as-is.
 */
export function resolveSlotExercise(
  exerciseId: string,
  equipmentAccess: GymEquipmentAccess,
  lookup: ExerciseLookup,
  pool: readonly ExerciseMeta[] = EXERCISE_CATALOG,
): string | null {
  if (equipmentAccess === 'FULL_GYM') {
    return exerciseId;
  }
  const swapped = EQUIPMENT_SWAPS[equipmentAccess][exerciseId] ?? exerciseId;
  const meta = lookup(swapped);
  if (!meta || isWithinEquipmentAccess(meta, equipmentAccess)) {
    return swapped;
  }
  return closestAccessibleAlternative(meta, equipmentAccess, pool)?.id ?? null;
}

/**
 * Template → routine draft (no ids), with equipment swaps applied. Every slot
 * of the result is within the equipment access set (audit F-GYM-2-1): an
 * out-of-set exercise is replaced by the closest alternative, or dropped.
 */
export function instantiateTemplate(
  key: string,
  equipmentAccess: RecommendInput['equipmentAccess'],
  lookup: ExerciseLookup,
  pool: readonly ExerciseMeta[] = EXERCISE_CATALOG,
): { name: string; templateKey: string; weeklyGoal: number; days: RoutineDayDoc[] } {
  const template = TEMPLATE_BY_KEY.get(key);
  if (!template) {
    throw new Error(`Unknown program template "${key}"`);
  }
  const days: RoutineDayDoc[] = template.days.map((day) => {
    const exercises: RoutineExerciseDoc[] = [];
    for (const x of day.exercises) {
      const exerciseId = resolveSlotExercise(x.exerciseId, equipmentAccess, lookup, pool);
      if (exerciseId === null) {
        continue;
      }
      const meta = lookup(exerciseId);
      const [repMin, repMax] = adaptRange(
        meta,
        exerciseId !== x.exerciseId,
        x.repMin,
        x.repMax,
        equipmentAccess,
      );
      const existing = exercises.find((e) => e.exerciseId === exerciseId);
      if (existing) {
        // Two slots collapsed onto the same exercise: keep the volume, cap at 5 sets (V11).
        existing.sets = Math.min(5, existing.sets + x.sets);
        continue;
      }
      exercises.push({
        exerciseId,
        sets: x.sets,
        repMin,
        repMax,
        targetRir: defaultTargetRir(meta),
        restSec: meta?.restSec ?? 120,
        supersetGroup: null,
        notes: null,
      });
    }
    return { name: day.name, plannedWeekday: day.plannedWeekday, exercises };
  });
  return { name: template.name, templateKey: template.key, weeklyGoal: template.daysPerWeek, days };
}

/** Σ sets × (40 s + rest) + warm-up allowance, minutes (research §2.3 V6). */
export function estimateDurationMin(
  day: RoutineLike['days'][number],
  lookup: ExerciseLookup,
): number {
  return durationMinutes(day, lookup);
}

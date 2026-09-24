// Weekly volume & routine validation — research §2.2/§2.3 (fractional sets:
// primary = 1, secondary = 0.5; rules V1–V11, gentle, never blocking).
import {
  VOLUME_GROUPS,
  type ExerciseMeta,
  type Muscle,
  type MuscleVolume,
  type MuscleVolumeWeekDto,
  type RoutineHint,
  type RoutineLike,
  type SessionSummaryDto,
  type TrainingExperience,
  type VolumeGroup,
} from '@chefer/types';
import { durationMinutes } from './duration';
import { weekStartOf } from './weeks';

export type ExerciseLookup = (id: string) => ExerciseMeta | undefined;

export interface MuscleLandmark {
  /** Sets that maintain the muscle. */
  maintenance: number;
  /** "Grows for most" floor (intermediate; beginners −2). */
  floor: number;
  productiveMin: number;
  productiveMax: number;
  /** V3 threshold. For front delts this applies to DIRECT sets. */
  warnAbove: number;
}

/** Research §2.2, fractional sets per week. */
export const MUSCLE_LANDMARKS: Record<VolumeGroup, MuscleLandmark> = {
  chest: { maintenance: 4, floor: 8, productiveMin: 10, productiveMax: 20, warnAbove: 22 },
  back: { maintenance: 6, floor: 10, productiveMin: 12, productiveMax: 22, warnAbove: 25 },
  quads: { maintenance: 6, floor: 8, productiveMin: 10, productiveMax: 18, warnAbove: 20 },
  hamstrings: { maintenance: 4, floor: 6, productiveMin: 8, productiveMax: 16, warnAbove: 18 },
  glutes: { maintenance: 0, floor: 4, productiveMin: 6, productiveMax: 16, warnAbove: 20 },
  'side-delts': { maintenance: 4, floor: 6, productiveMin: 8, productiveMax: 20, warnAbove: 25 },
  'rear-delts': { maintenance: 0, floor: 4, productiveMin: 6, productiveMax: 16, warnAbove: 22 },
  'front-delts': { maintenance: 0, floor: 0, productiveMin: 0, productiveMax: 8, warnAbove: 12 },
  biceps: { maintenance: 2, floor: 6, productiveMin: 8, productiveMax: 16, warnAbove: 20 },
  triceps: { maintenance: 2, floor: 6, productiveMin: 8, productiveMax: 16, warnAbove: 20 },
  calves: { maintenance: 4, floor: 6, productiveMin: 8, productiveMax: 16, warnAbove: 20 },
  abs: { maintenance: 0, floor: 0, productiveMin: 0, productiveMax: 12, warnAbove: 20 },
};

export const VOLUME_GROUP_LABELS: Record<VolumeGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  'side-delts': 'Side delts',
  'rear-delts': 'Rear delts',
  'front-delts': 'Front delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  calves: 'Calves',
  abs: 'Abs',
};

/** Rule V1/V2/V5 apply to these (research §2.3). */
export const MAJOR_GROUPS: readonly VolumeGroup[] = [
  'chest',
  'back',
  'quads',
  'hamstrings',
  'side-delts',
];

const GROUPS = Object.keys(VOLUME_GROUPS) as VolumeGroup[];

const V2_SUGGESTION: Partial<Record<VolumeGroup, string>> = {
  chest: 'a press or a fly',
  back: 'a row or a pulldown',
  quads: 'a squat or a leg press',
  hamstrings: 'a curl or RDL',
  'side-delts': 'a lateral raise',
};

/** Beginners grow on less: each floor moves down by 2 (research §2.2). */
export function landmarkFor(group: VolumeGroup, experience: TrainingExperience): MuscleLandmark {
  const base = MUSCLE_LANDMARKS[group];
  return experience === 'BEGINNER' ? { ...base, floor: Math.max(0, base.floor - 2) } : base;
}

/** Fractional weight of one set of `ex` for `group`: 1 primary, 0.5 secondary, else 0. */
export function groupShare(ex: ExerciseMeta, group: VolumeGroup): number {
  const muscles: readonly Muscle[] = VOLUME_GROUPS[group];
  if (ex.primaryMuscles.some((m) => muscles.includes(m))) {
    return 1;
  }
  return ex.secondaryMuscles.some((m) => muscles.includes(m)) ? 0.5 : 0;
}

type DayExercise = RoutineLike['days'][number]['exercises'][number];

/** Fractional sets per group for one list of exercises. */
function fractionalFor(
  exercises: DayExercise[],
  lookup: ExerciseLookup,
): Record<VolumeGroup, { direct: number; fractional: number }> {
  const out = Object.fromEntries(GROUPS.map((g) => [g, { direct: 0, fractional: 0 }])) as Record<
    VolumeGroup,
    { direct: number; fractional: number }
  >;
  for (const e of exercises) {
    const meta = lookup(e.exerciseId);
    if (!meta) {
      continue;
    }
    for (const g of GROUPS) {
      const share = groupShare(meta, g);
      out[g].fractional += e.sets * share;
      if (share === 1) {
        out[g].direct += e.sets;
      }
    }
  }
  return out;
}

export function volumeByGroup(
  routine: RoutineLike,
  lookup: ExerciseLookup,
  experience: TrainingExperience,
): MuscleVolume[] {
  const perDay = routine.days.map((d) => fractionalFor(d.exercises, lookup));
  return GROUPS.map((group) => {
    const lm = landmarkFor(group, experience);
    let direct = 0;
    let fractional = 0;
    let days = 0;
    for (const day of perDay) {
      direct += day[group].direct;
      fractional += day[group].fractional;
      if (day[group].direct > 0) {
        days += 1;
      }
    }
    return {
      group,
      direct,
      fractional,
      days,
      floor: lm.floor,
      productiveMax: lm.productiveMax,
      warnAbove: lm.warnAbove,
    };
  });
}

function n(x: number): string {
  return String(Math.round(x * 10) / 10);
}

export function validateRoutine(
  routine: RoutineLike,
  lookup: ExerciseLookup,
  experience: TrainingExperience,
  opts: { suppressLowVolume?: boolean } = {},
): RoutineHint[] {
  const hints: RoutineHint[] = [];
  const volume = volumeByGroup(routine, lookup, experience);
  const byGroup = new Map(volume.map((v) => [v.group, v]));

  for (const v of volume) {
    const group = v.group as VolumeGroup;
    const lm = landmarkFor(group, experience);
    const label = VOLUME_GROUP_LABELS[group];
    const major = MAJOR_GROUPS.includes(group);
    // V2 very low (below maintenance) takes precedence over V1 for the same muscle.
    if (major && v.fractional < lm.maintenance) {
      hints.push({
        rule: 'V2',
        level: 'info',
        group,
        message:
          v.direct === 0
            ? `${label} get no direct work. Add ${V2_SUGGESTION[group] ?? 'an exercise'}?`
            : `${label}: ${n(v.fractional)} sets/week, below the ~${lm.maintenance} that maintains muscle.`,
      });
    } else if (major && !opts.suppressLowVolume && v.fractional < lm.floor) {
      hints.push({
        rule: 'V1',
        level: 'info',
        group,
        message: `${label}: ${n(v.fractional)} sets/week. Most people need about ${lm.floor}–${lm.productiveMin} to keep growing.`,
      });
    }
    const highValue = group === 'front-delts' ? v.direct : v.fractional;
    if (highValue > lm.warnAbove) {
      hints.push({
        rule: 'V3',
        level: 'warning',
        group,
        message: `${label}: ${n(highValue)} sets/week. That's more than most people recover from, so consider trimming.`,
      });
    }
    if (major && v.fractional >= 8 && v.days === 1) {
      const dayName =
        routine.days.find((d) => fractionalFor(d.exercises, lookup)[group].direct > 0)?.name ??
        'one day';
      hints.push({
        rule: 'V5',
        level: 'info',
        group,
        message: `All your ${label.toLowerCase()} work is on ${dayName}. Splitting it over 2 days tends to work better.`,
      });
    }
  }

  routine.days.forEach((day, dayIndex) => {
    const frac = fractionalFor(day.exercises, lookup);
    for (const g of GROUPS) {
      if (frac[g].fractional > 11) {
        hints.push({
          rule: 'V4',
          level: 'info',
          group: g,
          dayIndex,
          message: `${day.name} has ${n(frac[g].fractional)} ${VOLUME_GROUP_LABELS[g].toLowerCase()} sets. Extra sets past about 11 add little; move some to another day.`,
        });
      }
    }
    const sets = day.exercises.reduce((s, e) => s + e.sets, 0);
    const minutes = durationMinutes(day, lookup);
    if (sets > 25 || minutes > 90) {
      hints.push({
        rule: 'V6',
        level: 'warning',
        dayIndex,
        message:
          minutes > 90
            ? `${day.name} is about ${minutes} min. Long sessions get skipped; consider splitting it.`
            : `${day.name} has ${sets} working sets. Long sessions get skipped; consider splitting it.`,
      });
    }
    for (const e of day.exercises) {
      const meta = lookup(e.exerciseId);
      if (!meta || meta.isTimed) {
        continue;
      }
      const width = e.repMax - e.repMin;
      const wideIso =
        meta.category === 'ISOLATION' &&
        (meta.equipment === 'DUMBBELL' || meta.equipment === 'CABLE');
      if (width < 2 || (wideIso && width < 4)) {
        hints.push({
          rule: 'V7',
          level: 'info',
          dayIndex,
          exerciseId: e.exerciseId,
          message: `${e.repMin}–${e.repMax} is a narrow range. Double progression works best with room, e.g. ${e.repMin}–${e.repMin + (wideIso ? 6 : 4)}.`,
        });
      }
      if (e.repMax > 30) {
        hints.push({
          rule: 'V8',
          level: 'info',
          dayIndex,
          exerciseId: e.exerciseId,
          message: 'Sets above 30 reps are mostly endurance work.',
        });
      } else if (meta.category === 'ISOLATION' && e.repMin < 5) {
        hints.push({
          rule: 'V8',
          level: 'info',
          dayIndex,
          exerciseId: e.exerciseId,
          message:
            'Isolation work under 5 reps is hard on joints for little gain; 8–15 works better.',
        });
      }
      if (meta.category === 'COMPOUND' && e.restSec < 60) {
        hints.push({
          rule: 'V10',
          level: 'info',
          dayIndex,
          exerciseId: e.exerciseId,
          message: 'Under 60 s rest tends to cost reps on compounds. 2 min is a good default.',
        });
      }
      if (e.sets > 5) {
        hints.push({
          rule: 'V11',
          level: 'info',
          dayIndex,
          exerciseId: e.exerciseId,
          message: 'Past about 4–5 sets, a second exercise usually beats more of the same.',
        });
      }
    }
  });

  const push = (byGroup.get('chest')?.direct ?? 0) + (byGroup.get('front-delts')?.direct ?? 0);
  const pull = byGroup.get('back')?.direct ?? 0;
  if (push > 0 && push > 1.5 * pull) {
    hints.push({
      rule: 'V9',
      level: 'info',
      message: 'You press more than you pull. Adding rows helps shoulder balance.',
    });
  }
  return hints;
}

/** Completed working sets per volume group per week (stats chart). */
export function completedSetsByWeek(
  sessions: SessionSummaryDto[],
  lookup: ExerciseLookup,
): MuscleVolumeWeekDto[] {
  const weeks = new Map<string, Record<string, number>>();
  for (const s of sessions) {
    if (s.status !== 'COMPLETED') {
      continue;
    }
    const wk = weekStartOf(s.localDate);
    const bucket = weeks.get(wk) ?? Object.fromEntries(GROUPS.map((g) => [g, 0]));
    for (const ex of s.exercises) {
      const meta = lookup(ex.exerciseId);
      if (!meta || ex.skipped) {
        continue;
      }
      const done = ex.sets.filter((x) => !x.isWarmup && x.completed).length;
      for (const g of GROUPS) {
        bucket[g] = (bucket[g] ?? 0) + done * groupShare(meta, g);
      }
    }
    weeks.set(wk, bucket);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, sets]) => ({ weekStart, sets }));
}

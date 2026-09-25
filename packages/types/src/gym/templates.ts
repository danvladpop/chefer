// ─── Program templates (docs/gym/programming-research.md §3) ─────────────────
// Static data. Selection (recommendTemplate) and equipment adaptation
// (instantiateTemplate) live in the engine (@chefer/utils gym/templates).
// Weekday convention: 0 = Monday … 6 = Sunday.

import type { GymEquipmentAccess, TrainingExperience } from './vocab';

export interface TemplateExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface TemplateDay {
  name: string;
  plannedWeekday: number;
  exercises: TemplateExercise[];
}

export interface ProgramTemplate {
  key: string;
  name: string;
  daysPerWeek: number;
  experience: TrainingExperience;
  description: string;
  /** Suppress volume rule V1 (minimum-dose template, research §3.1). */
  suppressLowVolumeHints?: boolean;
  days: TemplateDay[];
}

const x = (exerciseId: string, sets: number, repMin: number, repMax: number): TemplateExercise => ({
  exerciseId,
  sets,
  repMin,
  repMax,
});

export const PROGRAM_TEMPLATES: readonly ProgramTemplate[] = [
  {
    key: 'fb2-beginner',
    name: 'Full Body 2×',
    daysPerWeek: 2,
    experience: 'BEGINNER',
    description: 'Enough to build a base and keep what you have. 3 days grows more.',
    suppressLowVolumeHints: true,
    days: [
      {
        name: 'Full Body A',
        plannedWeekday: 0,
        exercises: [
          x('goblet-squat', 3, 8, 12),
          x('dumbbell-bench-press', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('romanian-deadlift', 2, 8, 12),
          x('dumbbell-lateral-raise', 2, 12, 20),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Full Body B',
        plannedWeekday: 3,
        exercises: [
          x('leg-press', 3, 10, 15),
          x('machine-chest-press', 3, 8, 12),
          x('seated-cable-row', 3, 8, 12),
          x('seated-leg-curl', 2, 10, 15),
          x('overhead-cable-triceps-extension', 2, 10, 15),
          x('standing-calf-raise', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'fb2-intermediate',
    name: 'Full Body 2×',
    daysPerWeek: 2,
    experience: 'INTERMEDIATE',
    description: 'A minimum effective dose for busy weeks — keeps strength and size, grows slowly.',
    suppressLowVolumeHints: true,
    days: [
      {
        name: 'Full Body A',
        plannedWeekday: 0,
        exercises: [
          x('back-squat', 3, 6, 8),
          x('barbell-bench-press', 3, 6, 8),
          x('chest-supported-row', 3, 8, 12),
          x('romanian-deadlift', 3, 6, 10),
          x('dumbbell-lateral-raise', 3, 12, 20),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Full Body B',
        plannedWeekday: 3,
        exercises: [
          x('leg-press', 3, 10, 15),
          x('incline-dumbbell-press', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('seated-leg-curl', 3, 10, 15),
          x('overhead-cable-triceps-extension', 2, 10, 15),
          x('standing-calf-raise', 3, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'fb3-beginner',
    name: 'Full Body 3×',
    daysPerWeek: 3,
    experience: 'BEGINNER',
    description:
      'The best start: every muscle trained three times a week with simple, stable lifts.',
    days: [
      {
        name: 'Full Body A',
        plannedWeekday: 0,
        exercises: [
          x('goblet-squat', 3, 8, 12),
          x('dumbbell-bench-press', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('seated-leg-curl', 2, 10, 15),
          x('dumbbell-lateral-raise', 2, 12, 20),
        ],
      },
      {
        name: 'Full Body B',
        plannedWeekday: 2,
        exercises: [
          x('romanian-deadlift', 3, 8, 12),
          x('seated-dumbbell-shoulder-press', 2, 8, 12),
          x('seated-cable-row', 3, 8, 12),
          x('leg-extension', 2, 10, 15),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Full Body C',
        plannedWeekday: 4,
        exercises: [
          x('leg-press', 3, 10, 15),
          x('machine-chest-press', 3, 8, 12),
          x('lat-pulldown', 2, 8, 12),
          x('triceps-pushdown', 2, 10, 15),
          x('standing-calf-raise', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'fb3-intermediate',
    name: 'Full Body 3×',
    daysPerWeek: 3,
    experience: 'INTERMEDIATE',
    description: 'High frequency on the big lifts with enough isolation work to keep growing.',
    days: [
      {
        name: 'Full Body A',
        plannedWeekday: 0,
        exercises: [
          x('back-squat', 3, 6, 8),
          x('barbell-bench-press', 4, 6, 8),
          x('chest-supported-row', 3, 8, 12),
          x('seated-leg-curl', 3, 10, 15),
          x('dumbbell-lateral-raise', 3, 12, 20),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Full Body B',
        plannedWeekday: 2,
        exercises: [
          x('romanian-deadlift', 3, 6, 10),
          x('incline-dumbbell-press', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('leg-press', 3, 10, 15),
          x('overhead-cable-triceps-extension', 2, 10, 15),
          x('standing-calf-raise', 3, 10, 15),
        ],
      },
      {
        name: 'Full Body C',
        plannedWeekday: 4,
        exercises: [
          x('hack-squat', 3, 8, 12),
          x('machine-chest-press', 3, 8, 12),
          x('seated-cable-row', 3, 8, 12),
          x('leg-extension', 2, 12, 15),
          x('lying-leg-curl', 2, 10, 15),
          x('dumbbell-lateral-raise', 3, 12, 20),
          x('triceps-pushdown', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'ul3-beginner',
    name: 'Upper / Lower 3× (2 upper + 1 lower)',
    daysPerWeek: 3,
    experience: 'BEGINNER',
    description:
      'Two upper days and one bigger lower day — more chest and back work than Full Body 3×, but legs train only once a week instead of three.',
    days: [
      {
        name: 'Upper A',
        plannedWeekday: 0,
        exercises: [
          x('dumbbell-bench-press', 3, 8, 12),
          x('seated-cable-row', 3, 8, 12),
          x('lat-pulldown', 2, 8, 12),
          x('dumbbell-lateral-raise', 2, 12, 20),
          x('triceps-pushdown', 2, 10, 15),
        ],
      },
      {
        name: 'Lower',
        plannedWeekday: 2,
        exercises: [
          x('goblet-squat', 4, 8, 12),
          x('romanian-deadlift', 3, 8, 12),
          x('seated-leg-curl', 3, 10, 15),
          x('standing-calf-raise', 2, 10, 15),
        ],
      },
      {
        name: 'Upper B',
        plannedWeekday: 4,
        exercises: [
          x('machine-chest-press', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('incline-dumbbell-press', 2, 8, 12),
          x('dumbbell-lateral-raise', 2, 12, 20),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'ul3-intermediate',
    name: 'Upper / Lower 3× (2 upper + 1 lower)',
    daysPerWeek: 3,
    experience: 'INTERMEDIATE',
    description:
      'Heavier upper-body work split over two days plus one fuller lower day — more volume up top than Full Body 3×, traded for legs at only 1×/week frequency.',
    days: [
      {
        name: 'Upper A',
        plannedWeekday: 0,
        exercises: [
          x('barbell-bench-press', 3, 6, 8),
          x('chest-supported-row', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('incline-dumbbell-press', 2, 8, 12),
          x('dumbbell-lateral-raise', 3, 12, 20),
          x('triceps-pushdown', 2, 10, 15),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Lower',
        plannedWeekday: 2,
        exercises: [
          x('back-squat', 4, 5, 8),
          x('romanian-deadlift', 3, 6, 10),
          x('leg-extension', 3, 10, 15),
          x('lying-leg-curl', 3, 10, 15),
          x('standing-calf-raise', 3, 10, 15),
          x('cable-crunch', 2, 10, 15),
        ],
      },
      {
        name: 'Upper B',
        plannedWeekday: 4,
        exercises: [
          x('machine-chest-press', 3, 8, 12),
          x('pull-up', 3, 6, 10),
          x('seated-cable-row', 3, 8, 12),
          x('cable-fly', 2, 12, 15),
          x('dumbbell-lateral-raise', 3, 12, 20),
          x('overhead-cable-triceps-extension', 2, 10, 15),
          x('incline-dumbbell-curl', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'ul4-beginner',
    name: 'Upper / Lower 4×',
    daysPerWeek: 4,
    experience: 'BEGINNER',
    description: 'Two upper and two lower days — short sessions, each muscle twice a week.',
    days: [
      {
        name: 'Upper A',
        plannedWeekday: 0,
        exercises: [
          x('dumbbell-bench-press', 3, 8, 12),
          x('seated-cable-row', 3, 8, 12),
          x('lat-pulldown', 2, 8, 12),
          x('dumbbell-lateral-raise', 2, 12, 20),
          x('triceps-pushdown', 2, 10, 15),
        ],
      },
      {
        name: 'Lower A',
        plannedWeekday: 1,
        exercises: [
          x('goblet-squat', 3, 8, 12),
          x('romanian-deadlift', 3, 8, 12),
          x('seated-leg-curl', 2, 10, 15),
          x('standing-calf-raise', 2, 10, 15),
          x('plank', 2, 30, 60),
        ],
      },
      {
        name: 'Upper B',
        plannedWeekday: 3,
        exercises: [
          x('machine-chest-press', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('incline-dumbbell-press', 2, 8, 12),
          x('dumbbell-lateral-raise', 2, 12, 20),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Lower B',
        plannedWeekday: 4,
        exercises: [
          x('leg-press', 3, 10, 15),
          x('hip-thrust', 2, 8, 12),
          x('leg-extension', 2, 12, 15),
          x('seated-leg-curl', 2, 10, 15),
          x('standing-calf-raise', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'ul4-intermediate',
    name: 'Upper / Lower 4×',
    daysPerWeek: 4,
    experience: 'INTERMEDIATE',
    description:
      'The classic 4-day split: heavy compounds plus targeted isolation, every muscle twice.',
    days: [
      {
        name: 'Upper A',
        plannedWeekday: 0,
        exercises: [
          x('barbell-bench-press', 3, 6, 8),
          x('chest-supported-row', 3, 8, 12),
          x('lat-pulldown', 3, 8, 12),
          x('incline-dumbbell-press', 2, 8, 12),
          x('dumbbell-lateral-raise', 3, 12, 20),
          x('triceps-pushdown', 2, 10, 15),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Lower A',
        plannedWeekday: 1,
        exercises: [
          x('back-squat', 3, 5, 8),
          x('romanian-deadlift', 3, 6, 10),
          x('leg-press', 2, 10, 15),
          x('seated-leg-curl', 3, 10, 15),
          x('standing-calf-raise', 3, 10, 15),
          x('cable-crunch', 2, 10, 15),
        ],
      },
      {
        name: 'Upper B',
        plannedWeekday: 3,
        exercises: [
          x('machine-chest-press', 3, 8, 12),
          x('pull-up', 3, 6, 10),
          x('seated-cable-row', 3, 8, 12),
          x('cable-fly', 2, 12, 15),
          x('dumbbell-lateral-raise', 3, 12, 20),
          x('overhead-cable-triceps-extension', 2, 10, 15),
          x('incline-dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Lower B',
        plannedWeekday: 4,
        exercises: [
          x('hack-squat', 3, 8, 12),
          x('hip-thrust', 3, 8, 12),
          x('bulgarian-split-squat', 2, 8, 12),
          x('lying-leg-curl', 3, 10, 15),
          x('leg-extension', 2, 12, 15),
          x('seated-calf-raise', 3, 10, 15),
          x('hanging-knee-raise', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'ppl6-beginner',
    name: 'Push / Pull / Legs 6×',
    daysPerWeek: 6,
    experience: 'BEGINNER',
    description:
      'Short daily sessions. Six days is a big commitment — most beginners stick better with 3–4.',
    days: [
      {
        name: 'Push A',
        plannedWeekday: 0,
        exercises: [
          x('dumbbell-bench-press', 3, 8, 12),
          x('seated-dumbbell-shoulder-press', 2, 8, 12),
          x('dumbbell-lateral-raise', 2, 12, 20),
          x('triceps-pushdown', 2, 10, 15),
        ],
      },
      {
        name: 'Pull A',
        plannedWeekday: 1,
        exercises: [
          x('lat-pulldown', 3, 8, 12),
          x('seated-cable-row', 3, 8, 12),
          x('face-pull', 2, 12, 20),
          x('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Legs A',
        plannedWeekday: 2,
        exercises: [
          x('goblet-squat', 3, 8, 12),
          x('romanian-deadlift', 3, 8, 12),
          x('seated-leg-curl', 2, 10, 15),
          x('standing-calf-raise', 2, 10, 15),
        ],
      },
      {
        name: 'Push B',
        plannedWeekday: 3,
        exercises: [
          x('machine-chest-press', 3, 8, 12),
          x('incline-dumbbell-press', 2, 8, 12),
          x('dumbbell-lateral-raise', 2, 12, 20),
          x('overhead-cable-triceps-extension', 2, 10, 15),
        ],
      },
      {
        name: 'Pull B',
        plannedWeekday: 4,
        exercises: [
          x('chest-supported-row', 3, 8, 12),
          x('lat-pulldown', 2, 8, 12),
          x('reverse-pec-deck', 2, 12, 20),
          x('hammer-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Legs B',
        plannedWeekday: 5,
        exercises: [
          x('leg-press', 3, 10, 15),
          x('hip-thrust', 2, 8, 12),
          x('seated-leg-curl', 2, 10, 15),
          x('leg-extension', 2, 12, 15),
          x('standing-calf-raise', 2, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'ppl6-intermediate',
    name: 'Push / Pull / Legs 6×',
    daysPerWeek: 6,
    experience: 'INTERMEDIATE',
    description: 'Maximum frequency and volume for experienced lifters who can train six days.',
    days: [
      {
        name: 'Push A',
        plannedWeekday: 0,
        exercises: [
          x('barbell-bench-press', 3, 6, 8),
          x('overhead-press', 2, 6, 10),
          x('incline-dumbbell-press', 2, 8, 12),
          x('dumbbell-lateral-raise', 4, 12, 20),
          x('triceps-pushdown', 2, 10, 15),
          x('overhead-cable-triceps-extension', 2, 10, 15),
        ],
      },
      {
        name: 'Pull A',
        plannedWeekday: 1,
        exercises: [
          x('pull-up', 3, 6, 10),
          x('barbell-row', 3, 6, 10),
          x('face-pull', 2, 12, 20),
          x('dumbbell-curl', 3, 10, 15),
          x('hammer-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Legs A',
        plannedWeekday: 2,
        exercises: [
          x('back-squat', 3, 5, 8),
          x('romanian-deadlift', 3, 6, 10),
          x('leg-extension', 2, 12, 15),
          x('seated-leg-curl', 3, 10, 15),
          x('standing-calf-raise', 3, 10, 15),
        ],
      },
      {
        name: 'Push B',
        plannedWeekday: 3,
        exercises: [
          x('incline-dumbbell-press', 3, 8, 12),
          x('machine-chest-press', 3, 8, 12),
          x('cable-fly', 2, 12, 15),
          x('dumbbell-lateral-raise', 4, 12, 20),
          x('overhead-cable-triceps-extension', 2, 10, 15),
        ],
      },
      {
        name: 'Pull B',
        plannedWeekday: 4,
        exercises: [
          x('lat-pulldown', 3, 8, 12),
          x('seated-cable-row', 3, 8, 12),
          x('chest-supported-row', 2, 8, 12),
          x('reverse-pec-deck', 2, 12, 20),
          x('incline-dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        name: 'Legs B',
        plannedWeekday: 5,
        exercises: [
          x('hack-squat', 3, 8, 12),
          x('hip-thrust', 3, 8, 12),
          x('lying-leg-curl', 3, 10, 15),
          x('bulgarian-split-squat', 2, 8, 12),
          x('seated-calf-raise', 3, 10, 15),
          x('hanging-knee-raise', 2, 10, 15),
        ],
      },
    ],
  },
];

/**
 * Equipment adaptation (research §3.5): exercise → replacement when the user's
 * gym lacks it. Unlisted exercises are kept (the user can swap in the editor).
 * The engine may extend this map; entries must reference catalog slugs.
 */
export const EQUIPMENT_SWAPS: Record<
  Exclude<GymEquipmentAccess, 'FULL_GYM'>,
  Readonly<Record<string, string>>
> = {
  DUMBBELLS: {
    'barbell-bench-press': 'dumbbell-bench-press',
    'machine-chest-press': 'dumbbell-bench-press',
    'cable-fly': 'incline-dumbbell-press',
    'overhead-press': 'seated-dumbbell-shoulder-press',
    'back-squat': 'goblet-squat',
    'front-squat': 'goblet-squat',
    'hack-squat': 'bulgarian-split-squat',
    'leg-press': 'goblet-squat',
    'leg-extension': 'bulgarian-split-squat',
    'barbell-row': 'single-arm-dumbbell-row',
    'chest-supported-row': 'single-arm-dumbbell-row',
    'seated-cable-row': 'single-arm-dumbbell-row',
    'lat-pulldown': 'pull-up',
    'face-pull': 'reverse-pec-deck',
    'reverse-pec-deck': 'single-arm-dumbbell-row',
    'cable-lateral-raise': 'dumbbell-lateral-raise',
    'triceps-pushdown': 'skull-crusher',
    'overhead-cable-triceps-extension': 'skull-crusher',
    'seated-leg-curl': 'romanian-deadlift',
    'lying-leg-curl': 'romanian-deadlift',
    'standing-calf-raise': 'dumbbell-shrug',
    'seated-calf-raise': 'dumbbell-shrug',
    'cable-crunch': 'hanging-knee-raise',
  },
  BODYWEIGHT: {
    'barbell-bench-press': 'push-up',
    'dumbbell-bench-press': 'push-up',
    'incline-dumbbell-press': 'push-up',
    'machine-chest-press': 'push-up',
    'cable-fly': 'push-up',
    'overhead-press': 'push-up',
    'seated-dumbbell-shoulder-press': 'push-up',
    'back-squat': 'bulgarian-split-squat',
    'front-squat': 'bulgarian-split-squat',
    'hack-squat': 'bulgarian-split-squat',
    'goblet-squat': 'bulgarian-split-squat',
    'leg-press': 'walking-lunge',
    'leg-extension': 'walking-lunge',
    'romanian-deadlift': 'hip-thrust',
    'barbell-row': 'chin-up',
    'chest-supported-row': 'chin-up',
    'seated-cable-row': 'chin-up',
    'single-arm-dumbbell-row': 'chin-up',
    'lat-pulldown': 'pull-up',
    'triceps-pushdown': 'chest-dip',
    'overhead-cable-triceps-extension': 'chest-dip',
    'cable-crunch': 'hanging-knee-raise',
  },
};

export const TEMPLATE_BY_KEY: ReadonlyMap<string, ProgramTemplate> = new Map(
  PROGRAM_TEMPLATES.map((t) => [t.key, t]),
);

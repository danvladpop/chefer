import {
  completeSetupInputSchema,
  EXERCISE_BY_ID,
  TEMPLATE_BY_KEY,
  type CompleteSetupInput,
  type ExerciseMeta,
  type GymEquipmentAccess,
  type MuscleVolume,
  type TrainingExperience,
  type WeightUnit,
} from '@chefer/types';
import { estimateDurationMin, instantiateTemplate, unitToKg, volumeByGroup } from '@chefer/utils';

// Pure setup logic (gym_plan.md §1.3 Setup): answers → the completeSetup
// payload, and a template preview computed with the shared engine so
// "Choose another program" needs no round trip.

export type StartMode = 'calibrate' | 'known';

export interface SetupAnswers {
  days: number;
  experience: TrainingExperience;
  equipmentAccess: GymEquipmentAccess;
  unit: WeightUnit;
  /** 0 = Monday … 6 = Sunday. */
  plannedWeekdays: number[];
  /** "HH:MM" or null. */
  reminderTime: string | null;
  templateKey: string;
  startMode: StartMode;
  /** exerciseId → weight as typed, in the user's unit. */
  knownWeights: Record<string, string>;
}

/** Locale default for the unit question (the US, Liberia and Myanmar use pounds). */
export function defaultUnitForLocale(locale: string | undefined): WeightUnit {
  const region = (locale ?? '').split(/[-_]/)[1]?.toUpperCase();
  return region === 'US' || region === 'LR' || region === 'MM' ? 'LB' : 'KG';
}

/** "62,5" / " 62.5 " → 62.5; blanks, junk and non-positive values → null. */
export function parseWeightInput(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Typed known weights (user unit) → kg, dropping blanks; capped at the schema's 1000 kg. */
export function knownWeightsToKg(
  known: Record<string, string>,
  unit: WeightUnit,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [exerciseId, text] of Object.entries(known)) {
    const value = parseWeightInput(text);
    if (value === null) continue;
    out[exerciseId] = Math.min(1000, unitToKg(value, unit));
  }
  return out;
}

/** Answers → a validated completeSetup input. Throws if the answers are invalid. */
export function buildSetupPayload(a: SetupAnswers): CompleteSetupInput {
  const known = a.startMode === 'known' ? knownWeightsToKg(a.knownWeights, a.unit) : {};
  const payload: CompleteSetupInput = {
    days: a.days,
    experience: a.experience,
    equipmentAccess: a.equipmentAccess,
    unit: a.unit,
    templateKey: a.templateKey,
    plannedWeekdays: [...new Set(a.plannedWeekdays)].filter((d) => d >= 0 && d <= 6).sort(),
    reminderTime: a.reminderTime && /^\d{2}:\d{2}$/.test(a.reminderTime) ? a.reminderTime : null,
    ...(Object.keys(known).length > 0 ? { knownWeightsKg: known } : {}),
  };
  return completeSetupInputSchema.parse(payload);
}

const catalogLookup = (id: string): ExerciseMeta | undefined => EXERCISE_BY_ID.get(id);

export interface ProgramPreview {
  key: string;
  name: string;
  description: string;
  days: {
    name: string;
    plannedWeekday: number | null;
    estimatedMin: number;
    exercises: { exerciseId: string; sets: number; repMin: number; repMax: number }[];
  }[];
  volume: MuscleVolume[];
}

/** Any template's preview for these answers (engine: equipment swaps + balance). */
export function previewForTemplate(
  key: string,
  equipmentAccess: GymEquipmentAccess,
  experience: TrainingExperience,
): ProgramPreview | null {
  const template = TEMPLATE_BY_KEY.get(key);
  if (!template) return null;
  const draft = instantiateTemplate(key, equipmentAccess, catalogLookup);
  const days = draft.days.map((d) => ({
    name: d.name,
    exercises: d.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      restSec: e.restSec,
    })),
  }));
  return {
    key,
    name: draft.name,
    description: template.description,
    days: draft.days.map((d, i) => ({
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      estimatedMin: days[i] ? estimateDurationMin(days[i], catalogLookup) : 0,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
      })),
    })),
    volume: volumeByGroup({ days }, catalogLookup, experience),
  };
}

/** Exercises the "I know my weights" list asks about (loadable ones, once each, in program order). */
export function knownWeightCandidates(preview: Pick<ProgramPreview, 'days'>): ExerciseMeta[] {
  const seen = new Set<string>();
  const out: ExerciseMeta[] = [];
  for (const day of preview.days) {
    for (const e of day.exercises) {
      if (seen.has(e.exerciseId)) continue;
      seen.add(e.exerciseId);
      const meta = catalogLookup(e.exerciseId);
      if (meta?.loadType === 'WEIGHTED' && !meta.isTimed) out.push(meta);
    }
  }
  return out;
}

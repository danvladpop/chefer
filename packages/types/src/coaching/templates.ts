import { z } from 'zod';
import type { ExerciseMeta, WorkoutType } from '../gym';
import { localDateSchema, weightKgSchema, workoutTypeSchema } from '../gym/schemas';
import { COACHING_LIMITS } from './limits';
import { coachingClientIdSchema } from './schemas';
import { TRAINER_MODE_LIMITS } from './trainer-mode';

// ─── Templates (docs/prd-2026-10/trainer-mode.md §6.6, §8.1, §9; M2) ──────────
// A reusable workout a trainer builds once and assigns to clients. Assigning
// COPIES the template into the client's routine (a new routine day, or in place
// of one) through the routine's versioned document write, so attribution
// ("Changed by Ana") and the client's routine notice apply. Editing a template
// never touches clients until the trainer picks "Update for clients".
//
// One exercise row has the routine row's shape (sets, rep range — seconds for
// timed holds and cardio, as in routines —, target RIR, rest, superset letter,
// the trainer's cue) plus an optional default load.

export const templateIdSchema = z.string().min(1).max(64);
export const templateIdInputSchema = z.object({ templateId: templateIdSchema });

export const templateExerciseDocSchema = z
  .object({
    /** Existing row id to keep; omit for a new row. */
    id: z.string().max(100).optional(),
    /** A curated library exercise only (the same rule as for clients). */
    exerciseId: z.string().min(1).max(100),
    sets: z.number().int().min(1).max(10),
    repMin: z.number().int().min(1).max(3600),
    repMax: z.number().int().min(1).max(3600),
    targetRir: z.number().int().min(0).max(4),
    restSec: z.number().int().min(15).max(900),
    supersetGroup: z.string().max(20).nullable(),
    /** The starting weight the trainer suggests; null = let the app suggest from each client's history. */
    defaultLoadKg: weightKgSchema.nullable(),
    /** A short cue every client who gets this template sees. Trimmed; empty = none. */
    trainerNote: z.string().max(COACHING_LIMITS.trainerNoteMaxChars).nullable(),
  })
  .refine((e) => e.repMin <= e.repMax, { message: 'repMin must be ≤ repMax' });
export type TemplateExerciseDoc = z.infer<typeof templateExerciseDocSchema>;

export const templateDocSchema = z.object({
  name: z.string().trim().min(1).max(TRAINER_MODE_LIMITS.templateNameMaxChars),
  /** "Lower body", "Yoga"… Optional. */
  workoutType: workoutTypeSchema.nullable(),
  exercises: z.array(templateExerciseDocSchema).max(TRAINER_MODE_LIMITS.exercisesPerTemplate),
});
export type TemplateDoc = z.infer<typeof templateDocSchema>;

/** `trainer.templates.create`: a new template at version 1. */
export const createTemplateInputSchema = templateDocSchema;

/**
 * `trainer.templates.save`: autosave, version-checked like `routine.save`. A
 * stale `expectedVersion` is CONFLICT with `error.data.conflict = { kind:
 * 'template', current: WorkoutTemplateDto }` (the "Keep mine / Use the other version" sheet).
 */
export const saveTemplateInputSchema = z.object({
  templateId: templateIdSchema,
  template: templateDocSchema,
  expectedVersion: z.number().int().min(1),
});

export const assignModeSchema = z.enum(['ADD_DAY', 'REPLACE_DAY']);
export type AssignMode = z.infer<typeof assignModeSchema>;

export const assignTargetSchema = z
  .object({
    clientId: coachingClientIdSchema,
    mode: assignModeSchema,
    /** REPLACE_DAY: which of the client's routine days. */
    routineDayId: z.string().min(1).max(100).optional(),
    /** ADD_DAY: an optional weekday (0 = Monday) for a My week client. */
    weekday: z.number().int().min(0).max(6).nullable().optional(),
  })
  .refine((t) => t.mode !== 'REPLACE_DAY' || t.routineDayId !== undefined, {
    message: 'REPLACE_DAY needs routineDayId',
  });
export type AssignTarget = z.infer<typeof assignTargetSchema>;

/** `trainer.templates.assign`. Each target is checked and saved on its own: one client failing never stops the others. */
export const assignTemplateInputSchema = z.object({
  templateId: templateIdSchema,
  targets: z.array(assignTargetSchema).min(1).max(COACHING_LIMITS.maxActiveClients),
});

/** `trainer.templates.updateClients`: replace each client's copy with the current version, keeping their loads. */
export const updateTemplateClientsInputSchema = z.object({
  templateId: templateIdSchema,
  clientIds: z.array(coachingClientIdSchema).min(1).max(COACHING_LIMITS.maxActiveClients),
});

/** `trainer.templates.list`: the trainer's device-local day is not needed; the list is newest-edited first. */
export const listTemplatesInputSchema = z.object({ today: localDateSchema.optional() }).optional();

// ─── Outputs ──────────────────────────────────────────────────────────────────

/** One row of the library (`trainer.templates.list`), most recently edited first. */
export interface WorkoutTemplateSummaryDto {
  id: string;
  name: string;
  workoutType: WorkoutType | null;
  exerciseCount: number;
  /** Estimated minutes for the rows (`estimateDurationMin`), null for an empty template. */
  estimatedMin: number | null;
  /** Active clients whose ACTIVE routine has a day copied from this template. */
  assignedCount: number;
  /** …of which the copy is an older version ("5 clients have an older version"). */
  outdatedCount: number;
  updatedAt: string;
}

export interface WorkoutTemplateExerciseDto {
  id: string;
  exerciseId: string;
  position: number;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  defaultLoadKg: number | null;
  trainerNote: string | null;
}

/** A client who has a copy of the template, as the template screen lists them. */
export interface WorkoutTemplateAssignmentDto {
  clientId: string;
  clientName: string;
  routineDayId: string;
  dayName: string;
  /** The template version the copy was made from. */
  templateVersion: number;
  /** The copy is older than the template now. */
  outdated: boolean;
  /** Someone (the client or the trainer) changed that day since it was copied: updating replaces those changes. */
  editedSince: boolean;
  assignedAt: string;
}

export interface WorkoutTemplateDto {
  id: string;
  name: string;
  workoutType: WorkoutType | null;
  version: number;
  updatedAt: string;
  exercises: WorkoutTemplateExerciseDto[];
  /** Names and metadata of the exercises used, for the editor. */
  exerciseMeta: ExerciseMeta[];
  /** Active clients with a copy (the update list). Most recently assigned first. */
  assignments: WorkoutTemplateAssignmentDto[];
}

/** Why one client's assign / update did not happen. */
export type WorkoutTemplateTargetFailure =
  /** Not an active client of the trainer (the uniform NOT_FOUND case, per client). */
  | 'CLIENT_UNAVAILABLE'
  /** The client has no active routine: create one first. */
  | 'NO_ROUTINE'
  /** REPLACE_DAY's day is not in the client's active routine any more. */
  | 'DAY_NOT_FOUND'
  /** ADD_DAY on a routine that already has 7 days. */
  | 'DAY_LIMIT'
  /** The client has no copy of this template (updateClients). */
  | 'NOT_ASSIGNED'
  /** The client kept saving their routine in between: try again. */
  | 'CONFLICT';

export type WorkoutTemplateTargetResult =
  | { clientId: string; ok: true; routineDayId: string }
  | { clientId: string; ok: false; reason: WorkoutTemplateTargetFailure };

export interface WorkoutTemplateTargetsResultDto {
  templateId: string;
  templateVersion: number;
  results: WorkoutTemplateTargetResult[];
}

/**
 * Additive on `TrainerRoutineDayDto` and the client's `RoutineDayDto`: the day
 * was copied from a template ("Based on Lower body A"). `name` is the
 * template's name now, or the name at assignment once the template is deleted.
 */
export interface RoutineDayTemplateRefDto {
  templateId: string;
  name: string;
  version: number;
  /** The template is gone (deleted): plain text only. */
  deleted: boolean;
}

// ─── Copy shared by web and mobile ────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const NO_ROUTINE = 'Has no routine yet';
const DAY_LIMIT = 'Already has 7 days';

export const TEMPLATE_COPY = {
  library: {
    title: 'Workouts',
    newTemplate: 'New template',
    search: 'Search templates',
    filterAll: 'All types',
    emptyTitle: 'No templates yet',
    emptyBody: 'Build a workout once, give it to any client.',
    searchEmpty: (q: string) => `No template matches “${q}”.`,
    exercises: (n: number) => `${n} ${plural(n, 'exercise', 'exercises')}`,
    minutes: (n: number) => `~${n} min`,
    assigned: (n: number) =>
      n === 0 ? 'Not assigned yet' : `Assigned to ${n} ${plural(n, 'client', 'clients')}`,
    edited: (date: string) => `Edited ${date}`,
    limit: (max: number) => `You can keep up to ${max} templates.`,
  },
  editor: {
    title: 'Template',
    newTitle: 'New template',
    name: 'Name',
    namePlaceholder: 'Lower body A',
    workoutType: 'Workout type',
    noWorkoutType: 'No type',
    defaultLoad: 'Starting weight',
    defaultLoadHint: 'Optional. Leave it empty and each client’s history decides.',
    note: 'Note for clients',
    saving: 'Saving…',
    saved: 'Saved',
    delete: 'Delete template',
    deleteTitle: 'Delete this template?',
    deleteBody: 'It leaves your library. Clients keep the workouts you gave them.',
    exerciseLimit: (max: number) => `A template holds up to ${max} exercises.`,
    curatedOnly: 'Templates use exercises from the Chefer library.',
    exercises: 'Exercises',
    nameRequired: 'Give the template a name to save it.',
    notSaved: 'Not saved',
    saveFailed: 'Couldn’t save your changes.',
  },
  assign: {
    action: 'Assign to clients',
    fromClient: 'Assign a template',
    title: (template: string) => `Assign ${template}`,
    pickClients: 'Clients',
    pickTemplate: 'Template',
    addDay: 'Add as a new day',
    replaceDay: 'Replace a day',
    weekday: 'Day of the week (optional)',
    pickDay: 'Which day',
    confirm: (n: number) => `Assign to ${n} ${plural(n, 'client', 'clients')}`,
    done: (n: number) => `Assigned to ${n} ${plural(n, 'client', 'clients')}`,
    noRoutine: NO_ROUTINE,
    dayLimit: DAY_LIMIT,
    failed: (n: number) => `${n} ${plural(n, 'client', 'clients')} couldn’t get it`,
    tune: 'Set weights for each client',
    noClients: 'Invite a client first.',
    next: 'Next',
    back: 'Back',
    noWeekday: 'No set day',
    routineError: 'Couldn’t load this client’s routine.',
    /** "Ion Rus: Already has 7 days", one line per client the assign / update skipped. */
    failureReason: {
      CLIENT_UNAVAILABLE: 'Isn’t available',
      NO_ROUTINE,
      DAY_NOT_FOUND: 'That day isn’t in their routine any more',
      DAY_LIMIT,
      NOT_ASSIGNED: 'Doesn’t have this template',
      CONFLICT: 'Their routine just changed. Try again',
    } satisfies Record<WorkoutTemplateTargetFailure, string>,
  },
  tune: {
    title: 'Set weights',
    step: (i: number, n: number) => `${i} of ${n}`,
    last: (load: string) => `Last time ${load}`,
    noHistory: 'No history yet',
    templateDefault: (load: string) => `Template ${load}`,
    next: 'Next client',
    done: 'Done',
    skip: 'Skip',
    noWeightedExercises: 'No exercises with a weight in this workout.',
  },
  update: {
    banner: (n: number) => `${n} ${plural(n, 'client has', 'clients have')} an older version`,
    action: 'Update for clients',
    title: 'Update for clients',
    body: 'Their day gets this version’s exercises. Weights they’ve already reached are kept.',
    editedSince: 'Edited since. Updating replaces their changes',
    confirm: (n: number) => `Update ${n} ${plural(n, 'client', 'clients')}`,
    done: (n: number) => `Updated ${n} ${plural(n, 'client', 'clients')}`,
    upToDate: 'Up to date',
    /** Status labels in the "Assigned to" list ("Older version · Edited since"). */
    olderVersion: 'Older version',
    editedSinceLabel: 'Edited since',
  },
  /** A template save CONFLICT (another tab or device saved first). */
  conflict: {
    title: 'This template changed elsewhere',
    body: 'It was edited in another tab or on another device since you opened it. You can keep your changes and overwrite the other version, or discard yours and load the other version instead.',
  },
  /** "Based on Lower body A" on a client's copied day; plain text once the template is gone. */
  basedOn: (template: string) => `Based on ${template}`,
  server: {
    notFound: 'This template isn’t available.',
    limit: (max: number) => `You can keep up to ${max} templates. Delete one to make room.`,
    notCurated: 'Templates can only use exercises from the Chefer library.',
  },
} as const;

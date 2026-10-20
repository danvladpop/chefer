// Workout templates (docs/prd-2026-10/trainer-mode.md §6.6, M2): the pure rules
// both apps' template screens share — the library search and type filter, the
// starting-weight rule, the save document's checks, the assign sheet's
// per-client targets and the update sheet's defaults. The editors' draft
// shapes stay per app (each reuses its own routine editor).
import {
  COACHING_LIMITS,
  ExerciseTrackingType,
  TEMPLATE_COPY,
  TRAINER_MODE_LIMITS,
  WORKOUT_TYPES,
  type AssignMode,
  type AssignTarget,
  type ExerciseMeta,
  type TemplateDoc,
  type TrainerRoutineDto,
  type WorkoutTemplateAssignmentDto,
  type WorkoutTemplateDto,
  type WorkoutTemplateSummaryDto,
  type WorkoutType,
} from '@chefer/types';
import { matchesAllTokens, normalizeSearchName, queryTokens } from '../friends/search-name';
import { workoutTypeLabel } from '../gym/my-week';
import { trackingTypeOf } from '../gym/tracking';

// ─── Library ──────────────────────────────────────────────────────────────────

export type TemplateTypeFilter = WorkoutType | 'ALL';

/** Library search (every word a prefix of a word in the name) and the workout type filter. */
export function filterTemplates(
  rows: readonly WorkoutTemplateSummaryDto[],
  query: string,
  workoutType: TemplateTypeFilter,
): WorkoutTemplateSummaryDto[] {
  const tokens = queryTokens(query);
  return rows.filter(
    (row) =>
      (workoutType === 'ALL' || row.workoutType === workoutType) &&
      (tokens.length === 0 || matchesAllTokens(normalizeSearchName(row.name, null), tokens)),
  );
}

/**
 * The workout types the library uses, in the catalog's order: the filter only
 * offers types that match something, and the options keep their place as
 * templates are edited.
 */
export function templateWorkoutTypes(rows: readonly WorkoutTemplateSummaryDto[]): WorkoutType[] {
  const used = new Set(rows.map((row) => row.workoutType));
  return WORKOUT_TYPES.filter((t) => used.has(t.type)).map((t) => t.type);
}

/** A library row's detail line: "Lower body · 5 exercises · ~45 min". */
export function templateSummaryLine(row: WorkoutTemplateSummaryDto): string {
  const copy = TEMPLATE_COPY.library;
  return [
    row.workoutType ? workoutTypeLabel(row.workoutType) : null,
    copy.exercises(row.exerciseCount),
    row.estimatedMin !== null ? copy.minutes(row.estimatedMin) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

// ─── Editor ───────────────────────────────────────────────────────────────────

/**
 * Rows that take a starting weight: exercises logged as weight × reps. Body
 * weight, timed holds and cardio have no load to suggest.
 */
export function takesStartingWeight(meta: ExerciseMeta | undefined): boolean {
  return meta !== undefined && trackingTypeOf(meta) === ExerciseTrackingType.WEIGHT_REPS;
}

export interface TemplateProblems {
  nameMissing: boolean;
  nameTooLong: boolean;
  noteTooLong: boolean;
  tooManyExercises: boolean;
}

/** What stops a template document from being saved (the server's own limits). */
export function templateProblems(doc: TemplateDoc): TemplateProblems {
  return {
    nameMissing: doc.name.trim().length === 0,
    nameTooLong: doc.name.trim().length > TRAINER_MODE_LIMITS.templateNameMaxChars,
    noteTooLong: doc.exercises.some(
      (e) => (e.trainerNote ?? '').length > COACHING_LIMITS.trainerNoteMaxChars,
    ),
    tooManyExercises: doc.exercises.length > TRAINER_MODE_LIMITS.exercisesPerTemplate,
  };
}

/** The document can be sent as it is (no unnamed templates in the library). */
/**
 * A new template is created on its first save only once it holds something
 * (a name plus an exercise or a workout type): opening "New template" and
 * leaving never leaves an empty template behind. Web and mobile alike.
 */
export function hasTemplateContent(doc: TemplateDoc): boolean {
  return doc.name.trim().length > 0 && (doc.exercises.length > 0 || doc.workoutType !== null);
}

export function isTemplateSavable(doc: TemplateDoc): boolean {
  const p = templateProblems(doc);
  return !p.nameMissing && !p.nameTooLong && !p.noteTooLong && !p.tooManyExercises;
}

/** The server's current template from a `trainer.templates.save` CONFLICT, else null. */
export function templateConflictCurrent(error: unknown): WorkoutTemplateDto | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const { data } = error as {
    data?: { conflict?: { kind?: unknown; current?: WorkoutTemplateDto } | null };
  };
  const conflict = data?.conflict;
  return conflict?.kind === 'template' && conflict.current ? conflict.current : null;
}

// ─── Assigned to / Update for clients ─────────────────────────────────────────

export type TemplateAssignmentStatus = 'upToDate' | 'outdated' | 'editedSince';

/** An up-to-date copy, an older one, or an older one someone edited since (updating replaces those edits). */
export function templateAssignmentStatus(
  a: WorkoutTemplateAssignmentDto,
): TemplateAssignmentStatus {
  if (!a.outdated) return 'upToDate';
  return a.editedSince ? 'editedSince' : 'outdated';
}

/** "Older version" or "Up to date", plus "Edited since" when someone changed the day. */
export function templateAssignmentStatusText(a: WorkoutTemplateAssignmentDto): string {
  const copy = TEMPLATE_COPY.update;
  const version = a.outdated ? copy.olderVersion : copy.upToDate;
  return a.editedSince ? `${version} · ${copy.editedSinceLabel}` : version;
}

/** "Update for clients" starts with the outdated, unedited copies ticked; edited ones wait for the trainer. */
export function defaultTemplateUpdateSelection(
  assignments: readonly WorkoutTemplateAssignmentDto[],
): string[] {
  return [
    ...new Set(
      assignments.filter((a) => templateAssignmentStatus(a) === 'outdated').map((a) => a.clientId),
    ),
  ];
}

/** Clients whose copy is older than the template ("2 clients have an older version"). */
export function outdatedTemplateClientCount(
  assignments: readonly WorkoutTemplateAssignmentDto[],
): number {
  return new Set(assignments.filter((a) => a.outdated).map((a) => a.clientId)).size;
}

// ─── Assign to clients ────────────────────────────────────────────────────────

/** ADD_DAY needs room: a routine holds at most 7 days (the server answers DAY_LIMIT past it). */
export const ROUTINE_MAX_DAYS = 7;

/** What one picked client's active routine allows, from `trainer.client.routine`. */
export type AssignClientRoutine =
  | { state: 'loading' }
  /** It failed to load: nothing is sent for this client until it does. */
  | { state: 'error' }
  /** No active routine: nothing to add to or replace ("Has no routine yet"). */
  | { state: 'none' }
  | { state: 'ready'; days: { id: string; name: string }[] };

/** One client's choice in the assign sheet. */
export interface AssignChoice {
  mode: AssignMode;
  /** ADD_DAY: optional weekday, 0 = Monday. */
  weekday: number | null;
  /** REPLACE_DAY: which of the client's days. */
  routineDayId: string | null;
}

export function assignClientRoutine(query: {
  isLoading: boolean;
  isError: boolean;
  data: TrainerRoutineDto | null | undefined;
}): AssignClientRoutine {
  if (query.isError) return { state: 'error' };
  if (query.isLoading || query.data === undefined) return { state: 'loading' };
  if (query.data === null) return { state: 'none' };
  return {
    state: 'ready',
    days: query.data.days
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((d) => ({ id: d.id, name: d.name })),
  };
}

/** "Add as a new day" needs a routine with room for one more day. */
export function canAssignAddDay(routine: AssignClientRoutine): boolean {
  return routine.state === 'ready' && routine.days.length < ROUTINE_MAX_DAYS;
}

/** "Replace a day" needs one of the client's days. */
export function canAssignReplaceDay(routine: AssignClientRoutine): boolean {
  return routine.state === 'ready' && routine.days.length > 0;
}

/** A new day by default; a full routine starts on "Replace a day". */
export function defaultAssignChoice(routine: AssignClientRoutine): AssignChoice {
  return {
    mode: routine.state === 'ready' && !canAssignAddDay(routine) ? 'REPLACE_DAY' : 'ADD_DAY',
    weekday: null,
    routineDayId: null,
  };
}

/** The target this client's choice makes, or null while it cannot be sent (no routine, full, no day picked). */
export function assignTargetFor(
  clientId: string,
  choice: AssignChoice,
  routine: AssignClientRoutine,
): AssignTarget | null {
  if (routine.state !== 'ready') return null;
  if (choice.mode === 'ADD_DAY') {
    if (!canAssignAddDay(routine)) return null;
    return { clientId, mode: 'ADD_DAY', weekday: choice.weekday };
  }
  if (!choice.routineDayId || !routine.days.some((d) => d.id === choice.routineDayId)) return null;
  return { clientId, mode: 'REPLACE_DAY', routineDayId: choice.routineDayId };
}

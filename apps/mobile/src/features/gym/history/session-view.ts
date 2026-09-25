import type { SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';

// Normalizes the two shapes a session can come from into one view model:
// the compact `SessionSummaryDto` (always available offline from the cached
// bootstrap) and the full `WorkoutSessionDoc` (from `session.get`, once
// online) — gym_plan.md §5.2 offline rule. The full doc adds notes and a
// completedAt-derived `completed` flag per set; the summary already carries
// completed/isWarmup directly.

export interface SessionSetView {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  completed: boolean;
}

export interface SessionExerciseView {
  exerciseId: string;
  skipped: boolean;
  /** Rir (0-3) from the summary, or the doc schema's plain validated number — same range. */
  lastSetRir: number | null;
  notes: string | null;
  sets: SessionSetView[];
}

export interface SessionView {
  id: string;
  name: string;
  localDate: string;
  startedAt: string;
  finishedAt: string | null;
  isDeload: boolean;
  notes: string | null;
  exercises: SessionExerciseView[];
}

export function viewFromSummary(summary: SessionSummaryDto): SessionView {
  return {
    id: summary.id,
    name: summary.name,
    localDate: summary.localDate,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    isDeload: summary.isDeload,
    notes: null,
    exercises: summary.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      skipped: ex.skipped,
      lastSetRir: ex.lastSetRir,
      notes: null,
      sets: ex.sets,
    })),
  };
}

export function viewFromDoc(doc: WorkoutSessionDoc): SessionView {
  return {
    id: doc.id,
    name: doc.name,
    localDate: doc.localDate,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    isDeload: doc.isDeload,
    notes: doc.notes,
    exercises: doc.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      skipped: ex.skipped,
      lastSetRir: ex.lastSetRir,
      notes: ex.notes,
      sets: ex.sets.map((s) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        isWarmup: s.isWarmup,
        completed: s.completedAt !== null,
      })),
    })),
  };
}

/** Minutes between start and finish, or null while a session has no end time. */
export function sessionDurationMin(view: SessionView): number | null {
  if (!view.finishedAt) return null;
  const ms = Date.parse(view.finishedAt) - Date.parse(view.startedAt);
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

import type {
  GymBootstrap,
  PersonalRecord,
  ProgressionDto,
  SessionSummaryDto,
  WorkoutSessionDoc,
} from '@chefer/types';
import { collectPrs, explain, repBucket, toSessionSummary } from '@chefer/utils';
import { directionOf, type Direction } from './workout-model';

// View model for the finish screen (gym_plan.md §1.3 "Summary"): built from the
// doc finish() returned, or — after a cold start — from the cached
// recentSessions copy of it.

export interface SummaryExercise {
  exerciseId: string;
  skipped: boolean;
  /** Known from the full doc; null when rebuilt from recentSessions. */
  bucket: string | null;
  workingSets: number;
}

export interface SummaryView {
  id: string;
  name: string;
  durationSec: number | null;
  workingSets: number;
  exercises: SummaryExercise[];
  summary: SessionSummaryDto;
}

export function summaryFromDoc(doc: WorkoutSessionDoc): SummaryView {
  const summary = toSessionSummary(doc);
  const exercises = [...doc.exercises]
    .sort((a, b) => a.position - b.position)
    .map((se) => ({
      exerciseId: se.exerciseId,
      skipped: se.skipped,
      bucket: repBucket(se.repMin, se.repMax),
      workingSets: se.skipped
        ? 0
        : se.sets.filter((s) => !s.isWarmup && s.completedAt !== null).length,
    }));
  return build(summary, exercises);
}

export function summaryFromRecent(summary: SessionSummaryDto): SummaryView {
  const exercises = summary.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    skipped: e.skipped,
    bucket: null,
    workingSets: e.skipped ? 0 : e.sets.filter((s) => !s.isWarmup && s.completed).length,
  }));
  return build(summary, exercises);
}

function build(summary: SessionSummaryDto, exercises: SummaryExercise[]): SummaryView {
  const start = Date.parse(summary.startedAt);
  const end = summary.finishedAt ? Date.parse(summary.finishedAt) : Number.NaN;
  return {
    id: summary.id,
    name: summary.name,
    durationSec: Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 1000 : null,
    workingSets: exercises.reduce((n, e) => n + e.workingSets, 0),
    exercises,
    summary,
  };
}

/** PRs this session set against the cached history (one per exercise at most). */
export function sessionPrs(
  view: SummaryView,
  recent: readonly SessionSummaryDto[],
): PersonalRecord[] {
  const others = recent.filter((s) => s.id !== view.id);
  const self: SessionSummaryDto = { ...view.summary, status: 'COMPLETED' };
  return collectPrs([...others, self]).filter((pr) => pr.sessionId === view.id);
}

export interface NextTimeRow {
  exerciseId: string;
  progression: ProgressionDto;
  direction: Direction;
  sentence: string;
}

/**
 * "Next time": the engine's new suggestion per exercise done today, read from
 * the (optimistically folded) cached progressions. Skipped or untouched
 * exercises and ones with no progression yet are left out.
 */
export function nextTimeRows(
  view: SummaryView,
  bootstrap: GymBootstrap | undefined,
): NextTimeRow[] {
  if (!bootstrap) return [];
  const unit = bootstrap.profile?.unit ?? 'KG';
  const seen = new Set<string>();
  const rows: NextTimeRow[] = [];
  for (const ex of view.exercises) {
    if (ex.skipped || ex.workingSets === 0 || seen.has(ex.exerciseId)) continue;
    const candidates = bootstrap.progressions.filter((p) => p.exerciseId === ex.exerciseId);
    const progression =
      (ex.bucket ? candidates.find((p) => p.repBucket === ex.bucket) : undefined) ?? candidates[0];
    if (!progression) continue;
    seen.add(ex.exerciseId);
    rows.push({
      exerciseId: ex.exerciseId,
      progression,
      direction: directionOf(progression.suggestion),
      sentence: explain(progression.suggestion, unit),
    });
  }
  return rows;
}

// ─── Correcting a past session (pure) — T-44.2/T-44.4, Δ2.3 ──────────────────
// Edit/delete go through the existing outbox as a plain upsert (an edited doc
// with a bumped clientUpdatedAt, or the same doc re-sent with
// status: 'DISCARDED') — no new API surface (Δ2.3). This module only holds
// the client-side pure logic: the delete confirm's before/after preview
// (built on weeks.ts's settleWeeks, the same fold the server and the offline
// optimistic-apply already use) and the "Next time changed after your edit"
// diff (PAT-14).
import type { StreakInfo, Suggestion, WeekSummary, WorkoutStatus } from '@chefer/types';
import { progressionKey } from './progression';
import { settleWeeks, weekStartOf, type WeekRow } from './weeks';

// ─── Delete preview (T-44.2, UX-44 AC4) ───────────────────────────────────────

export interface SessionDeletePreviewInput {
  /** `bootstrap.weeks`/`.streak` as they stand right now (the session still counted). */
  weeks: readonly WeekSummary[];
  streak: StreakInfo;
  sessionLocalDate: string;
  sessionStatus: WorkoutStatus;
  /** Completed, non-skipped working sets — the confirm's "{n} sets" line. */
  setsCount: number;
  today: string;
}

export interface SessionDeletePreview {
  setsCount: number;
  /** Show the "this week" line only when it actually moves. */
  weekChanged: boolean;
  thisWeekBefore: number;
  thisWeekAfter: number;
  /** Show the streak line only when it actually moves. */
  streakChanged: boolean;
  streakBefore: number;
  streakAfter: number;
}

/**
 * What deleting this session changes — a paused or already-under week that
 * doesn't move stays unreported (the ConfirmSheet only names lines that
 * change). An IN_PROGRESS/DISCARDED doc was never counted, so deleting it
 * changes nothing here (D-21 a: any past session can be edited/deleted, but
 * only a COMPLETED one touches weeks/streak).
 */
export function sessionDeletePreview(input: SessionDeletePreviewInput): SessionDeletePreview {
  const base: SessionDeletePreview = {
    setsCount: input.setsCount,
    weekChanged: false,
    thisWeekBefore: input.streak.thisWeekSessions,
    thisWeekAfter: input.streak.thisWeekSessions,
    streakChanged: false,
    streakBefore: input.streak.current,
    streakAfter: input.streak.current,
  };
  if (input.sessionStatus !== 'COMPLETED') return base;

  const currentWeek = weekStartOf(input.today);
  const targetWeek = weekStartOf(input.sessionLocalDate);
  const rows: WeekRow[] = input.weeks.map((w) => ({
    weekStart: w.weekStart,
    goal: w.goal,
    sessions: w.weekStart === targetWeek ? Math.max(0, w.sessions - 1) : w.sessions,
    // The original status already reflects whether the week overlapped a
    // pause; settleWeeks only needs that boolean to re-settle it the same way.
    paused: w.status === 'paused',
  }));
  const after = settleWeeks(rows, currentWeek);
  const thisWeekAfter =
    after.weeks.find((w) => w.weekStart === currentWeek)?.sessions ?? base.thisWeekAfter;

  return {
    ...base,
    weekChanged: thisWeekAfter !== base.thisWeekBefore,
    thisWeekAfter,
    streakChanged: after.streak.current !== base.streakBefore,
    streakAfter: after.streak.current,
  };
}

// ─── Target-change notice (T-44.4, PAT-14) ────────────────────────────────────

export interface ProgressionTargetSnapshot {
  exerciseId: string;
  repBucket: string;
  suggestion: Suggestion;
}

export interface TargetDiffRow {
  exerciseId: string;
  repBucket: string;
  before: Suggestion;
  after: Suggestion;
}

function suggestionChanged(a: Suggestion, b: Suggestion): boolean {
  return (
    a.weightKg !== b.weightKg ||
    a.sets !== b.sets ||
    a.reps.length !== b.reps.length ||
    a.reps.some((r, i) => r !== b.reps[i])
  );
}

/**
 * Rows whose next-time prescription changed between two progression
 * snapshots — taken before enqueueing the edit and after the next bootstrap
 * refetch (Δ2.3). A bucket present only in one snapshot (e.g. removed from
 * the workout, or brand new) is skipped: there's nothing to compare "before"
 * and "after" for.
 */
export function targetDiff(
  before: readonly ProgressionTargetSnapshot[],
  after: readonly ProgressionTargetSnapshot[],
): TargetDiffRow[] {
  const afterByKey = new Map(
    after.map((a) => [progressionKey(a.exerciseId, a.repBucket), a] as const),
  );
  const rows: TargetDiffRow[] = [];
  for (const b of before) {
    const a = afterByKey.get(progressionKey(b.exerciseId, b.repBucket));
    if (!a) continue;
    if (suggestionChanged(b.suggestion, a.suggestion)) {
      rows.push({
        exerciseId: b.exerciseId,
        repBucket: b.repBucket,
        before: b.suggestion,
        after: a.suggestion,
      });
    }
  }
  return rows;
}

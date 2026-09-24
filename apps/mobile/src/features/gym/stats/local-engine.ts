// Offline-first stats (gym_plan.md §5.2 offline rule, G2-D scope): compute
// e1RM series, rep-PR tables and PR frequency from the CACHED bootstrap's
// `recentSessions` (last ~12 weeks) with the shared engine (@chefer/utils),
// so the exercise-detail history and the Strength-trend / PR-timeline stats
// views render instantly offline. The stats screens upgrade to the API's
// series (which covers full history and honours `range`) once online.
import type {
  E1rmPointDto,
  E1rmSeriesDto,
  ExerciseDto,
  RepPrRowDto,
  SessionSummaryDto,
} from '@chefer/types';
import { bestE1rm, collectPrs } from '@chefer/utils';

function completedAsc(sessions: SessionSummaryDto[]): SessionSummaryDto[] {
  return sessions
    .filter((s) => s.status === 'COMPLETED')
    .sort(
      (a, b) => a.localDate.localeCompare(b.localDate) || a.startedAt.localeCompare(b.startedAt),
    );
}

const TREND_WINDOW = 3;

/** e1RM per completed session for one exercise, with a rolling-max trend and PR dots. */
export function localE1rmSeries(
  sessions: readonly SessionSummaryDto[],
  exerciseId: string,
): E1rmSeriesDto {
  const prSessionIds = new Set(
    collectPrs([...sessions], exerciseId)
      .filter((pr) => pr.kind === 'e1rm')
      .map((pr) => pr.sessionId),
  );
  const points: E1rmPointDto[] = [];
  for (const session of completedAsc([...sessions])) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    if (!ex) continue;
    const best = bestE1rm(ex.sets, ex.lastSetRir);
    if (!best) continue;
    points.push({
      localDate: session.localDate,
      sessionId: session.id,
      e1rmKg: best.e1rmKg,
      weightKg: best.weightKg,
      reps: best.reps,
      lowConfidence: best.lowConfidence,
      isPr: prSessionIds.has(session.id),
    });
  }
  const trend = points.map((_, i) => {
    const window = points.slice(Math.max(0, i - TREND_WINDOW + 1), i + 1);
    return Math.max(...window.map((p) => p.e1rmKg));
  });
  return { exerciseId, points, trend };
}

/** Best reps ever logged at each weight (research §6.1's "best reps at each weight"). */
export function localRepPrTable(
  sessions: readonly SessionSummaryDto[],
  exerciseId: string,
): RepPrRowDto[] {
  const bestAtWeight = new Map<number, RepPrRowDto>();
  for (const session of completedAsc([...sessions])) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    if (!ex) continue;
    for (const set of ex.sets) {
      if (set.isWarmup || !set.completed || set.reps <= 0 || set.weightKg <= 0) continue;
      const current = bestAtWeight.get(set.weightKg);
      if (!current || set.reps > current.reps) {
        bestAtWeight.set(set.weightKg, {
          weightKg: set.weightKg,
          reps: set.reps,
          localDate: session.localDate,
        });
      }
    }
  }
  return [...bestAtWeight.values()].sort((a, b) => b.weightKg - a.weightKg);
}

/** The best-e1RM sets for an exercise, most impressive first (detail's "best sets"). */
export function localBestSets(
  sessions: readonly SessionSummaryDto[],
  exerciseId: string,
  limit = 5,
): E1rmPointDto[] {
  return localE1rmSeries(sessions, exerciseId)
    .points.slice()
    .sort((a, b) => b.e1rmKg - a.e1rmKg)
    .slice(0, limit);
}

/** The user's top-N compound lifts by how often they show up in completed sessions
 * (Stats §1.3 "defaulting to the user's top 3 compounds by frequency"). */
export function topCompoundsByFrequency(
  sessions: readonly SessionSummaryDto[],
  library: readonly ExerciseDto[],
  limit = 3,
): ExerciseDto[] {
  const byId = new Map(library.map((e) => [e.id, e]));
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== 'COMPLETED') continue;
    for (const ex of session.exercises) {
      if (ex.skipped) continue;
      const meta = byId.get(ex.exerciseId);
      if (meta?.category !== 'COMPOUND') continue;
      counts.set(ex.exerciseId, (counts.get(ex.exerciseId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId.get(id))
    .filter((e): e is ExerciseDto => e !== undefined);
}

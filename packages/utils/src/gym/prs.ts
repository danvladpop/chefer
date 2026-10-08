// Personal records — research §4.2 #8 (weight / rep-at-weight / e1RM; one badge per exercise).
// Rules: warm-ups and unticked sets never count; only COMPLETED sessions; the
// first-ever exposure DOES set a PR (T-05.6, UX-05 F, bug: "No PRs yet" used
// to survive a real logged lift) — `PersonalRecord.isFirst` flags it so
// callers can render "First {lift}: {w} × {reps}" instead of the usual
// "beat your {kind} PR" copy; an e1RM PR needs a candidate set of ≤ 10 reps
// (11–12 rep sets are low-confidence).
import type { ExerciseBest, PersonalRecord, PrKind, SessionSummaryDto } from '@chefer/types';
import { bestE1rm, e1rmConfidence, epley } from './e1rm';
import { KG_EPS } from './loads';

interface PriorBest {
  maxWeight: number;
  /** [weightKg, reps] of every prior working set. */
  sets: [number, number][];
  maxE1rm: number | null;
  any: boolean;
}

type SummaryExercise = SessionSummaryDto['exercises'][number];
type Candidate = { weightKg: number; reps: number; rir?: number | null };

const RANK: Record<PrKind, number> = { e1rm: 3, weight: 2, reps: 1 };

function emptyBest(): PriorBest {
  return { maxWeight: 0, sets: [], maxE1rm: null, any: false };
}

function workingSets(ex: SummaryExercise): SummaryExercise['sets'] {
  return ex.sets.filter((s) => !s.isWarmup && s.completed && s.reps > 0);
}

function absorb(best: PriorBest, ex: SummaryExercise): void {
  for (const s of workingSets(ex)) {
    best.any = true;
    best.maxWeight = Math.max(best.maxWeight, s.weightKg);
    best.sets.push([s.weightKg, s.reps]);
  }
  const e = bestE1rm(ex.sets, ex.lastSetRir);
  if (e && (best.maxE1rm === null || e.e1rmKg > best.maxE1rm)) {
    best.maxE1rm = e.e1rmKg;
  }
}

function kindsBeaten(best: PriorBest, candidate: Candidate): PrKind[] {
  // T-05.6 (UX-05 F): the first-ever logged set for an exercise counts as a
  // PR too (previously "nothing to beat yet" meant it never did) — an empty
  // `best` (maxWeight 0, maxE1rm null) is a legitimate baseline any real
  // weighted set beats. A reps PR still needs a prior set to compare against
  // at the same weight (there's no "first" version of "more reps here").
  if (candidate.reps <= 0) {
    return [];
  }
  const kinds: PrKind[] = [];
  const e =
    candidate.weightKg > 0 ? epley(candidate.weightKg, candidate.reps, candidate.rir) : null;
  if (
    e !== null &&
    e1rmConfidence(candidate.reps) === 'ok' &&
    (best.maxE1rm === null || e > best.maxE1rm + KG_EPS)
  ) {
    kinds.push('e1rm');
  }
  if (candidate.weightKg > best.maxWeight + KG_EPS) {
    kinds.push('weight');
  }
  const atOrAbove = best.sets.filter(([w]) => w >= candidate.weightKg - KG_EPS);
  if (atOrAbove.length > 0 && atOrAbove.every(([, r]) => candidate.reps > r)) {
    kinds.push('reps');
  }
  return kinds;
}

function completedInOrder(sessions: SessionSummaryDto[]): SessionSummaryDto[] {
  return sessions
    .filter((s) => s.status === 'COMPLETED')
    .sort(
      (a, b) =>
        a.localDate.localeCompare(b.localDate) ||
        a.startedAt.localeCompare(b.startedAt) ||
        a.id.localeCompare(b.id),
    );
}

/** Seeds a running best from a compact all-time record. */
function fromExerciseBest(record: ExerciseBest): PriorBest {
  return {
    maxWeight: record.maxWeightKg,
    sets: record.frontier.map(([w, r]) => [w, r] as [number, number]),
    maxE1rm: record.maxE1rmKg,
    any: true,
  };
}

/** Keeps only sets no other set beats on both weight and reps. */
function paretoFrontier(sets: [number, number][]): [number, number][] {
  const sorted = [...sets].sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const out: [number, number][] = [];
  let maxReps = -1;
  for (const [w, r] of sorted) {
    if (r > maxReps) {
      out.push([w, r]);
      maxReps = r;
    }
  }
  return out;
}

/**
 * Per-exercise all-time bests of completed sessions, compact enough to ship
 * in the bootstrap (audit F-GYM-6-1). `detectPrs({ best })` seeds from it.
 */
export function summarizeBests(sessions: SessionSummaryDto[]): Record<string, ExerciseBest> {
  const bests = new Map<string, PriorBest>();
  for (const session of completedInOrder(sessions)) {
    for (const ex of session.exercises) {
      if (ex.skipped) continue;
      const best = bests.get(ex.exerciseId) ?? emptyBest();
      absorb(best, ex);
      bests.set(ex.exerciseId, best);
    }
  }
  const out: Record<string, ExerciseBest> = {};
  for (const [exerciseId, best] of bests) {
    if (!best.any) continue;
    out[exerciseId] = {
      maxWeightKg: best.maxWeight,
      maxE1rmKg: best.maxE1rm,
      frontier: paretoFrontier(best.sets),
    };
  }
  return out;
}

/** Which PR kinds a candidate working set beats, ranked (e1rm > weight > reps). Empty = none. */
export function detectPrs(input: {
  exerciseId: string;
  /** Prior completed sessions (any order). */
  history: SessionSummaryDto[];
  candidate: Candidate;
  /** All-time record from sessions outside `history` (bootstrap `olderBests`). */
  best?: ExerciseBest | undefined;
}): PrKind[] {
  const best = input.best ? fromExerciseBest(input.best) : emptyBest();
  for (const session of completedInOrder(input.history)) {
    for (const ex of session.exercises) {
      if (ex.exerciseId === input.exerciseId && !ex.skipped) {
        absorb(best, ex);
      }
    }
  }
  return kindsBeaten(best, input.candidate);
}

/**
 * Whether this exercise has any earlier logged working set (UX-GYM-18). The
 * first-ever session is a baseline, not a record: the live badge and the
 * finish summary skip it, while the PR timeline keeps listing it as "First
 * logged" (`PersonalRecord.isFirst`, T-05.6).
 */
export function hasPriorExposure(input: {
  exerciseId: string;
  /** Prior completed sessions (any order). */
  history: SessionSummaryDto[];
  /** All-time record from sessions outside `history` (bootstrap `olderBests`). */
  best?: ExerciseBest | undefined;
}): boolean {
  if (input.best) return true;
  return input.history.some(
    (s) =>
      s.status === 'COMPLETED' &&
      s.exercises.some(
        (ex) => ex.exerciseId === input.exerciseId && !ex.skipped && workingSets(ex).length > 0,
      ),
  );
}

/**
 * The PR kinds a set beats while the workout is still running (UX-GYM-18 follow-up,
 * owner decision 2026-10-04): `detectPrs`, except that an exercise with no
 * earlier history is a baseline, not a record — no badge, no haptic. The one
 * rule behind the live badge on web and mobile; the finish summary applies the
 * same rule (`hasPriorExposure`) and the PR timeline still lists the first lift
 * as "First logged".
 */
export function detectLivePrs(input: {
  exerciseId: string;
  /** Prior completed sessions (any order), never the running one. */
  history: SessionSummaryDto[];
  candidate: Candidate;
  /** All-time record from sessions outside `history` (bootstrap `olderBests`). */
  best?: ExerciseBest | undefined;
}): PrKind[] {
  if (!hasPriorExposure(input)) return [];
  return detectPrs(input);
}

/**
 * Every PR ever set, in date order (for the PR timeline and recap): at most one
 * record per exercise per session — the highest-ranked kind any of its sets
 * beat, compared with all earlier sessions.
 */
export function collectPrs(
  sessions: SessionSummaryDto[],
  exerciseId?: string,
  /** All-time bests from sessions not in `sessions` (bootstrap `olderBests`). */
  seed?: Record<string, ExerciseBest>,
): PersonalRecord[] {
  const bests = new Map<string, PriorBest>(
    Object.entries(seed ?? {}).map(([id, record]) => [id, fromExerciseBest(record)]),
  );
  const out: PersonalRecord[] = [];
  for (const session of completedInOrder(sessions)) {
    const pending = new Map<string, PersonalRecord>();
    const touched: SummaryExercise[] = [];
    for (const ex of session.exercises) {
      if (ex.skipped || (exerciseId !== undefined && ex.exerciseId !== exerciseId)) {
        continue;
      }
      touched.push(ex);
      const best = bests.get(ex.exerciseId) ?? emptyBest();
      const sets = workingSets(ex);
      for (let idx = 0; idx < sets.length; idx++) {
        const s = sets[idx];
        if (!s) {
          continue;
        }
        const rir = idx === sets.length - 1 ? ex.lastSetRir : null;
        const kind = kindsBeaten(best, { weightKg: s.weightKg, reps: s.reps, rir })[0];
        const current = pending.get(ex.exerciseId);
        if (kind && (!current || RANK[kind] > RANK[current.kind])) {
          pending.set(ex.exerciseId, {
            exerciseId: ex.exerciseId,
            kind,
            weightKg: s.weightKg,
            reps: s.reps,
            e1rmKg: s.weightKg > 0 ? epley(s.weightKg, s.reps, rir) : null,
            localDate: session.localDate,
            sessionId: session.id,
            isFirst: !best.any,
          });
        }
      }
    }
    out.push(...pending.values());
    for (const ex of touched) {
      const best = bests.get(ex.exerciseId) ?? emptyBest();
      absorb(best, ex);
      bests.set(ex.exerciseId, best);
    }
  }
  return out;
}

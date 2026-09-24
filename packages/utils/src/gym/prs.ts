// Personal records — research §4.2 #8 (weight / rep-at-weight / e1RM; one badge per exercise).
import type { PersonalRecord, PrKind, SessionSummaryDto } from '@chefer/types';
import { notImplemented } from './_stub';

/** Which PR kinds a candidate working set beats, ranked (e1rm > weight > reps). Empty = none. */
export function detectPrs(input: {
  exerciseId: string;
  /** Prior completed sessions (any order). */
  history: SessionSummaryDto[];
  candidate: { weightKg: number; reps: number; rir?: number | null };
}): PrKind[] {
  return notImplemented(`detectPrs(${input.exerciseId})`);
}

/** Every PR ever set, in date order (for the PR timeline and recap). */
export function collectPrs(sessions: SessionSummaryDto[], exerciseId?: string): PersonalRecord[] {
  return notImplemented(`collectPrs(${sessions.length}, ${exerciseId})`);
}

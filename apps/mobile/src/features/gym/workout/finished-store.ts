import type { WorkoutSessionDoc } from '@chefer/types';

// The doc `finish()` returned, kept in memory by id so the summary screen
// renders the exact session (timings, rep ranges) across re-renders. After a
// cold start the summary falls back to the cached bootstrap's recentSessions.

const MAX_KEPT = 5;
const finished = new Map<string, WorkoutSessionDoc>();

export function rememberFinished(doc: WorkoutSessionDoc): void {
  finished.delete(doc.id);
  finished.set(doc.id, doc);
  while (finished.size > MAX_KEPT) {
    const oldest = finished.keys().next();
    if (oldest.done) break;
    finished.delete(oldest.value);
  }
}

export function getFinished(id: string): WorkoutSessionDoc | undefined {
  return finished.get(id);
}

/** Test seam. */
export function resetFinishedForTests(): void {
  finished.clear();
}

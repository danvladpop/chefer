// Personal "sticky note" per exercise (gym_plan.md §1.3 "Exercises tab" detail
// screen). Device-local only — never synced — so it is plain localStorage,
// wrapped in try/catch (private browsing, blocked storage, quota errors).

const KEY_PREFIX = 'chefer:gym:exercise-note:';

export function loadExerciseNote(exerciseId: string): string {
  try {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(KEY_PREFIX + exerciseId) ?? '';
  } catch {
    return '';
  }
}

export function saveExerciseNote(exerciseId: string, note: string): void {
  try {
    if (typeof window === 'undefined') return;
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      window.localStorage.removeItem(KEY_PREFIX + exerciseId);
    } else {
      window.localStorage.setItem(KEY_PREFIX + exerciseId, note);
    }
  } catch {
    // Best-effort only — losing a personal note is never worth crashing over.
  }
}

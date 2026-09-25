// Per-routine, per-rule dismissal for the weekly-balance hints (V1–V11,
// gym_plan.md §1.3 / research §2.3: "gentle, dismissible"). Remembered in
// localStorage — best-effort only, wrapped in try/catch per CLAUDE.md, and
// never blocks rendering if storage is unavailable (Safari private mode,
// blocked cookies, SSR).
import type { RoutineHint } from '@chefer/types';

function storageKey(routineId: string): string {
  return `gym.routine.${routineId}.dismissedHints`;
}

/** A stable identity for one hint instance, since hints carry no id of their own. */
export function hintId(hint: RoutineHint): string {
  return [hint.rule, hint.group ?? '', hint.dayIndex ?? '', hint.exerciseId ?? ''].join(':');
}

export function loadDismissedHints(routineId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(routineId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveDismissedHints(routineId: string, dismissed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(storageKey(routineId), JSON.stringify([...dismissed]));
  } catch {
    // best-effort — a full or blocked store just means hints reappear next visit
  }
}

/** Hints not yet dismissed for this routine, in the order the engine produced them. */
export function visibleHints(
  hints: readonly RoutineHint[],
  dismissed: ReadonlySet<string>,
): RoutineHint[] {
  return hints.filter((hint) => !dismissed.has(hintId(hint)));
}

import { kv } from '../offline/kv';
import { getGymOwner } from '../offline/owner';

// A personal, device-local note per exercise (gym_plan.md §1.3 "a sticky
// personal note"). Deliberately NOT synced: it's a scratchpad, not a doc, and
// keeping it device-only avoids a sync/merge story for free text.
//
// Not added to offline/keys.ts's KV_KEYS: that registry is for single fixed
// keys, and this one is parametrized per (owner, exercise).
const PREFIX = 'gym.exercise-note';

function noteKey(exerciseId: string): string {
  const owner = getGymOwner() ?? 'anon';
  return `${PREFIX}.${owner}.${exerciseId}`;
}

export function getExerciseNote(exerciseId: string): string {
  return kv.getString(noteKey(exerciseId)) ?? '';
}

export function setExerciseNote(exerciseId: string, note: string): void {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    kv.remove(noteKey(exerciseId));
    return;
  }
  kv.setString(noteKey(exerciseId), trimmed);
}

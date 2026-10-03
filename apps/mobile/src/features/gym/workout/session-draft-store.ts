import type { WorkoutSessionDoc } from '@chefer/types';
import { kv } from '../offline/kv';
import { getGymOwner } from '../offline/owner';

// UX-GYM-26: a past session being edited, or a new one being logged, used to
// live ONLY in the hook's React state — a crash, a kill or an accidental swipe
// lost every number. The two hooks mirror their draft here (device-local, per
// mode and per target) while it differs from its starting point, and read it
// back on open. The live workout has its own crash-safe store
// (`offline/active-session-store.ts`); this never touches it.
//
// Not added to `offline/keys.ts`: like `exercise-notes.ts`, the key is
// parametrised per (owner, mode, target). The `gym.` prefix keeps it across a
// session expiry and the sign-out scan wipes it with everything else.

export type SessionDraftMode = 'edit' | 'log';

interface SessionDraftRecord {
  v: 1;
  /** Epoch ms of the last write. */
  savedAt: number;
  /** The doc the draft started from, so "dirty" survives a restore. */
  original: WorkoutSessionDoc;
  draft: WorkoutSessionDoc;
}

const PREFIX = 'gym.session-draft';
/** An abandoned draft is dropped after this long. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Edit mode is keyed by the session being corrected, log mode by the day (and
 * routine day) being logged.
 */
export function editDraftTarget(sessionId: string): string {
  return sessionId;
}
export function logDraftTarget(date: string, dayId: string | null): string {
  return `${date}.${dayId ?? 'freestyle'}`;
}

function draftKey(mode: SessionDraftMode, target: string): string {
  return `${PREFIX}.${getGymOwner() ?? 'anon'}.${mode}.${target}`;
}

function isRecord(value: unknown): value is SessionDraftRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { v, savedAt, original, draft } = value as Record<string, unknown>;
  const isDoc = (doc: unknown): boolean =>
    typeof doc === 'object' &&
    doc !== null &&
    typeof (doc as { id?: unknown }).id === 'string' &&
    Array.isArray((doc as { exercises?: unknown }).exercises);
  return v === 1 && typeof savedAt === 'number' && isDoc(original) && isDoc(draft);
}

/** The saved draft for this target, or null (none, unreadable or expired — the latter two are removed). */
export function loadSessionDraft(
  mode: SessionDraftMode,
  target: string,
  now: number = Date.now(),
): { original: WorkoutSessionDoc; draft: WorkoutSessionDoc } | null {
  const key = draftKey(mode, target);
  const parsed = kv.getJSON(key);
  if (parsed === null) return null;
  if (!isRecord(parsed) || now - parsed.savedAt > MAX_AGE_MS) {
    kv.remove(key);
    return null;
  }
  return { original: parsed.original, draft: parsed.draft };
}

export function saveSessionDraft(
  mode: SessionDraftMode,
  target: string,
  original: WorkoutSessionDoc,
  draft: WorkoutSessionDoc,
): void {
  const record: SessionDraftRecord = { v: 1, savedAt: Date.now(), original, draft };
  kv.setJSON(draftKey(mode, target), record);
}

export function clearSessionDraft(mode: SessionDraftMode, target: string): void {
  kv.remove(draftKey(mode, target));
}

import type { RoutineHint } from '@chefer/types';
import { KV_KEYS } from '../offline/keys';
import { kv } from '../offline/kv';

// Per-routine dismissal of weekly-balance hints (research §2.3: "dismissible
// per rule per routine"). Stored as { [routineId]: hintKey[] } under one KV
// key (offline/keys.ts) — small, so one JSON blob is simpler than N keys.

/** Stable identity for a hint within one routine (rule + where it applies). */
export function hintKey(hint: RoutineHint): string {
  return [hint.rule, hint.group ?? '', hint.dayIndex ?? '', hint.exerciseId ?? ''].join('|');
}

type DismissedByRoutine = Record<string, string[]>;

function readAll(): DismissedByRoutine {
  const raw = kv.getJSON(KV_KEYS.routineHintsDismissed);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as DismissedByRoutine;
}

export function getDismissedHints(routineId: string): Set<string> {
  const all = readAll();
  return new Set(all[routineId] ?? []);
}

export function dismissHint(routineId: string, key: string): void {
  const all = readAll();
  const next = new Set(all[routineId] ?? []);
  next.add(key);
  kv.setJSON(KV_KEYS.routineHintsDismissed, { ...all, [routineId]: [...next] });
}

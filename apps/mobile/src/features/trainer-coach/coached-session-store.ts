import { useSyncExternalStore } from 'react';
import type { CoachStartDto, ExerciseDto, NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import { createExternalStore } from '../gym/offline/external-store';
import { KV_KEYS } from '../gym/offline/keys';
import { kv } from '../gym/offline/kv';
import { bookingKeyOf } from './coach-model';

// ─── In-progress coached workouts (trainer-mode.md §6.7, §12) ─────────────────
// One persisted record per (booking, client), each its own KV key, written
// synchronously on every tap like the trainer's own active session — which
// lives in a different key and is never touched here, so a trainer's own
// workout and the workouts they coach coexist. A group booking is simply the
// records sharing a booking key; switching clients switches records.

export interface CoachedWorkoutRecord {
  v: 1;
  /** The trainer (gym owner) who started it; another account on this phone never sees it. */
  ownerId: string | null;
  bookingId: string | null;
  client: CoachStartDto['client'];
  /** The prescription it started from (supersets, last time) and the exercise meta for its rows. */
  workout: NextWorkoutDto;
  exercises: ExerciseDto[];
  /** Order in the client switcher (the booking's client order). */
  order: number;
  doc: WorkoutSessionDoc;
}

export interface CoachedSessionStore {
  /** Every record on the phone (all owners), by booking then switcher order. Stable until a change. */
  all: () => readonly CoachedWorkoutRecord[];
  find: (bookingId: string | null, clientId: string) => CoachedWorkoutRecord | null;
  /** Persist synchronously, then notify. */
  put: (record: CoachedWorkoutRecord) => void;
  /** Replace a record's doc (no-op when the record is gone). Returns the stored record. */
  setDoc: (
    bookingId: string | null,
    clientId: string,
    doc: WorkoutSessionDoc,
  ) => CoachedWorkoutRecord | null;
  remove: (bookingId: string | null, clientId: string) => void;
  subscribe: (listener: () => void) => () => void;
  /** Re-read from disk (sign-out, tests). */
  reload: () => void;
}

const QUARANTINE = 'gym.coach.quarantine';

function isRecord(value: unknown): value is CoachedWorkoutRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { v, doc, client, workout } = value as Record<string, unknown>;
  if (v !== 1 || typeof doc !== 'object' || doc === null) return false;
  if (typeof client !== 'object' || client === null || typeof workout !== 'object') return false;
  const { id, exercises } = doc as { id?: unknown; exercises?: unknown };
  return (
    typeof id === 'string' &&
    Array.isArray(exercises) &&
    typeof (client as { id?: unknown }).id === 'string'
  );
}

function sortRecords(records: CoachedWorkoutRecord[]): CoachedWorkoutRecord[] {
  return records.sort(
    (a, b) =>
      bookingKeyOf(a.bookingId).localeCompare(bookingKeyOf(b.bookingId)) || a.order - b.order,
  );
}

export function createCoachedSessionStore(
  prefix: string = KV_KEYS.coachActive,
): CoachedSessionStore {
  const keyOf = (bookingId: string | null, clientId: string) =>
    `${prefix}.${bookingKeyOf(bookingId)}.${clientId}`;

  const load = (): readonly CoachedWorkoutRecord[] => {
    const records: CoachedWorkoutRecord[] = [];
    for (const key of kv.keys()) {
      if (!key.startsWith(`${prefix}.`)) continue;
      const raw = kv.getString(key);
      if (raw === null) continue;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (isRecord(parsed)) {
        records.push(parsed);
        continue;
      }
      // Never silently drop a workout: park the unreadable payload for support.
      kv.setString(`${QUARANTINE}.${Date.now()}`, raw);
      kv.remove(key);
    }
    return sortRecords(records);
  };

  const store = createExternalStore<readonly CoachedWorkoutRecord[]>(load);
  const same = (r: CoachedWorkoutRecord, bookingId: string | null, clientId: string) =>
    r.bookingId === bookingId && r.client.id === clientId;

  const find = (bookingId: string | null, clientId: string) =>
    store.get().find((r) => same(r, bookingId, clientId)) ?? null;

  const put = (record: CoachedWorkoutRecord) => {
    kv.setString(keyOf(record.bookingId, record.client.id), JSON.stringify(record));
    const others = store.get().filter((r) => !same(r, record.bookingId, record.client.id));
    store.set(sortRecords([...others, record]));
  };

  return {
    all: store.get,
    find,
    put,
    setDoc(bookingId, clientId, doc) {
      const current = find(bookingId, clientId);
      if (!current) return null;
      const next = { ...current, doc };
      put(next);
      return next;
    },
    remove(bookingId, clientId) {
      kv.remove(keyOf(bookingId, clientId));
      store.set(store.get().filter((r) => !same(r, bookingId, clientId)));
    },
    subscribe: store.subscribe,
    reload: store.reset,
  };
}

/** The app-wide instance. */
export const coachedSessionStore = createCoachedSessionStore();

/** True when `record` belongs to the signed-in trainer (same rule as the owner's active session). */
export function ownedBy(record: CoachedWorkoutRecord, owner: string | null): boolean {
  return record.ownerId === null || owner === null || record.ownerId === owner;
}

/** Every coached workout on the phone (all owners — filter with `ownedBy`). */
export function useCoachedRecords(): readonly CoachedWorkoutRecord[] {
  return useSyncExternalStore(coachedSessionStore.subscribe, coachedSessionStore.all);
}

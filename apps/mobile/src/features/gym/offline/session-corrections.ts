import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import type { GymBootstrap, SessionSummaryDto, WorkoutSessionDoc } from '@chefer/types';
import {
  applySessionDeleted,
  applySessionEdited,
  bumpClientUpdatedAt,
  discardedTombstone,
  editSummary,
  snapshotTargets,
  touchedExerciseIds,
  type ProgressionTargetSnapshot,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { captureGymEvent } from '../analytics';
import { gymBootstrapQueryKey } from '../use-gym-bootstrap';
import { createExternalStore } from './external-store';
import { localDate, nowIso } from './ids';
import { KV_KEYS } from './keys';
import { kv } from './kv';
import { outbox, type OutboxEntry } from './outbox';
import { getGymOwner } from './owner';

// Correcting a past session through the existing outbox (UX-44, Δ2.3, no API
// change). Edit = a re-upsert with a newer clientUpdatedAt. Delete = the same
// session re-sent as a childless `DISCARDED` tombstone, held on the device for
// the 8 s Undo window (`holdUntil`), then flushed like any other entry (so it
// works offline); once acked online it is also hard-deleted with
// `gym.session.delete` (Q-30) so no soft-deleted row lingers.

/** The Undo snackbar's length — the delete is held on the device for exactly this long. */
export const UNDO_WINDOW_MS = 8000;
/** Flush a hair after the hold lapses (the hold is compared against the clock). */
const FLUSH_AFTER_HOLD_MS = 250;

export type DeleteSource = 'recent' | 'history' | 'detail';

/** A tRPC session.get query key — kept fresh so re-opening an edited session shows the edit. */
export function sessionGetQueryKey(id: string) {
  return getQueryKey(trpc.gym.session.get, { id }, 'query');
}

// ─── Pending hard deletes ─────────────────────────────────────────────────────

interface PendingHardDelete {
  id: string;
  /** True once the outbox acked the tombstone — only then is the hard delete safe to send. */
  acked: boolean;
}

function readHardDeletes(): PendingHardDelete[] {
  const raw = kv.getJSON(KV_KEYS.pendingHardDeletes);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is PendingHardDelete =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as PendingHardDelete).id === 'string' &&
      typeof (item as PendingHardDelete).acked === 'boolean',
  );
}

const hardDeleteStore = createExternalStore<PendingHardDelete[]>(readHardDeletes);

function writeHardDeletes(next: PendingHardDelete[]): void {
  kv.setJSON(KV_KEYS.pendingHardDeletes, next);
  hardDeleteStore.set(next);
}

function addHardDelete(id: string): void {
  writeHardDeletes([...hardDeleteStore.get().filter((p) => p.id !== id), { id, acked: false }]);
}

function removeHardDelete(id: string): void {
  writeHardDeletes(hardDeleteStore.get().filter((p) => p.id !== id));
}

/** Outbox `onSynced`: a tombstone was acked — its hard delete may go out now. */
export function markHardDeletesAcked(ids: readonly string[]): void {
  const wanted = new Set(ids);
  const current = hardDeleteStore.get();
  if (!current.some((p) => wanted.has(p.id) && !p.acked)) return;
  writeHardDeletes(current.map((p) => (wanted.has(p.id) ? { ...p, acked: true } : p)));
}

/** Outbox `onStale`: another device's newer copy won — never hard-delete over it. */
export function dropHardDeletes(ids: readonly string[]): void {
  const wanted = new Set(ids);
  const current = hardDeleteStore.get();
  if (!current.some((p) => wanted.has(p.id))) return;
  writeHardDeletes(current.filter((p) => !wanted.has(p.id)));
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error as { data?: { code?: string } };
  return data?.code === 'NOT_FOUND';
}

let hardDeleteRun: Promise<void> | null = null;

/**
 * Hard-deletes every acked tombstone (best effort, single-flight). A failure
 * other than NOT_FOUND keeps the id for the next pass (next sync or launch).
 * Entries that never got acked and are no longer in the outbox (the user
 * discarded the parked entry) are dropped without deleting anything.
 */
export function processPendingHardDeletes(
  hardDelete: (id: string) => Promise<unknown>,
): Promise<void> {
  if (hardDeleteRun) return hardDeleteRun;
  hardDeleteRun = (async () => {
    for (const pending of hardDeleteStore.get()) {
      const queued = outbox.getState().entries.some((e) => e.doc.id === pending.id);
      if (!pending.acked) {
        if (!queued) removeHardDelete(pending.id);
        continue;
      }
      try {
        await hardDelete(pending.id);
        removeHardDelete(pending.id);
      } catch (error) {
        if (isNotFound(error)) removeHardDelete(pending.id);
      }
    }
  })().finally(() => {
    hardDeleteRun = null;
  });
  return hardDeleteRun;
}

// Ids this process corrected (edit or delete) and hasn't seen acked yet — a
// `stale` ack for one of them means another device's newer copy won. In-memory
// on purpose: it only drives the one-off "changed on another device" snackbar.
const correctedIds = new Set<string>();

/** The subset of `ids` that were corrections made here (and forget them). */
export function takeCorrectedIds(ids: readonly string[]): string[] {
  const hit = ids.filter((id) => correctedIds.has(id));
  for (const id of ids) correctedIds.delete(id);
  return hit;
}

/** Test seam. */
export function resetSessionCorrectionsForTests(): void {
  correctedIds.clear();
  hardDeleteStore.reset();
  noticeStore.reset();
  for (const timer of holdTimers.values()) clearTimeout(timer);
  holdTimers.clear();
}

// ─── "Next time changed after your edit" (T-44.4, PAT-14) ────────────────────

export interface TargetNotice {
  sessionId: string;
  kind: 'edit' | 'delete';
  /** The corrected session's day — "Because you edited Tuesday's sets." */
  localDate: string;
  /** `bootstrap.progressions[].suggestion` for the touched exercises, before the correction. */
  before: ProgressionTargetSnapshot[];
  /**
   * When the outbox acked the correction. The diff only means something from
   * the first bootstrap fetched after this (the server has recomputed by then).
   */
  syncedAt: string | null;
}

function readNotice(): TargetNotice | null {
  const raw = kv.getJSON(KV_KEYS.targetNotice);
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<TargetNotice>;
  if (
    typeof value.sessionId !== 'string' ||
    (value.kind !== 'edit' && value.kind !== 'delete') ||
    typeof value.localDate !== 'string' ||
    !Array.isArray(value.before)
  ) {
    return null;
  }
  return { ...(value as TargetNotice), syncedAt: value.syncedAt ?? null };
}

const noticeStore = createExternalStore<TargetNotice | null>(readNotice);

export function getTargetNotice(): TargetNotice | null {
  return noticeStore.get();
}

export function setTargetNotice(notice: TargetNotice | null): void {
  if (notice === null) kv.remove(KV_KEYS.targetNotice);
  else kv.setJSON(KV_KEYS.targetNotice, notice);
  noticeStore.set(notice);
}

/** Drop the notice when it belongs to one of these sessions (Undo, a stale ack). */
export function clearTargetNoticeFor(ids: readonly string[]): void {
  const current = noticeStore.get();
  if (current && ids.includes(current.sessionId)) setTargetNotice(null);
}

/** Outbox `onSynced`: start the notice's clock once its session's correction was acked. */
export function markTargetNoticeSynced(ids: readonly string[]): void {
  const current = noticeStore.get();
  if (current?.syncedAt === null && ids.includes(current.sessionId)) {
    setTargetNotice({ ...current, syncedAt: nowIso() });
  }
}

export function useTargetNotice(): TargetNotice | null {
  return useSyncExternalStore(noticeStore.subscribe, noticeStore.get);
}

// ─── Delete with Undo ─────────────────────────────────────────────────────────

const holdTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface DeleteSessionArgs {
  queryClient: QueryClient;
  session: SessionSummaryDto;
  source: DeleteSource;
  show: (options: {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
  }) => void;
}

/**
 * Deletes a past session on this device right now (list, week count and streak
 * update at once), holds the tombstone for the 8 s Undo window, then lets the
 * outbox send it. Nothing reaches the server before the hold lapses, so Undo
 * (AC4) is instant, works offline and sends nothing.
 */
export async function deleteSessionWithUndo(args: DeleteSessionArgs): Promise<void> {
  const { queryClient, session, source, show } = args;
  const id = session.id;
  await queryClient.cancelQueries({ queryKey: gymBootstrapQueryKey });
  const before = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);

  // Whatever was still queued for this session (an unsynced edit) is replaced
  // by the tombstone; Undo puts it back.
  const displaced: OutboxEntry | undefined = outbox.getState().entries.find((e) => e.doc.id === id);
  const at = nowIso();
  const tombstone = discardedTombstone(session, {
    engineVersion: before?.engineVersion ?? 1,
    at,
  });

  setTargetNotice(
    before
      ? {
          sessionId: id,
          kind: 'delete',
          localDate: session.localDate,
          before: snapshotTargets(
            before.progressions,
            session.exercises.map((e) => e.exerciseId),
          ),
          syncedAt: null,
        }
      : null,
  );
  addHardDelete(id);
  correctedIds.add(id);
  outbox.enqueue(tombstone, {
    ownerId: getGymOwner(),
    holdUntil: new Date(Date.now() + UNDO_WINDOW_MS).toISOString(),
  });
  queryClient.setQueryData<GymBootstrap | undefined>(gymBootstrapQueryKey, (current) =>
    current ? applySessionDeleted(current, id, localDate()) : current,
  );
  holdTimers.set(
    id,
    setTimeout(() => {
      holdTimers.delete(id);
      void outbox.flush({ force: true });
    }, UNDO_WINDOW_MS + FLUSH_AFTER_HOLD_MS),
  );
  captureGymEvent('session_deleted', { from: source });

  show({
    message: 'Workout deleted',
    actionLabel: 'Undo',
    durationMs: UNDO_WINDOW_MS,
    onAction: () => {
      const timer = holdTimers.get(id);
      if (timer) clearTimeout(timer);
      holdTimers.delete(id);
      if (outbox.cancelHeld(id) === null) {
        // The hold already lapsed: the delete is on its way; don't pretend otherwise.
        show({ message: 'Too late to undo. The workout is already deleted.' });
        return;
      }
      if (displaced) outbox.enqueue(displaced.doc, { ownerId: displaced.ownerId });
      removeHardDelete(id);
      correctedIds.delete(id);
      clearTargetNoticeFor([id]);
      queryClient.setQueryData<GymBootstrap | undefined>(gymBootstrapQueryKey, (current) => {
        if (!before) return current;
        if (!current) return before;
        return {
          ...current,
          recentSessions: current.recentSessions.some((s) => s.id === id)
            ? current.recentSessions
            : [...current.recentSessions, session].sort(
                (a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id),
              ),
          weeks: before.weeks,
          streak: before.streak,
        };
      });
      void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
      captureGymEvent('session_delete_undone', {});
    },
  });
}

// ─── Save an edit ─────────────────────────────────────────────────────────────

/**
 * Saves an edited session: the corrected doc joins the outbox with a newer
 * clientUpdatedAt (offline-safe, idempotent — the server recomputes), the
 * cached lists show it at once, and the "Next time changed" snapshot is taken.
 * The live active-session store is never touched (AC3).
 */
export async function saveEditedSession(args: {
  queryClient: QueryClient;
  original: WorkoutSessionDoc;
  draft: WorkoutSessionDoc;
}): Promise<WorkoutSessionDoc> {
  const { queryClient, original, draft } = args;
  // A re-sent doc must not re-carry exercises over (that was decided at Finish).
  const { carryOverExerciseIds: _carried, ...rest } = draft;
  const doc: WorkoutSessionDoc = {
    ...rest,
    clientUpdatedAt: bumpClientUpdatedAt(original.clientUpdatedAt, nowIso()),
  };

  await queryClient.cancelQueries({ queryKey: gymBootstrapQueryKey });
  const before = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
  setTargetNotice(
    before
      ? {
          sessionId: doc.id,
          kind: 'edit',
          localDate: original.localDate,
          before: snapshotTargets(before.progressions, touchedExerciseIds(original, doc)),
          syncedAt: null,
        }
      : null,
  );
  correctedIds.add(doc.id);
  outbox.enqueue(doc, { ownerId: getGymOwner() });
  queryClient.setQueryData<GymBootstrap | undefined>(gymBootstrapQueryKey, (current) =>
    current ? applySessionEdited(current, doc, localDate()) : current,
  );
  queryClient.setQueryData(sessionGetQueryKey(doc.id), doc);
  captureGymEvent('session_edited', editSummary(original, doc));
  return doc;
}

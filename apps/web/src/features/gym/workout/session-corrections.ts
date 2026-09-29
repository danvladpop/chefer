'use client';

import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import {
  applySessionDeleted,
  discardedTombstone,
  sessionDeletePreview,
  weekdayDateLabel,
} from '@chefer/utils';
import { captureGymEvent } from '../analytics';
import { showGymToast } from '../shared/gym-toast';
import { localDate } from '../use-gym-bootstrap';
import { nowIso } from './ids';
import { outbox } from './outbox';
import { getGymOwner } from './owner';
import { getStorage, GYM_KEYS, readJson } from './storage';

// Deleting a past workout on web (UX-44, T-44.5, Δ2.3). Same shape as the
// phone: the tombstone (the session re-sent as a childless DISCARDED doc) is
// held for the 8 s Undo window, then flushed through the outbox (offline-safe),
// and hard-deleted with `gym.session.delete` once the server has acked it.
// Web edit mode is not built (phone only) — see mobile_parity_backlog.md.

export const UNDO_WINDOW_MS = 8000;
const FLUSH_AFTER_HOLD_MS = 250;

export type DeleteSource = 'recent' | 'history' | 'detail';

// ─── The confirm's words ──────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Completed working sets — the confirm's "{n} sets". */
export function completedWorkingSets(session: SessionSummaryDto): number {
  return session.exercises.reduce(
    (n, ex) => (ex.skipped ? n : n + ex.sets.filter((s) => !s.isWarmup && s.completed).length),
    0,
  );
}

/**
 * The confirm's lines — only what changes (AC4): the workout and its sets, this
 * week's count, the streak, and that targets are worked out again.
 */
export function deleteConfirmLines(
  session: SessionSummaryDto,
  bootstrap: Pick<GymBootstrap, 'weeks' | 'streak'> | undefined,
  today: string = localDate(),
): string[] {
  const preview = sessionDeletePreview({
    weeks: bootstrap?.weeks ?? [],
    streak: bootstrap?.streak ?? {
      current: 0,
      best: 0,
      flexTokens: 0,
      thisWeekSessions: 0,
      thisWeekGoal: 1,
    },
    sessionLocalDate: session.localDate,
    sessionStatus: session.status,
    setsCount: completedWorkingSets(session),
    today,
  });
  const lines = [
    `${session.name} on ${weekdayDateLabel(session.localDate)}: ${plural(preview.setsCount, 'set', 'sets')}.`,
  ];
  if (preview.weekChanged) {
    lines.push(
      `This week goes from ${preview.thisWeekBefore} to ${plural(preview.thisWeekAfter, 'session', 'sessions')}.`,
    );
  }
  if (preview.streakChanged) {
    lines.push(
      `Your streak goes from ${plural(preview.streakBefore, 'week', 'weeks')} to ${preview.streakAfter}.`,
    );
  }
  lines.push('Next time targets for its exercises are worked out again.');
  return lines;
}

// ─── Pending hard deletes ─────────────────────────────────────────────────────

interface PendingHardDelete {
  id: string;
  /** True once the outbox acked the tombstone — only then is the hard delete safe. */
  acked: boolean;
}

function readHardDeletes(): PendingHardDelete[] {
  const raw = readJson(getStorage(), GYM_KEYS.pendingHardDeletes);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is PendingHardDelete =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as PendingHardDelete).id === 'string' &&
      typeof (item as PendingHardDelete).acked === 'boolean',
  );
}

function writeHardDeletes(next: PendingHardDelete[]): void {
  getStorage().setItem(GYM_KEYS.pendingHardDeletes, JSON.stringify(next));
}

function addHardDelete(id: string): void {
  writeHardDeletes([...readHardDeletes().filter((p) => p.id !== id), { id, acked: false }]);
}

function removeHardDelete(id: string): void {
  writeHardDeletes(readHardDeletes().filter((p) => p.id !== id));
}

/** Outbox `onSynced`: a tombstone was acked — its hard delete may go out now. */
export function markHardDeletesAcked(ids: readonly string[]): void {
  const wanted = new Set(ids);
  const current = readHardDeletes();
  if (!current.some((p) => wanted.has(p.id) && !p.acked)) return;
  writeHardDeletes(current.map((p) => (wanted.has(p.id) ? { ...p, acked: true } : p)));
}

/** Outbox `onStale`: a newer copy from elsewhere won — never hard-delete over it. */
export function dropHardDeletes(ids: readonly string[]): void {
  const wanted = new Set(ids);
  const current = readHardDeletes();
  if (current.some((p) => wanted.has(p.id))) {
    writeHardDeletes(current.filter((p) => !wanted.has(p.id)));
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error as { data?: { code?: string } | null };
  return data?.code === 'NOT_FOUND';
}

let hardDeleteRun: Promise<void> | null = null;

/**
 * Hard-deletes every acked tombstone (best effort, single-flight). Anything but
 * NOT_FOUND keeps the id for the next pass. Never-acked ids that left the
 * outbox (the user discarded the parked entry) are dropped without deleting.
 */
export function processPendingHardDeletes(
  hardDelete: (id: string) => Promise<unknown>,
): Promise<void> {
  if (hardDeleteRun) return hardDeleteRun;
  hardDeleteRun = (async () => {
    for (const pending of readHardDeletes()) {
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

// Ids deleted from this tab whose ack hasn't landed: a `stale` ack for one means
// another device's newer copy won (drives the one-off toast in GymSync).
const correctedIds = new Set<string>();

export function takeCorrectedIds(ids: readonly string[]): string[] {
  const hit = ids.filter((id) => correctedIds.has(id));
  for (const id of ids) correctedIds.delete(id);
  return hit;
}

// ─── Delete with Undo ─────────────────────────────────────────────────────────

const holdTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** The slice of tRPC utils the delete needs (typed loosely so tests can fake it). */
export interface DeleteUtils {
  gym: {
    bootstrap: {
      cancel: () => Promise<void>;
      setData: (
        input: { today: string },
        updater: (prev: GymBootstrap | undefined) => GymBootstrap | undefined,
      ) => void;
      invalidate: () => Promise<void> | void;
    };
  };
}

/**
 * Deletes a past session in this browser right now (lists, week count and
 * streak update at once), holds the tombstone for the 8 s Undo window, then
 * lets the outbox send it. Nothing reaches the server before the hold lapses.
 */
export async function deleteSessionWithUndo(args: {
  utils: DeleteUtils;
  session: SessionSummaryDto;
  engineVersion: number;
  source: DeleteSource;
  /** Optional cached bootstrap snapshot (for restoring week/streak on Undo). */
  previous?: GymBootstrap | undefined;
}): Promise<void> {
  const { utils, session, source } = args;
  const id = session.id;
  const today = localDate();
  await utils.gym.bootstrap.cancel();

  const displaced = outbox.getState().entries.find((e) => e.doc.id === id);
  const tombstone = discardedTombstone(session, {
    engineVersion: args.engineVersion,
    at: nowIso(),
  });
  addHardDelete(id);
  correctedIds.add(id);
  outbox.enqueue(tombstone, {
    ownerId: getGymOwner(),
    holdUntil: new Date(Date.now() + UNDO_WINDOW_MS).toISOString(),
  });
  let before: GymBootstrap | undefined = args.previous;
  utils.gym.bootstrap.setData({ today }, (prev) => {
    before ??= prev;
    return prev ? applySessionDeleted(prev, id, today) : prev;
  });
  holdTimers.set(
    id,
    setTimeout(() => {
      holdTimers.delete(id);
      void outbox.flush({ force: true });
    }, UNDO_WINDOW_MS + FLUSH_AFTER_HOLD_MS),
  );
  captureGymEvent('session_deleted', { from: source });

  showGymToast({
    message: 'Workout deleted',
    actionLabel: 'Undo',
    durationMs: UNDO_WINDOW_MS,
    onAction: () => {
      const timer = holdTimers.get(id);
      if (timer) clearTimeout(timer);
      holdTimers.delete(id);
      if (outbox.cancelHeld(id) === null) {
        // The hold already lapsed: the delete is on its way; don't pretend otherwise.
        showGymToast({ message: 'Too late to undo. The workout is already deleted.' });
        return;
      }
      if (displaced) outbox.enqueue(displaced.doc, { ownerId: displaced.ownerId });
      removeHardDelete(id);
      correctedIds.delete(id);
      utils.gym.bootstrap.setData({ today }, (prev) => {
        if (!before) return prev;
        if (!prev) return before;
        return {
          ...prev,
          recentSessions: prev.recentSessions.some((s) => s.id === id)
            ? prev.recentSessions
            : [...prev.recentSessions, session].sort(
                (a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id),
              ),
          weeks: before.weeks,
          streak: before.streak,
        };
      });
      void utils.gym.bootstrap.invalidate();
      captureGymEvent('session_delete_undone', {});
    },
  });
}

/** Test seam. */
export function resetSessionCorrectionsForTests(): void {
  correctedIds.clear();
  for (const timer of holdTimers.values()) clearTimeout(timer);
  holdTimers.clear();
}

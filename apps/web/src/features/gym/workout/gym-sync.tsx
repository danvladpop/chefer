'use client';

import { useEffect } from 'react';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { trpc } from '@/lib/trpc';
import { showGymToast } from '../shared/gym-toast';
import { activeSessionStore } from './active-session-store';
import { outbox, type SendDocs } from './outbox';
import { invalidateGymOwnerConfirmation, setGymOwner } from './owner';
import {
  dropHardDeletes,
  markHardDeletesAcked,
  processPendingHardDeletes,
  takeCorrectedIds,
} from './session-corrections';
import { GYM_KEYS } from './storage';
import { reconcileActiveSession } from './use-active-workout';

/** While entries wait, retry this often (non-forced, so the backoff still applies). */
const TICK_MS = 30_000;

/**
 * Wires the web gym outbox to the signed-in session. Mounted once in the
 * dashboard shell, so a workout finished offline uploads from whatever page
 * the user is on when the connection returns. Renders nothing.
 *  • confirms the owner of this browser's gym data via auth.me;
 *  • gives the outbox its tRPC sender, invalidating gym.bootstrap on acks;
 *  • flushes on `online`, on window focus / tab visible, and every 30 s;
 *  • picks up another tab's writes (the `storage` event).
 */
export function GymSync() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const userId = user?.id ?? null;

  // Configure the sender first: effects run in order, and the owner effect
  // below flushes straight away.
  useEffect(() => {
    const send: SendDocs = async (docs) =>
      (await utils.client.gym.session.upsertMany.mutate({ docs })).results;
    const hardDelete = (id: string) => utils.client.gym.session.delete.mutate({ id });
    outbox.configure({
      send,
      onSynced: (ids) => {
        // UX-44: a deleted session's tombstone is hard-deleted once the server has acked it.
        markHardDeletesAcked(ids);
        void utils.gym.bootstrap.invalidate();
        void processPendingHardDeletes(hardDelete);
      },
      onStale: (ids) => {
        // Another device's newer copy won (last write wins): our delete did not apply.
        dropHardDeletes(ids);
        if (takeCorrectedIds(ids).length > 0) {
          showGymToast({
            message: 'This workout was changed on another device. Showing the latest.',
          });
        }
      },
    });

    const flushNow = () => void outbox.flush({ force: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushNow();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === GYM_KEYS.outbox) outbox.reload();
      if (event.key === GYM_KEYS.activeSession) activeSessionStore.reload();
    };
    window.addEventListener('online', flushNow);
    window.addEventListener('focus', flushNow);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    const tick = setInterval(() => {
      if (outbox.getState().entries.some((e) => !e.parkedReason)) void outbox.flush();
    }, TICK_MS);

    return () => {
      outbox.configure(null);
      window.removeEventListener('online', flushNow);
      window.removeEventListener('focus', flushNow);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      clearInterval(tick);
    };
  }, [utils]);

  useEffect(() => {
    if (userId === null) {
      invalidateGymOwnerConfirmation();
      return;
    }
    setGymOwner(userId);
    reconcileActiveSession(userId);
    void outbox
      .flush({ force: true })
      .then(() =>
        processPendingHardDeletes((id) => utils.client.gym.session.delete.mutate({ id })),
      );
  }, [userId, utils]);

  return null;
}

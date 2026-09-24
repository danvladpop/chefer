import { useEffect } from 'react';
import { onlineManager, useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query';
import { trpc } from '../../../lib/trpc';
import { startRestNotifications } from '../rest-timer';
import { reconcileActiveSession } from '../use-active-workout';
import { activeSessionStore } from './active-session-store';
import { startCheckpointing } from './checkpoint';
import { outbox, type SendDocs } from './outbox';
import { getConfirmedGymOwner, invalidateGymOwnerConfirmation, setGymOwner } from './owner';
import { clearGymQueries } from './query-persistence';
import { startOutboxTriggers } from './sync-triggers';

/** Non-reversible 32-bit FNV-1a fingerprint — distinguishes tokens, reveals nothing. */
function tokenFingerprint(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Wires the gym offline layer to the signed-in session (mounted once in the
 * root layout, inside the tRPC + PersistQueryClient providers):
 *  • confirms the owner of on-device gym data via auth.me for THIS token;
 *  • gives the outbox and the in-progress checkpoint their tRPC sender;
 *  • starts the flush triggers and the rest-timer notification bridge;
 *  • repairs the active session at startup (finished-but-not-cleared, or
 *    left behind by another account).
 */
export function GymSyncProvider({
  token,
  children,
}: {
  token: string | null;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const isRestoring = useIsRestoring();

  // A new token (sign-in, sign-out) must be re-confirmed before uploads.
  useEffect(() => {
    invalidateGymOwnerConfirmation();
  }, [token]);

  // Keyed per token (hashed — no token material in the cache) so a new
  // sign-in always asks the server afresh: the shared auth.me cache can still
  // hold the previous user for a moment.
  const owner = useQuery({
    queryKey: ['gym-owner-check', token ? tokenFingerprint(token) : null],
    queryFn: () => utils.client.auth.me.query(),
    enabled: token !== null,
    staleTime: Infinity,
    gcTime: 0,
  });
  const userId = owner.data?.id ?? null;

  useEffect(() => {
    if (userId === null) return;
    const { changed } = setGymOwner(userId);
    if (changed) clearGymQueries(queryClient);
    reconcileActiveSession(userId);
    void outbox.flush({ force: true });
  }, [userId, queryClient]);

  // Signed out: drop cached gym reads (the outbox and active session stay —
  // they upload when their owner signs back in).
  useEffect(() => {
    if (token === null && !isRestoring) clearGymQueries(queryClient);
  }, [token, isRestoring, queryClient]);

  useEffect(() => {
    if (token === null) return;
    const send: SendDocs = async (docs) =>
      (await utils.client.gym.session.upsertMany.mutate({ docs })).results;
    outbox.configure({
      send,
      onSynced: () => {
        void utils.gym.bootstrap.invalidate();
      },
    });
    const stopTriggers = startOutboxTriggers();
    const stopCheckpoint = startCheckpointing({
      getRecord: activeSessionStore.get,
      subscribe: activeSessionStore.subscribe,
      send,
      isOnline: () => onlineManager.isOnline(),
      getOwnerId: getConfirmedGymOwner,
    });
    const stopRestNotifications = startRestNotifications();
    return () => {
      outbox.configure(null);
      stopTriggers();
      stopCheckpoint();
      stopRestNotifications();
    };
  }, [token, utils]);

  return children;
}

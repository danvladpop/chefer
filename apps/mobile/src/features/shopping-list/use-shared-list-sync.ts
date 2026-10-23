import { useEffect, useRef } from 'react';
import { HOUSEHOLD_SHARING_LIMITS, type ListPersonDto } from '@chefer/types';
import { mergeSyncedChecks } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { shopOutbox } from './shop-outbox';

// ─── Live shared list (ADR 0003) ──────────────────────────────────────────────
// While Shop is on screen and the household is shared, ask `shoppingList.sync` every 4 s: its ticks are
// merged into the cached list (a key with a tick still in the outbox keeps the local state), and a new
// `revision` (a meal swap, a custom item) refetches the whole list. Returns who ticked what.

const NO_ONE: Record<string, ListPersonDto> = {};

export function useSharedListSync({
  weekOffset,
  planId,
  enabled,
}: {
  weekOffset: number;
  planId: string | null | undefined;
  /** Shared household AND the Shop screen focused. */
  enabled: boolean;
}): Record<string, ListPersonDto> {
  const utils = trpc.useUtils();
  const sync = trpc.shoppingList.sync.useQuery(
    { weekOffset },
    {
      enabled,
      staleTime: 0,
      refetchInterval: enabled ? HOUSEHOLD_SHARING_LIMITS.listPollMs : false,
      // Not while the app is in the background, and never retried in a loop: the next poll is the retry.
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
  const lastRevision = useRef<{ weekOffset: number; revision: string } | null>(null);

  const data = sync.data;
  useEffect(() => {
    if (!enabled || !data) return;
    const list = utils.shoppingList.getForWeek.getData({ weekOffset });
    const seen = lastRevision.current;
    lastRevision.current = { weekOffset, revision: data.revision };
    // The items changed (or the list is for another plan now): the whole list again.
    if (
      (seen !== null && seen.weekOffset === weekOffset && seen.revision !== data.revision) ||
      (list && data.planId !== list.planId)
    ) {
      void utils.shoppingList.getForWeek.invalidate({ weekOffset });
      return;
    }
    if (!list) return;
    const merged = mergeSyncedChecks(list, data, shopOutbox.pendingKeys(list.planId));
    if (merged.remoteChanges === 0) return;
    utils.shoppingList.getForWeek.setData({ weekOffset }, (old) =>
      old ? { ...old, checkedKeys: merged.checkedKeys } : old,
    );
    track('shared_list_synced', { remoteChanges: merged.remoteChanges });
  }, [data, enabled, utils, weekOffset]);

  return enabled && data && data.planId === planId ? data.checkedBy : NO_ONE;
}

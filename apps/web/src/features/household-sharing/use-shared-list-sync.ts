'use client';

import { useCallback, useEffect, useRef } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { HOUSEHOLD_SHARING_LIMITS, type ListPersonDto } from '@chefer/types';
import { mergeSyncedChecks } from '@chefer/utils';

// ─── Live shared list (ADR 0003) ──────────────────────────────────────────────
// While the Shop page is open and the household is shared, ask
// `shoppingList.sync` every 4 s (React Query pauses the interval while the tab
// is hidden). Its ticks merge into the cached list — a key with a local toggle
// still in flight keeps the local state (`mergeSyncedChecks`) — and a new
// `revision` (a swap, a custom item) refetches the whole list.
//
// A toggle cancels any sync already on its way (its answer predates the
// toggle) and asks again once the toggle has landed.

const EMPTY_CHECKED_BY: Record<string, ListPersonDto> = {};

export function useSharedListSync({
  weekOffset,
  enabled,
}: {
  weekOffset: number;
  enabled: boolean;
}): {
  /** Who ticked each key, as of the last sync. */
  checkedBy: Record<string, ListPersonDto>;
  /** Call from the toggle's onMutate. */
  beginToggle: (keys: string[]) => void;
  /** Call from the toggle's onSettled. */
  endToggle: (keys: string[]) => void;
} {
  const utils = trpc.useUtils();
  const sync = trpc.shoppingList.sync.useQuery(
    { weekOffset },
    {
      enabled,
      refetchInterval: enabled ? HOUSEHOLD_SHARING_LIMITS.listPollMs : false,
      refetchIntervalInBackground: false,
      staleTime: 0,
      // A failed poll just waits for the next one.
      retry: false,
    },
  );

  // Local toggles in flight, counted per key (a quick double tap is two).
  const pending = useRef(new Map<string, number>());
  const lastRevision = useRef<{ weekOffset: number; revision: string } | null>(null);

  const data = sync.data;
  useEffect(() => {
    if (!enabled || !data) return;
    const last = lastRevision.current;
    lastRevision.current = { weekOffset, revision: data.revision };
    if (last?.weekOffset === weekOffset && last.revision !== data.revision) {
      void utils.shoppingList.getForWeek.invalidate({ weekOffset });
    }

    const current = utils.shoppingList.getForWeek.getData({ weekOffset });
    // Another week's or another plan's answer (the list moved on): nothing to merge.
    if (!current) return;
    if (current.planId !== data.planId) return;
    const pendingKeys = new Set(pending.current.keys());
    const { remoteChanges } = mergeSyncedChecks(current, data, pendingKeys);
    if (remoteChanges === 0) return;
    utils.shoppingList.getForWeek.setData({ weekOffset }, (old) =>
      old ? { ...old, checkedKeys: mergeSyncedChecks(old, data, pendingKeys).checkedKeys } : old,
    );
    capture('shared_list_synced', { remoteChanges });
    // Runs per answer (dataUpdatedAt), not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.dataUpdatedAt, enabled, weekOffset]);

  const beginToggle = useCallback(
    (keys: string[]) => {
      for (const key of keys) pending.current.set(key, (pending.current.get(key) ?? 0) + 1);
      if (enabled) void utils.shoppingList.sync.cancel({ weekOffset });
    },
    [enabled, utils, weekOffset],
  );

  const endToggle = useCallback(
    (keys: string[]) => {
      for (const key of keys) {
        const left = (pending.current.get(key) ?? 1) - 1;
        if (left > 0) pending.current.set(key, left);
        else pending.current.delete(key);
      }
      if (enabled) void utils.shoppingList.sync.invalidate({ weekOffset });
    },
    [enabled, utils, weekOffset],
  );

  return {
    checkedBy: enabled ? (data?.checkedBy ?? EMPTY_CHECKED_BY) : EMPTY_CHECKED_BY,
    beginToggle,
    endToggle,
  };
}

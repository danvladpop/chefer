import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { trpc } from '../../lib/trpc';
import { shopOutbox, withPendingToggles, type ShopOutboxEntry } from './shop-outbox';

// ─── Shop ticks through the durable outbox (ADR 0003) ─────────────────────────
// Both Shop screens (the new shell's and the old (food) tab) tick through `useShopToggle`: the list's
// cache flips at once (optimistic, as before), the tick is written to the outbox, and the outbox is
// flushed. `ShopOutboxHost` (root layout) flushes whatever a killed app left behind at launch and on
// every reconnect.

type Utils = ReturnType<typeof trpc.useUtils>;

/** The waiting ticks (re-renders when they change). */
export function useShopOutboxEntries(): readonly ShopOutboxEntry[] {
  return useSyncExternalStore(
    (listener) => shopOutbox.subscribe(listener),
    () => shopOutbox.entries(),
    () => shopOutbox.entries(),
  );
}

/** A list's checked keys as the user sees them: the server's, with the waiting ticks applied. */
export function useCheckedWithPending(
  checkedKeys: readonly string[] | undefined,
  planId: string | null | undefined,
): string[] {
  const entries = useShopOutboxEntries();
  return withPendingToggles(checkedKeys ?? [], entries, planId);
}

async function flushWith(utils: Utils): Promise<void> {
  if (!onlineManager.isOnline() || shopOutbox.entries().length === 0) return;
  const result = await shopOutbox.flush((entry) =>
    utils.client.shoppingList.toggleItems.mutate(entry),
  );
  // A refused tick (the plan is gone) was shown as done: read the list again.
  if (result.dropped.length > 0) void utils.shoppingList.getForWeek.invalidate();
}

export function useFlushShopOutbox(): () => Promise<void> {
  const utils = trpc.useUtils();
  return useCallback(() => flushWith(utils), [utils]);
}

/** Ticks `keys` of a week's list: optimistic cache write, then the outbox, then a flush. */
export function useShopToggle(weekOffset: number) {
  const utils = trpc.useUtils();
  return useCallback(
    (planId: string, keys: string[], checked: boolean) => {
      void utils.shoppingList.getForWeek.cancel({ weekOffset });
      utils.shoppingList.getForWeek.setData({ weekOffset }, (old) =>
        old
          ? {
              ...old,
              checkedKeys: checked
                ? [...new Set([...old.checkedKeys, ...keys])]
                : old.checkedKeys.filter((k) => !keys.includes(k)),
            }
          : old,
      );
      shopOutbox.enqueue({ planId, keys, checked, at: new Date().toISOString() });
      void flushWith(utils);
    },
    [utils, weekOffset],
  );
}

/** Renders nothing. Sends ticks left from an earlier run, and every time the phone is back online. */
export function ShopOutboxHost({ signedIn }: { signedIn: boolean }) {
  const flush = useFlushShopOutbox();
  useEffect(() => {
    if (!signedIn) return;
    void flush();
    return onlineManager.subscribe((online) => {
      if (online) void flush();
    });
  }, [signedIn, flush]);
  return null;
}

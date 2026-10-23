import type { QueryClient } from '@tanstack/react-query';

// Where a Kitchen progress refresh comes from (build-plan.md Lane C §5).
// Meals are logged from ~10 places, the shopping list is ticked from two, and
// a cook ends in cook mode — so, like the store-rating prompt
// (review/review-signals.ts), the trigger hangs off the query client's mutation
// cache (src/lib/trpc.ts) rather than every call site: after a `tracker.*`,
// `shoppingList.toggleItems` or `progress.finishCook` success the summary and
// the inbox refetch (the inbox is what `ProgressHost` turns into a snackbar,
// a level-up or an unlock). The gym sync calls `invalidateProgress` itself
// (gym-sync-provider.tsx onSynced). Invalidation only refetches ACTIVE
// queries, so with the gate off nothing is fetched.

/** "tracker.logRecipe" from a tRPC mutation key (`[['tracker','logRecipe'], …]`). */
function pathOf(key: readonly unknown[] | undefined): string | null {
  const head = key?.[0];
  if (!Array.isArray(head) || !head.every((p) => typeof p === 'string')) return null;
  return head.join('.');
}

/** Whether a successful mutation can have earned something. */
export function isProgressMutation(key: readonly unknown[] | undefined): boolean {
  const path = pathOf(key);
  if (path === null) return false;
  return (
    path.startsWith('tracker.') ||
    path === 'shoppingList.toggleItems' ||
    path === 'progress.finishCook'
  );
}

const REFRESHED = ['summary', 'inbox', 'achievements', 'receiptFor'] as const;

/** Marks the progress reads stale; the mounted ones refetch. */
export function invalidateProgress(client: QueryClient): void {
  for (const procedure of REFRESHED) {
    void client.invalidateQueries({ queryKey: [['progress', procedure]] });
  }
}

/** MutationCache `onSuccess`. Never throws. */
export function progressOnMutationSuccess(
  client: QueryClient,
  mutationKey: readonly unknown[] | undefined,
): void {
  try {
    if (isProgressMutation(mutationKey)) invalidateProgress(client);
  } catch {
    // ignore
  }
}

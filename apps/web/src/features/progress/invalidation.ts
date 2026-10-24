import type { QueryClient } from '@tanstack/react-query';

// ─── Refresh Kitchen progress after an action that can earn XP ────────────────
// tech-plan §6 "Moments": after `tracker.*`, `shoppingList.toggleItems` or
// `progress.finishCook` succeeds the summary and the inbox are stale. The
// same hook point as mobile's `review-signals.ts` (the query client's
// mutation cache). A gym sync is handled in `GymSync` (it sends through
// `utils.client`, which bypasses the mutation cache).

/** "tracker.logRecipe" from a tRPC mutation key (`[['tracker', 'logRecipe']]`). */
function pathOf(mutationKey: readonly unknown[] | undefined): string | null {
  const head = mutationKey?.[0];
  if (!Array.isArray(head) || !head.every((part) => typeof part === 'string')) return null;
  return head.join('.');
}

export function isProgressTrigger(mutationKey: readonly unknown[] | undefined): boolean {
  const path = pathOf(mutationKey);
  if (path === null) return false;
  return (
    path.startsWith('tracker.') ||
    path === 'shoppingList.toggleItems' ||
    path === 'progress.finishCook'
  );
}

/** Marks every cached `progress.summary` / `progress.inbox` stale (active ones refetch). */
export function invalidateProgress(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: [['progress', 'summary']] });
  void client.invalidateQueries({ queryKey: [['progress', 'inbox']] });
}

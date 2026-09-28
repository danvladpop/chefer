import type { trpc } from '@/lib/trpc';

// ─── Shared day-query invalidation (bug B-44, T-BUG-44; mirrors
// apps/mobile/src/features/tracker/invalidate.ts) ───────────────────────────
// "Today" (dashboard.summary) used to lag the tracker by ~8s after a photo
// scan / quick-add on web too: individual mutations only refetched
// `tracker.getDay`, so the weekly/monthly summaries, the dashboard ring and
// the Log sheet's "Recent" list (bug B-34 follow-up, AC1) only caught up on
// their own 60s staleTime refetch. Every mutation that changes a day's log
// calls this ONE helper so those surfaces can never drift out of sync again.

export type TrpcUtils = ReturnType<(typeof trpc)['useUtils']>;

/**
 * Invalidates every query a logged/edited/undone day can affect: the day
 * itself, the weekly/monthly summaries, Today's dashboard ring, and the Log
 * sheet's Recent list. `date` is optional — omit it to invalidate
 * `tracker.getDay` for every cached date (safer after a bulk change like
 * copyDay, where more than one date may be affected).
 */
export function invalidateDayQueries(utils: TrpcUtils, date?: string): void {
  void utils.tracker.getDay.invalidate(date ? { date } : undefined);
  void utils.tracker.weeklySummary.invalidate();
  void utils.tracker.monthlySummary.invalidate();
  void utils.tracker.recents.invalidate();
  void utils.dashboard.summary.invalidate();
}

import type { trpc } from '../../lib/trpc';

// ─── Shared day-query invalidation (bug B-44, T-BUG-44) ────────────────────────
// "Today" (dashboard.summary) used to lag the tracker by ~8s after a photo
// scan: scan-meal-card.tsx's log mutation invalidated nothing, so the
// dashboard ring only caught up on its own stale-time refetch. Every mutation
// that changes a day's log calls this ONE helper so the day surfaces (the
// tracker, its weekly strip, Today's ring) can never drift out of sync again.

type TrpcUtils = ReturnType<(typeof trpc)['useUtils']>;

/**
 * Invalidates every query a logged/edited/undone day can affect: the day
 * itself, the weekly strip, and Today's dashboard ring. `date` is optional —
 * omit it to invalidate `tracker.getDay` for every cached date (safer after a
 * bulk change like copyDay, where more than one date may be affected).
 */
export function invalidateDayQueries(utils: TrpcUtils, date?: string): void {
  void utils.tracker.getDay.invalidate(date ? { date } : undefined);
  void utils.tracker.weeklySummary.invalidate();
  void utils.tracker.monthlySummary.invalidate();
  void utils.dashboard.summary.invalidate();
}

import { describe, expect, it, vi } from 'vitest';
import { invalidateDayQueries, type TrpcUtils } from './invalidate';

// AC1 follow-up to bug B-34/T-19.2: a logged/edited/undone day must also
// invalidate the Log sheet's Recent list, not just tracker.getDay — otherwise
// a custom entry logged via the manual fallback doesn't show up under Recent
// until tracker.recents' own 60s staleTime elapses (mirrors
// apps/mobile/src/features/tracker/invalidate.ts).

function makeMocks() {
  return {
    getDay: vi.fn(),
    weeklySummary: vi.fn(),
    monthlySummary: vi.fn(),
    recents: vi.fn(),
    dashboardSummary: vi.fn(),
  };
}

/** A minimal `trpc.useUtils()` double — only the members invalidateDayQueries touches. */
function makeUtils(mocks: ReturnType<typeof makeMocks>): TrpcUtils {
  return {
    tracker: {
      getDay: { invalidate: mocks.getDay },
      weeklySummary: { invalidate: mocks.weeklySummary },
      monthlySummary: { invalidate: mocks.monthlySummary },
      recents: { invalidate: mocks.recents },
    },
    dashboard: { summary: { invalidate: mocks.dashboardSummary } },
  } as unknown as TrpcUtils;
}

describe('invalidateDayQueries (AC1: Recent stays fresh)', () => {
  it('invalidates tracker.recents alongside the day, summaries and dashboard ring', () => {
    const mocks = makeMocks();
    invalidateDayQueries(makeUtils(mocks), '2026-09-26');

    expect(mocks.getDay).toHaveBeenCalledWith({ date: '2026-09-26' });
    expect(mocks.weeklySummary).toHaveBeenCalled();
    expect(mocks.monthlySummary).toHaveBeenCalled();
    expect(mocks.recents).toHaveBeenCalled();
    expect(mocks.dashboardSummary).toHaveBeenCalled();
  });

  it('invalidates every cached day when no date is given (bulk changes like copyDay)', () => {
    const mocks = makeMocks();
    invalidateDayQueries(makeUtils(mocks));

    expect(mocks.getDay).toHaveBeenCalledWith(undefined);
  });
});

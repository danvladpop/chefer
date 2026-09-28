import { invalidateDayQueries, type TrpcUtils } from '../../src/features/tracker/invalidate';

// AC1 follow-up to bug B-34/T-19.2: a logged/edited/undone day must also
// invalidate the Log sheet's Recent list, not just getDay/weeklySummary/
// monthlySummary/dashboard.summary — otherwise a custom entry logged via the
// manual fallback doesn't show up under Recent until tracker.recents' own
// 60s staleTime elapses.

describe('invalidateDayQueries (AC1: Recent stays fresh)', () => {
  it('invalidates tracker.recents alongside the day, summaries and dashboard ring', () => {
    const getDay = jest.fn();
    const weeklySummary = jest.fn();
    const monthlySummary = jest.fn();
    const recents = jest.fn();
    const dashboardSummary = jest.fn();
    const utils = {
      tracker: {
        getDay: { invalidate: getDay },
        weeklySummary: { invalidate: weeklySummary },
        monthlySummary: { invalidate: monthlySummary },
        recents: { invalidate: recents },
      },
      dashboard: { summary: { invalidate: dashboardSummary } },
    } as unknown as TrpcUtils;

    invalidateDayQueries(utils, '2026-09-26');

    expect(getDay).toHaveBeenCalledWith({ date: '2026-09-26' });
    expect(weeklySummary).toHaveBeenCalled();
    expect(monthlySummary).toHaveBeenCalled();
    expect(recents).toHaveBeenCalled();
    expect(dashboardSummary).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeNoticeCard } from './ChangeNoticeCard';

// §2.11, T-11.1/T-11.5 — "never change your targets silently" made visible.

const m = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  invalidate: vi.fn(),
  changesData: undefined as unknown[] | undefined,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      targets: { changes: { invalidate: m.invalidate }, get: { invalidate: m.invalidate } },
      tracker: { getDay: { invalidate: m.invalidate } },
      dashboard: { summary: { invalidate: m.invalidate } },
    }),
    targets: {
      changes: { useQuery: () => ({ data: m.changesData }) },
      acknowledgeChange: { useMutation: () => ({ mutate: m.acknowledge }) },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.changesData = undefined;
});

describe('ChangeNoticeCard', () => {
  it('renders nothing when there is no unresolved change', () => {
    m.changesData = [];
    render(<ChangeNoticeCard />);
    expect(screen.queryByTestId('change-notice-card')).toBeNull();
  });

  it('a CHANGED row shows the before/after numbers', () => {
    m.changesData = [
      {
        id: 'c1',
        kind: 'CHANGED',
        reason: 'GYM_SETUP',
        fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2400 }],
      },
    ];
    render(<ChangeNoticeCard />);
    expect(screen.getByText('Target changed')).toBeTruthy();
    expect(screen.getByText('Calories: 2100 kcal → 2400 kcal')).toBeTruthy();
  });

  it('a SUGGESTED row reads "Suggested change" (AC2) and resolves keep:false on "Use"', () => {
    m.changesData = [
      {
        id: 'c2',
        kind: 'SUGGESTED',
        reason: 'COACH',
        fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2000 }],
      },
    ];
    render(<ChangeNoticeCard />);
    expect(screen.getByText('Suggested change')).toBeTruthy();

    fireEvent.click(screen.getByTestId('change-notice-use-new'));
    expect(m.acknowledge).toHaveBeenCalledWith({ id: 'c2', keep: false });
  });
});

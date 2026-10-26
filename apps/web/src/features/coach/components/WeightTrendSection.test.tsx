// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeightTrendSection } from './WeightTrendSection';

// Lane D1: the weight card shows the trend weight next to the last weigh-in,
// and the change over the range is the trend's, never painted red.

const chart = vi.hoisted(() => ({ data: [] as Record<string, unknown>[] }));

vi.mock('./WeightEntriesList', () => ({ WeightEntriesList: () => null }));
vi.mock('./WeightLogForm', () => ({ WeightLogForm: () => null }));
vi.mock('recharts', () => {
  const Null = () => null;
  return {
    Line: Null,
    LineChart: ({ data }: { data: Record<string, unknown>[] }) => {
      chart.data = data;
      return null;
    },
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: Null,
    XAxis: Null,
    YAxis: Null,
  };
});

const NOW = new Date('2026-10-22T12:00:00Z');
const daysAgo = (n: number, weightKg: number) => ({
  id: `w${n}`,
  weightKg,
  recordedAt: new Date(NOW.getTime() - n * 86_400_000),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('WeightTrendSection', () => {
  // A steady loss with one salty-day spike near the end.
  const entries = [
    daysAgo(60, 84),
    daysAgo(45, 83.4),
    daysAgo(28, 82.6),
    daysAgo(21, 82.2),
    daysAgo(14, 81.9),
    daysAgo(7, 81.5),
    daysAgo(2, 83),
    daysAgo(1, 81.2),
  ];

  it('shows the last weigh-in and the trend weight separately', () => {
    render(<WeightTrendSection entries={entries} range={30} system="METRIC" goal="LOSE_WEIGHT" />);
    expect(screen.getByTestId('progress-weight-current').textContent).toBe('81.2 kg');
    const trend = Number.parseFloat(screen.getByTestId('progress-weight-trend').textContent);
    // The spike barely moves the trend, which sits above the last reading.
    expect(trend).toBeGreaterThan(81.2);
    expect(trend).toBeLessThan(82.6);
  });

  it('charts the weigh-ins in range with the trend warmed up by older ones', () => {
    render(<WeightTrendSection entries={entries} range={30} system="METRIC" goal={null} />);
    expect(chart.data).toHaveLength(6);
    // The first in-range trend value carries memory of the 84 kg reading.
    expect(chart.data[0]).toMatchObject({ weight: 82.6 });
    expect(chart.data[0]?.['trend'] as number).toBeGreaterThan(82.6);
    expect(screen.getByTestId('progress-weight-explainer').textContent).toMatch(/trend weight/);
  });

  it('describes the trend change in words, in the user’s unit', () => {
    render(<WeightTrendSection entries={entries} range={30} system="IMPERIAL" goal={null} />);
    expect(screen.getByTestId('progress-weight-change').textContent).toMatch(
      /^Trend −\d+\.\d lb over 30 days$/,
    );
  });

  it('a change away from the goal is neutral, not red', () => {
    render(<WeightTrendSection entries={entries} range={30} system="METRIC" goal="GAIN_MUSCLE" />);
    const change = screen.getByTestId('progress-weight-change');
    expect(change.className).toContain('text-neutral-600');
    expect(change.className).not.toMatch(/red/);
  });

  it('asks for a second weigh-in when the range holds only one', () => {
    render(<WeightTrendSection entries={[daysAgo(1, 80)]} range={7} system="METRIC" goal={null} />);
    expect(screen.getByTestId('progress-weight-few').textContent).toContain('7 days');
    expect(screen.queryByTestId('progress-weight-trend')).toBeNull();
  });
});

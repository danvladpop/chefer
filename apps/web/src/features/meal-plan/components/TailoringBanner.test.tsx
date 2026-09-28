// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanTailoring } from '@chefer/types';
import { DayView } from './day-view';
import { TailoringBanner } from './TailoringBanner';

vi.mock('@/features/recipes/components/RecipeImage', () => ({
  RecipeImage: () => null,
}));

afterEach(cleanup);

const running: PlanTailoring = {
  status: 'RUNNING',
  tailoredDays: [2, 3, 4],
  totalDays: 7,
  currentDay: 5,
  queuedDays: [5, 6, 0, 1],
  keptDays: [],
  canResume: false,
};

describe('TailoringBanner (live tailoring)', () => {
  it('RUNNING: a calm status line with the day count and a determinate progress bar', () => {
    render(<TailoringBanner tailoring={running} sawRunning />);
    const banner = screen.getByTestId('plan-tailoring-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Your chef is tailoring your week');
    expect(screen.getByTestId('plan-tailoring-count').textContent).toBe(' · 3 of 7 days');
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('43');
    expect(bar.getAttribute('aria-label')).toBe('3 of 7 days tailored');
    expect(screen.queryByTestId('plan-tailoring-resume')).toBeNull();
  });

  it('DONE: a brief confirmation — only after the user watched it run', () => {
    const done: PlanTailoring = { ...running, status: 'DONE', tailoredDays: [0, 1, 2, 3, 4, 5, 6] };
    const { rerender } = render(<TailoringBanner tailoring={done} sawRunning />);
    expect(screen.getByTestId('plan-tailoring-banner').textContent).toContain(
      'Your week is tailored',
    );
    rerender(<TailoringBanner tailoring={done} sawRunning={false} />);
    expect(screen.queryByTestId('plan-tailoring-banner')).toBeNull();
  });

  it('PARTIAL: the honest one-liner and "Tailor the rest"', () => {
    const onResume = vi.fn();
    const partial: PlanTailoring = { ...running, status: 'PARTIAL', canResume: true };
    render(<TailoringBanner tailoring={partial} sawRunning={false} onResume={onResume} />);
    const banner = screen.getByTestId('plan-tailoring-banner');
    expect(banner.textContent).toContain('Tailored 3 of 7 days');
    expect(banner.textContent).toContain('the rest are from our recipe collection.');
    fireEvent.click(screen.getByTestId('plan-tailoring-resume'));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it('PARTIAL without an allowed resume shows no action', () => {
    const partial: PlanTailoring = { ...running, status: 'PARTIAL', canResume: false };
    render(<TailoringBanner tailoring={partial} sawRunning onResume={vi.fn()} />);
    expect(screen.queryByTestId('plan-tailoring-resume')).toBeNull();
  });

  it('FAILED: says the chef is busy and offers a retry', () => {
    const failed: PlanTailoring = {
      ...running,
      status: 'FAILED',
      tailoredDays: [],
      canResume: true,
    };
    render(<TailoringBanner tailoring={failed} sawRunning onResume={vi.fn()} />);
    expect(screen.getByTestId('plan-tailoring-banner').textContent).toContain(
      'Your chef is busy right now',
    );
    expect(screen.getByTestId('plan-tailoring-resume').textContent).toBe('Try tailoring again');
  });

  it('renders nothing without a job (free plans, older plans)', () => {
    render(<TailoringBanner tailoring={null} sawRunning />);
    expect(screen.queryByTestId('plan-tailoring-banner')).toBeNull();
  });
});

describe('DayView — per-day tailoring markers', () => {
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, meals: [] }));

  it('marks tailored ✓ / in progress / waiting days, with screen-reader labels', () => {
    render(
      <DayView
        days={days}
        planId="p1"
        selectedDay={2}
        onSelectDay={() => undefined}
        tailoring={running}
      />,
    );
    const chip = (name: RegExp) => screen.getByRole('tab', { name });
    expect(chip(/^Wednesday/).getAttribute('data-tailoring')).toBe('tailored');
    expect(chip(/^Wednesday, tailored by your chef$/)).toBeTruthy();
    expect(chip(/^Saturday, being tailored now$/).getAttribute('data-tailoring')).toBe('tailoring');
    expect(chip(/^Sunday, waiting to be tailored$/).getAttribute('data-tailoring')).toBe('waiting');
    expect(screen.getAllByTestId('tailor-mark-tailored')).toHaveLength(3);
    expect(screen.getAllByTestId('tailor-mark-tailoring')).toHaveLength(1);
  });

  it('a just-replaced day says so', () => {
    render(
      <DayView
        days={days.map((d) =>
          d.dayOfWeek === 2
            ? {
                ...d,
                meals: [
                  {
                    type: 'dinner',
                    recipe: {
                      id: 'r1',
                      name: 'Miso Salmon',
                      description: '',
                      cuisineType: 'japanese',
                      prepTimeMins: 10,
                      cookTimeMins: 10,
                      nutritionInfo: { calories: 600, protein: 40, carbs: 40, fat: 20, fiber: 4 },
                    },
                  },
                ],
              }
            : d,
        )}
        planId="p1"
        selectedDay={2}
        onSelectDay={() => undefined}
        tailoring={running}
        updatedDays={new Set([2])}
      />,
    );
    expect(screen.getByTestId('plan-day-updated').textContent).toBe('updated by your chef');
  });
});

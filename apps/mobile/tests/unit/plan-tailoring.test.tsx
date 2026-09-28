import { act, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import type { PlanTailoring } from '@chefer/types';
import { TailoringBanner, TailoringDayMark } from '../../src/features/meal-plan/tailoring-banner';
import { useTailoringWatch } from '../../src/features/meal-plan/use-tailoring-watch';

// Premium "instant week, then the chef tailors it live": the Plan tab's
// banner states, the day-chip markers and the watcher that drives the
// "updated by your chef" fade + DONE confirmation.

const running: PlanTailoring = {
  status: 'RUNNING',
  tailoredDays: [0, 1, 2],
  totalDays: 7,
  currentDay: 3,
  queuedDays: [3, 4, 5, 6],
  keptDays: [],
  canResume: false,
};

describe('TailoringBanner', () => {
  it('RUNNING: "Your chef is tailoring your week · 3 of 7 days" with a progress bar', async () => {
    await render(<TailoringBanner tailoring={running} sawRunning />);
    expect(screen.getByTestId('plan-tailoring-title')).toHaveTextContent(
      'Your chef is tailoring your week · 3 of 7 days',
    );
    expect(screen.getByLabelText('3 of 7 days tailored')).toBeTruthy();
    expect(screen.queryByTestId('plan-tailoring-resume')).toBeNull();
  });

  it('DONE: confirms only after the user watched it run', async () => {
    const done: PlanTailoring = { ...running, status: 'DONE', tailoredDays: [0, 1, 2, 3, 4, 5, 6] };
    await render(<TailoringBanner tailoring={done} sawRunning />);
    expect(screen.getByTestId('plan-tailoring-title')).toHaveTextContent('Your week is tailored');
    await render(<TailoringBanner tailoring={done} sawRunning={false} />);
    expect(screen.queryByTestId('plan-tailoring-banner')).toBeNull();
  });

  it('PARTIAL: honest one-liner + "Tailor the rest"', async () => {
    const onResume = jest.fn();
    const partial: PlanTailoring = { ...running, status: 'PARTIAL', canResume: true };
    await render(<TailoringBanner tailoring={partial} sawRunning={false} onResume={onResume} />);
    expect(screen.getByTestId('plan-tailoring-title')).toHaveTextContent('Tailored 3 of 7 days');
    expect(screen.getByText('the rest are from our recipe collection.')).toBeTruthy();
    await userEvent.press(screen.getByTestId('plan-tailoring-resume'));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('no action when resuming is not allowed; nothing without a job', async () => {
    await render(
      <TailoringBanner
        tailoring={{ ...running, status: 'FAILED', canResume: false }}
        sawRunning
        onResume={jest.fn()}
      />,
    );
    expect(screen.getByTestId('plan-tailoring-title')).toHaveTextContent(
      'Your chef is busy right now',
    );
    expect(screen.queryByTestId('plan-tailoring-resume')).toBeNull();
    await render(<TailoringBanner tailoring={null} sawRunning />);
    expect(screen.queryByTestId('plan-tailoring-banner')).toBeNull();
  });
});

describe('TailoringDayMark', () => {
  it('✓ tailored, a dot while tailoring, a ring while waiting, nothing otherwise', async () => {
    await render(<TailoringDayMark state="tailored" selected={false} />);
    expect(screen.getByTestId('tailor-mark-tailored')).toBeTruthy();
    await render(<TailoringDayMark state="tailoring" selected />);
    expect(screen.getByTestId('tailor-mark-tailoring')).toBeTruthy();
    await render(<TailoringDayMark state="waiting" selected={false} />);
    expect(screen.getByTestId('tailor-mark-waiting')).toBeTruthy();
    await render(<TailoringDayMark state="collection" selected={false} />);
    expect(screen.queryByTestId(/tailor-mark/)).toBeNull();
  });
});

describe('useTailoringWatch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('flags days replaced between polls (then clears them) and notifies once per change', async () => {
    const onUpdated = jest.fn();
    const { result, rerender } = await renderHook(
      ({ t }: { t: PlanTailoring }) => useTailoringWatch('plan1', t, onUpdated),
      { initialProps: { t: running } },
    );
    // First load never highlights the whole week.
    expect(result.current.updatedDays.size).toBe(0);
    expect(result.current.sawRunning).toBe(true);

    await rerender({ t: { ...running, tailoredDays: [0, 1, 2, 3], currentDay: 4 } });
    expect([...result.current.updatedDays]).toEqual([3]);
    expect(onUpdated).toHaveBeenCalledWith([3]);

    await act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(result.current.updatedDays.size).toBe(0);
  });

  it('DONE after watching it run is confirmed, then steps aside', async () => {
    const { result, rerender } = await renderHook(
      ({ t }: { t: PlanTailoring }) => useTailoringWatch('plan1', t),
      { initialProps: { t: running } },
    );
    await rerender({ t: { ...running, status: 'DONE', tailoredDays: [0, 1, 2, 3, 4, 5, 6] } });
    expect(result.current.sawRunning).toBe(true);
    await act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(result.current.sawRunning).toBe(false);
  });

  it('a new plan (regenerate) resets the watch', async () => {
    const { result, rerender } = await renderHook(
      ({ id, t }: { id: string; t: PlanTailoring }) => useTailoringWatch(id, t),
      { initialProps: { id: 'plan1', t: running } },
    );
    await rerender({ id: 'plan2', t: { ...running, tailoredDays: [0, 1, 2, 3, 4] } });
    expect(result.current.updatedDays.size).toBe(0);
  });
});

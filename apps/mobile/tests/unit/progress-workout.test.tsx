import { Pressable } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  LIVE_PR_BANNER_MS,
  LivePrBanner,
  useLivePrBanner,
} from '../../src/features/progress/live-pr-banner';
import { WorkoutReceipt } from '../../src/features/progress/workout-receipt';
import { renderWithTrpc } from './friends-core-harness';
import {
  progressOnHandlers,
  receiptFixture,
  summaryFixture,
  turnShellV2Off,
  turnShellV2On,
} from './progress-fixtures';

// Mockup 03: the live PR banner (3 s, never blocks) and the workout summary's
// receipt (nothing until the workout has synced).

type ReducedMotionGlobal = typeof globalThis & { __REDUCED_MOTION__?: boolean };

function Harness() {
  const { banner, show } = useLivePrBanner();
  return (
    <>
      <Pressable testID="pr" onPress={() => show('New best · Bench press 80 kg × 5')} />
      <Pressable testID="pr2" onPress={() => show('New best · Squat 100 kg × 3')} />
      <LivePrBanner banner={banner} bottom={80} />
    </>
  );
}

describe('live PR banner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = true;
  });
  afterEach(() => {
    jest.useRealTimers();
    (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = false;
  });

  it('says the new best for three seconds, then goes', async () => {
    await render(<Harness />);
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
    await fireEvent.press(screen.getByTestId('pr'));
    expect(screen.getByTestId('live-pr-banner')).toHaveTextContent(
      /New best · Bench press 80 kg × 5/,
    );
    await act(() => {
      jest.advanceTimersByTime(LIVE_PR_BANNER_MS - 1);
    });
    expect(screen.getByTestId('live-pr-banner')).toBeTruthy();
    await act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
  });

  it('a second PR replaces the first and restarts the clock', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('pr'));
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    await fireEvent.press(screen.getByTestId('pr2'));
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('live-pr-banner')).toHaveTextContent(/Squat 100 kg × 3/);
    await act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(screen.queryByTestId('live-pr-banner')).toBeNull();
  });

  it('never takes a touch', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('pr'));
    expect(screen.getByTestId('live-pr-banner').parent?.parent?.props.pointerEvents).toBe('none');
  });
});

describe('workout receipt', () => {
  beforeEach(() => {
    turnShellV2On();
    (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = true;
  });
  afterAll(() => {
    turnShellV2Off();
    (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = false;
  });

  it('shows what the workout earned once it has synced', async () => {
    const receipt = receiptFixture({
      kind: 'WORKOUT_COMPLETED',
      xp: 120,
      lines: [
        { code: 'WORKOUT_DONE', xp: 40 },
        { code: 'PR_WEIGHT', xp: 20, detail: 'Bench press' },
        { code: 'WEEK_GOAL', xp: 60 },
      ],
    });
    const { calls } = await renderWithTrpc(
      <WorkoutReceipt id="session-1" />,
      progressOnHandlers(summaryFixture(), { 'progress.receiptFor': () => receipt }),
    );
    expect(await screen.findByTestId('workout-receipt')).toBeTruthy();
    expect(screen.getByText('Heaviest set yet · Bench press')).toBeTruthy();
    expect(screen.getByTestId('workout-receipt-total')).toHaveTextContent('+120 XP');
    expect(calls.find((c) => c.path === 'progress.receiptFor')?.input).toEqual({
      kind: 'WORKOUT',
      sourceId: 'session-1',
    });
  });

  it('shows nothing while the receipt is not there yet (not synced)', async () => {
    const { paths } = await renderWithTrpc(
      <WorkoutReceipt id="session-1" />,
      progressOnHandlers(summaryFixture(), { 'progress.receiptFor': () => null }),
    );
    await waitFor(() => expect(paths()).toContain('progress.receiptFor'));
    expect(screen.queryByTestId('workout-receipt')).toBeNull();
  });

  it('asks for nothing with Kitchen progress off', async () => {
    const { paths } = await renderWithTrpc(<WorkoutReceipt id="session-1" />, {
      ...progressOnHandlers(),
      'profile.flags': () => ({ gamification: false }),
    });
    await waitFor(() => expect(paths()).toContain('profile.flags'));
    expect(paths().filter((p) => p.startsWith('progress.'))).toEqual([]);
  });
});

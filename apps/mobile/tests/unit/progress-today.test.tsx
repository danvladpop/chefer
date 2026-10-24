import { View } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import { ProgressTodayTop } from '../../src/features/progress/today-cards';
import { TodaysThreeCard } from '../../src/features/progress/todays-three-card';
import { renderWithTrpc } from './friends-core-harness';
import {
  progressOnHandlers,
  summaryFixture,
  TODAY,
  turnShellV2Off,
  turnShellV2On,
} from './progress-fixtures';

// Kitchen progress on Today (mockup 01): the strip, Today's three, the intro /
// recap / support cards, and the gate that keeps all of it (and every
// progress.* call) away when the feature is off.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
}));
const { router } = jest.requireMock<{ router: { push: jest.Mock; navigate: jest.Mock } }>(
  'expo-router',
);

function Screen() {
  return (
    <View>
      <ProgressTodayTop />
      <TodaysThreeCard />
    </View>
  );
}

beforeEach(() => {
  router.push.mockClear();
  router.navigate.mockClear();
  turnShellV2On();
});
afterAll(() => turnShellV2Off());

describe('the strip and Today’s three', () => {
  it('render from the summary (mockup 01)', async () => {
    await renderWithTrpc(<Screen />, progressOnHandlers());
    await screen.findByTestId('progress-strip');

    expect(screen.getByTestId('progress-strip-level')).toHaveTextContent('7');
    expect(screen.getByTestId('progress-strip-rank')).toHaveTextContent('Line Cook');
    expect(screen.getByTestId('progress-strip-xp')).toHaveTextContent(
      '340 / 500 XP to Chef de Partie',
    );
    expect(screen.getByTestId('progress-strip-flame')).toHaveTextContent(/6 wk/);
    expect(screen.getByTestId('progress-strip-active-days')).toHaveTextContent(/2 of 3/);
    // Mon, Tue active; Wed a rest day; Thu is today; the rest is still to come.
    expect(screen.getByLabelText('Mon, active day')).toBeTruthy();
    expect(screen.getByLabelText('Wed, rest day')).toBeTruthy();
    expect(screen.getByLabelText('Thu, today')).toBeTruthy();
    expect(screen.getByLabelText('Fri, later this week')).toBeTruthy();

    expect(await screen.findByTestId('todays-three')).toBeTruthy();
    expect(screen.getByText('Log breakfast')).toBeTruthy();
    expect(screen.getByText('Lemon Herb Salmon', { exact: false })).toBeTruthy();
    expect(screen.getByText('62 g so far', { exact: false })).toBeTruthy();
    expect(screen.getByTestId('todays-three-bonus')).toHaveTextContent('+40 XP bonus');
    expect(screen.getByTestId('todays-three-footer')).toHaveTextContent(
      'Finish all three for a bonus.',
    );
  });

  it('is hidden entirely by "Show my flame on Today"', async () => {
    const { paths } = await renderWithTrpc(
      <Screen />,
      progressOnHandlers(
        summaryFixture({ settings: { ...DEFAULT_PROGRESS_SETTINGS, showFlameOnToday: false } }),
      ),
    );
    await screen.findByTestId('todays-three');
    expect(paths()).toContain('progress.summary');
    expect(screen.queryByTestId('progress-strip')).toBeNull();
  });

  it('keeps only the flame row when "Show XP & levels" is off, and hides Today’s three', async () => {
    await renderWithTrpc(
      <Screen />,
      progressOnHandlers(
        summaryFixture({ settings: { ...DEFAULT_PROGRESS_SETTINGS, showXp: false } }),
      ),
    );
    await screen.findByTestId('progress-strip');
    expect(screen.queryByTestId('progress-strip-ring')).toBeNull();
    expect(screen.queryByTestId('progress-strip-xp')).toBeNull();
    expect(screen.getByTestId('progress-strip-flame')).toHaveTextContent(/6 weeks/);
    expect(screen.getByTestId('progress-strip-days')).toBeTruthy();
    expect(screen.queryByTestId('todays-three')).toBeNull();
  });

  it('shows nothing and makes no progress.* call with the flag off', async () => {
    const { paths } = await renderWithTrpc(<Screen />, {
      ...progressOnHandlers(),
      'profile.flags': () => ({ gamification: false }),
    });
    await waitFor(() => expect(paths()).toContain('profile.flags'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(paths().filter((p) => p.startsWith('progress.'))).toEqual([]);
    expect(screen.queryByTestId('progress-strip')).toBeNull();
    expect(screen.queryByTestId('todays-three')).toBeNull();
  });

  it('shows nothing and makes no progress.* call on the old shell', async () => {
    turnShellV2Off();
    const { paths } = await renderWithTrpc(<Screen />, progressOnHandlers());
    await waitFor(() => expect(paths()).toContain('profile.flags'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(paths().filter((p) => p.startsWith('progress.'))).toEqual([]);
    expect(screen.queryByTestId('progress-strip')).toBeNull();
  });

  it('stays hidden when the server says Kitchen progress is not available to this user', async () => {
    const { paths } = await renderWithTrpc(<Screen />, {
      ...progressOnHandlers(),
      'progress.availability': () => ({ enabled: false }),
    });
    await waitFor(() => expect(paths()).toContain('progress.availability'));
    expect(paths()).not.toContain('progress.summary');
    expect(screen.queryByTestId('progress-strip')).toBeNull();
  });

  it('opens a quest where it can be done', async () => {
    await renderWithTrpc(<Screen />, progressOnHandlers());
    await fireEvent.press(await screen.findByTestId('todays-three-COOK:dinner'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/cook/[id]',
      params: { id: 'salmon', meal: 'dinner' },
    });
    await fireEvent.press(screen.getByTestId('todays-three-PROTEIN'));
    expect(router.push).toHaveBeenLastCalledWith('/tracker');
    // A done quest is not a button.
    await fireEvent.press(screen.getByTestId('todays-three-LOG_SLOT:breakfast'));
    expect(router.push).toHaveBeenCalledTimes(2);
  });

  it('drops the protein quest while the low-intake guard is on, and shows the calm card', async () => {
    await renderWithTrpc(<Screen />, progressOnHandlers(summaryFixture({ quiet: true })));
    expect(await screen.findByTestId('progress-quiet')).toBeTruthy();
    expect(screen.getByText('We’re here for the whole you')).toBeTruthy();
    expect(screen.queryByTestId('todays-three-PROTEIN')).toBeNull();
    expect(screen.getByTestId('todays-three-COOK:dinner')).toBeTruthy();
  });

  it('shows the welcome card once and marks it seen', async () => {
    const markSeen = jest.fn(() => ({}));
    await renderWithTrpc(
      <Screen />,
      progressOnHandlers(summaryFixture({ intro: { backdatedXp: 1240, badges: 6 } }), {
        'progress.markSeen': markSeen,
      }),
    );
    const intro = await screen.findByTestId('progress-intro');
    expect(within(intro).getByText('Welcome to the kitchen')).toBeTruthy();
    expect(screen.getByTestId('progress-intro-earned')).toHaveTextContent(/1,240 XP and 6 badges/);
    await fireEvent.press(screen.getByTestId('progress-intro-cta'));
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith({ intro: true }));
  });

  it('offers a waiting recap', async () => {
    await renderWithTrpc(
      <Screen />,
      progressOnHandlers(summaryFixture({ recap: { weekStart: '2026-10-13' } })),
    );
    await fireEvent.press(await screen.findByTestId('progress-recap-open'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/kitchen-recap/[week]',
      params: { week: '2026-10-13' },
    });
  });
});

describe('the Flame sheet', () => {
  it('opens from the strip with the best, the milestones and the goal', async () => {
    await renderWithTrpc(<Screen />, progressOnHandlers());
    await fireEvent.press(await screen.findByTestId('progress-strip'));
    expect(await screen.findByTestId('flame-count')).toHaveTextContent(/6 weeks/);
    expect(screen.getByText('Your cooking flame. Best: 9 weeks.')).toBeTruthy();
    expect(screen.getByText('Pilot lights: 2')).toBeTruthy();
    expect(screen.getByLabelText('12 weeks, next')).toBeTruthy();
    expect(screen.getByLabelText('8 weeks, reached')).toBeTruthy();
    expect(screen.getByText('Change weekly goal (3 days)')).toBeTruthy();
    // Never a "you lost it" line, never a training row without a gym profile.
    expect(screen.queryByTestId('flame-training')).toBeNull();
  });

  it('shows the training streak when there is one', async () => {
    const base = summaryFixture();
    await renderWithTrpc(
      <Screen />,
      progressOnHandlers(
        summaryFixture({ flame: { ...base.flame, training: { current: 7, best: 12 } } }),
      ),
    );
    await fireEvent.press(await screen.findByTestId('progress-strip'));
    expect(await screen.findByTestId('flame-training')).toHaveTextContent(/Training streak/);
  });

  it('changing the weekly goal calls setActiveDayGoal', async () => {
    const setGoal = jest.fn(() => ({}));
    await renderWithTrpc(
      <Screen />,
      progressOnHandlers(summaryFixture(), { 'progress.setActiveDayGoal': setGoal }),
    );
    await fireEvent.press(await screen.findByTestId('progress-strip'));
    await fireEvent.press(await screen.findByTestId('flame-change-goal'));
    await fireEvent.press(await screen.findByText('5 days'));
    await waitFor(() => expect(setGoal).toHaveBeenCalledWith({ goal: 5, localDate: TODAY }));
  });

  it('pauses the flame for the chosen number of weeks, and resumes it', async () => {
    const pause = jest.fn(() => ({}));
    const resume = jest.fn(() => ({}));
    const { rerender } = await renderWithTrpc(
      <Screen />,
      progressOnHandlers(summaryFixture(), {
        'progress.pauseFlame': pause,
        'progress.resumeFlame': resume,
      }),
    );
    await fireEvent.press(await screen.findByTestId('progress-strip'));
    await fireEvent.press(await screen.findByTestId('flame-pause-pause'));
    await fireEvent.press(await screen.findByText('2 weeks'));
    await waitFor(() => expect(pause).toHaveBeenCalledWith({ startDate: TODAY, weeks: 2 }));
    expect(rerender).toBeDefined();
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import { AchievementsScreen } from '../../src/features/progress/achievements-screen';
import { ChefCard } from '../../src/features/progress/chef-card';
import { RewardsSettingsScreen } from '../../src/features/progress/rewards-settings-screen';
import { WeeklyRecapScreen } from '../../src/features/progress/weekly-recap-screen';
import { renderWithTrpc } from './friends-core-harness';
import {
  achievementsFixture,
  progressOnHandlers,
  recapFixture,
  summaryFixture,
  turnShellV2Off,
  turnShellV2On,
} from './progress-fixtures';

// Achievements (06), the Chef card (09), the weekly recap (10) and Rewards &
// motivation (12).

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  },
}));
const { router } = jest.requireMock<{
  router: { push: jest.Mock; navigate: jest.Mock; back: jest.Mock };
}>('expo-router');

const mockEnsurePermission = jest.fn();
jest.mock('../../src/features/gym/reminders/permission', () => ({
  ensureGymReminderPermission: () => mockEnsurePermission() as Promise<boolean>,
  hasGymReminderPermission: () => Promise.resolve(true),
}));
jest.mock('../../src/lib/use-notification-permission', () => ({
  useNotificationPermission: () => 'granted',
  refreshNotificationPermission: jest.fn(),
}));

type ReducedMotionGlobal = typeof globalThis & { __REDUCED_MOTION__?: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsurePermission.mockResolvedValue(true);
  turnShellV2On();
  (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = true;
});
afterAll(() => {
  turnShellV2Off();
  (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = false;
});

describe('Achievements', () => {
  const handlers = (extra = {}) =>
    progressOnHandlers(summaryFixture(), {
      'progress.achievements': () => achievementsFixture(),
      'progress.markSeen': () => ({}),
      ...extra,
    });

  it('shows the count, the closest next and a grid per group, and marks the shelf seen', async () => {
    const markSeen = jest.fn(() => ({}));
    await renderWithTrpc(<AchievementsScreen />, handlers({ 'progress.markSeen': markSeen }));
    expect(await screen.findByTestId('achievements-count')).toHaveTextContent('23 / 64');
    expect(screen.getByTestId('achievements-closest')).toBeTruthy();
    expect(screen.getByText(/PR Machine — Set 5 personal records/)).toBeTruthy();
    expect(screen.getByText('3 to go')).toBeTruthy();
    expect(screen.getByTestId('achievements-group-KITCHEN')).toBeTruthy();
    expect(screen.getByTestId('achievements-group-GYM')).toBeTruthy();
    // A tier-2 badge says its numeral and that it is new; a tier-0 one is just grey.
    expect(screen.getByLabelText('Home Chef II, New')).toBeTruthy();
    expect(screen.getByTestId('achievement-HOME_CHEF-tier')).toHaveTextContent('II');
    expect(screen.getByLabelText('PR Machine, Not earned yet')).toBeTruthy();
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith({ achievements: true }));
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it('filters by group', async () => {
    await renderWithTrpc(<AchievementsScreen />, handlers());
    await fireEvent.press(await screen.findByTestId('achievements-filter-GYM'));
    expect(screen.queryByTestId('achievements-group-KITCHEN')).toBeNull();
    expect(screen.getByTestId('achievements-group-GYM')).toBeTruthy();
    expect(screen.queryByTestId('achievements-closest')).toBeNull();
    await fireEvent.press(screen.getByTestId('achievements-filter-all'));
    expect(screen.getByTestId('achievements-group-KITCHEN')).toBeTruthy();
  });

  it('opens a badge with what the next tier asks and how far along you are', async () => {
    await renderWithTrpc(<AchievementsScreen />, handlers());
    await fireEvent.press(await screen.findByTestId('achievement-HOME_CHEF'));
    expect(await screen.findByTestId('achievement-detail-tier')).toHaveTextContent('Tier II');
    expect(screen.getByText('Cook 50 meals in cook mode')).toBeTruthy();
    expect(screen.getByTestId('achievement-detail-progress')).toHaveTextContent('37 / 50');
  });

  it('says so, and offers a retry, when the shelf cannot load', async () => {
    await renderWithTrpc(
      <AchievementsScreen />,
      handlers({
        'progress.achievements': () => {
          throw new Error('offline');
        },
      }),
    );
    expect(await screen.findByTestId('achievements-error')).toBeTruthy();
  });

  it('is unavailable with the feature off, and calls no progress procedure', async () => {
    const { paths } = await renderWithTrpc(<AchievementsScreen />, {
      ...handlers(),
      'profile.flags': () => ({ gamification: false }),
    });
    expect(await screen.findByTestId('achievements-unavailable')).toBeTruthy();
    expect(paths().filter((p) => p.startsWith('progress.'))).toEqual([]);
  });
});

describe('ChefCard', () => {
  it('shows the level, the rank, the flame and the badge count, and opens Achievements', async () => {
    await renderWithTrpc(
      <ChefCard />,
      progressOnHandlers(summaryFixture(), {
        'progress.achievements': () => achievementsFixture(),
      }),
    );
    await screen.findByTestId('chef-card');
    expect(screen.getByTestId('chef-card-rank')).toHaveTextContent(/Line Cook/);
    expect(screen.getByTestId('chef-card-rank')).toHaveTextContent(/Lv 7/);
    expect(screen.getByTestId('chef-card-flame')).toHaveTextContent(/6-week flame/);
    await waitFor(() =>
      expect(screen.getByTestId('chef-card-badges')).toHaveTextContent(/23 of 64/),
    );
    await fireEvent.press(screen.getByTestId('chef-card'));
    expect(router.push).toHaveBeenCalledWith('/achievements');
  });

  it('is hidden when "Show XP & levels" is off', async () => {
    const { paths } = await renderWithTrpc(
      <ChefCard />,
      progressOnHandlers(
        summaryFixture({ settings: { ...DEFAULT_PROGRESS_SETTINGS, showXp: false } }),
      ),
    );
    await waitFor(() => expect(paths()).toContain('progress.summary'));
    expect(screen.queryByTestId('chef-card')).toBeNull();
    expect(paths()).not.toContain('progress.achievements');
  });
});

describe('Weekly recap', () => {
  const handlers = (summary = summaryFixture(), recap = recapFixture(), extra = {}) =>
    progressOnHandlers(summary, {
      'progress.weeklyRecap': () => recap,
      'progress.markSeen': () => ({}),
      ...extra,
    });

  it('tells the week as a story: tiles, dish, flame and XP, Biscuit; tap to move on', async () => {
    const markSeen = jest.fn(() => ({}));
    await renderWithTrpc(
      <WeeklyRecapScreen week="2026-10-13" />,
      handlers(undefined, undefined, { 'progress.markSeen': markSeen }),
    );
    expect(await screen.findByTestId('recap-headline')).toBeTruthy();
    expect(screen.getByTestId('recap-tile-cooked')).toHaveTextContent(/9/);
    expect(screen.getByTestId('recap-tile-workouts')).toHaveTextContent(/workouts · goal met/);
    expect(screen.getByTestId('recap-tile-prs')).toHaveTextContent(/2/);
    expect(screen.getByTestId('recap-tile-recipes')).toHaveTextContent(/4/);
    expect(screen.getByTestId('recap-segments')).toBeTruthy();
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith({ recapWeek: '2026-10-13' }));

    await fireEvent.press(screen.getByTestId('recap-next'));
    expect(screen.getByTestId('recap-dish')).toBeTruthy();
    expect(screen.getByText(/You rated it ★★★★★ — cooked twice/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('recap-next'));
    expect(screen.getByTestId('recap-flame')).toHaveTextContent(/5 → 6 weeks/);
    expect(screen.getByTestId('recap-xp')).toHaveTextContent(/\+640 · Lv 6 → 7/);
    expect(screen.getByTestId('recap-biscuit')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('recap-prev'));
    expect(screen.getByTestId('recap-dish')).toBeTruthy();
  });

  it('Plan next week goes to Meals; the close button leaves', async () => {
    await renderWithTrpc(<WeeklyRecapScreen week="2026-10-13" />, handlers());
    await fireEvent.press(await screen.findByTestId('recap-plan-next'));
    expect(router.navigate).toHaveBeenCalledWith('/plan');
    await fireEvent.press(screen.getByTestId('recap-close'));
    expect(router.back).toHaveBeenCalled();
  });

  it('leaves out an empty tile, and Biscuit when he is off', async () => {
    await renderWithTrpc(
      <WeeklyRecapScreen week="2026-10-13" />,
      handlers(
        summaryFixture({
          settings: { ...DEFAULT_PROGRESS_SETTINGS, biscuit: false, showXp: false },
        }),
        recapFixture({ prs: 0, dishOfWeek: null }),
      ),
    );
    await screen.findByTestId('recap-headline');
    expect(screen.queryByTestId('recap-tile-prs')).toBeNull();
    await fireEvent.press(screen.getByTestId('recap-next'));
    expect(screen.queryByTestId('recap-dish')).toBeNull();
    expect(screen.getByTestId('recap-flame')).toBeTruthy();
    expect(screen.queryByTestId('recap-xp')).toBeNull();
    expect(screen.queryByTestId('recap-biscuit')).toBeNull();
  });
});

describe('Rewards & motivation', () => {
  it('writes each setting as a patch', async () => {
    const update = jest.fn((patch: unknown) => patch);
    await renderWithTrpc(
      <RewardsSettingsScreen />,
      progressOnHandlers(summaryFixture(), { 'progress.updateSettings': update }),
    );
    await fireEvent.press(await screen.findByTestId('rewards-celebrations-subtle'));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ celebrations: 'SUBTLE' }));
    await fireEvent(screen.getByTestId('rewards-show-xp'), 'valueChange', false);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ showXp: false }));
    await fireEvent(screen.getByTestId('rewards-biscuit'), 'valueChange', false);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ biscuit: false }));
    await fireEvent(screen.getByTestId('rewards-flame-on-today'), 'valueChange', false);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ showFlameOnToday: false }));
  });

  it('shows the goal and changes it', async () => {
    const setGoal = jest.fn(() => ({}));
    await renderWithTrpc(
      <RewardsSettingsScreen />,
      progressOnHandlers(summaryFixture(), { 'progress.setActiveDayGoal': setGoal }),
    );
    await fireEvent.press(await screen.findByTestId('rewards-goal'));
    await fireEvent.press(await screen.findByText('4 days'));
    await waitFor(() => expect(setGoal).toHaveBeenCalledWith(expect.objectContaining({ goal: 4 })));
  });

  it('switching the reminder on asks for permission first, and only then saves', async () => {
    const update = jest.fn(() => ({}));
    await renderWithTrpc(
      <RewardsSettingsScreen />,
      progressOnHandlers(summaryFixture(), { 'progress.updateSettings': update }),
    );
    await fireEvent(await screen.findByTestId('rewards-reminder-switch'), 'valueChange', true);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ reminder: { enabled: true } }));
    expect(mockEnsurePermission).toHaveBeenCalledTimes(1);
  });

  it('a refused permission saves nothing', async () => {
    mockEnsurePermission.mockResolvedValue(false);
    const update = jest.fn(() => ({}));
    await renderWithTrpc(
      <RewardsSettingsScreen />,
      progressOnHandlers(summaryFixture(), { 'progress.updateSettings': update }),
    );
    await fireEvent(await screen.findByTestId('rewards-reminder-switch'), 'valueChange', true);
    await waitFor(() => expect(mockEnsurePermission).toHaveBeenCalled());
    expect(update).not.toHaveBeenCalled();
    expect(await screen.findByTestId('rewards-reminder-off')).toBeTruthy();
  });

  it('shows the reminder time once it is on, and a pause card', async () => {
    const base = summaryFixture();
    await renderWithTrpc(
      <RewardsSettingsScreen />,
      progressOnHandlers(
        summaryFixture({
          settings: { ...base.settings, reminder: { enabled: true, time: '19:30' } },
        }),
      ),
    );
    expect(await screen.findByTestId('rewards-reminder-time')).toHaveTextContent(/19:30/);
    expect(screen.getByTestId('rewards-pause')).toBeTruthy();
    expect(screen.getByText('Off still saves your XP and badges, just quietly.')).toBeTruthy();
  });
});

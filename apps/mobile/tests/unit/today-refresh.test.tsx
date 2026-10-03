import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../../app/(food)/index';
import { renderWithTrpc } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-FOOD-13: the pull-to-refresh spinner follows a user pull only. A focus
// refetch (coming back from the tracker) used to leave it spinning, with the
// list pulled down.
// UX-FOOD-23: when the hour changes the query key changes; Today keeps the
// previous dashboard on screen instead of a full-screen spinner.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    Link: ({ children }: { children: React.ReactNode }) => children,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ enabled: true, isPremium: true }),
}));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/features/gym/today/todays-workout-card', () => ({
  TodaysWorkoutCard: () => null,
}));
jest.mock('../../src/features/coach/chef-review-banner', () => ({ ChefReviewBanner: () => null }));
jest.mock('../../src/features/safety/migration-card', () => ({ MigrationCard: () => null }));
jest.mock('../../src/features/privacy/health-consent-notice', () => ({
  HealthConsentTodayNotice: () => null,
}));
jest.mock('../../src/features/tracker/quick-add-sheet', () => ({ QuickAddSheet: () => null }));

const summary = (date: string) => ({
  today: { date, dayOfWeek: 2 },
  weekPlan: [],
  weekGlance: undefined,
  weekReady: null,
  showNutrition: false,
  nutrition: undefined,
  tonight: null,
  tomorrow: null,
  nextMeal: null,
  restOfToday: [],
  recentFavourites: [],
  shopDue: null,
});

type Refresh = { refreshControl: { props: { refreshing: boolean; onRefresh: () => void } } };
const refresh = () => (screen.getByTestId('today-scroll').props as Refresh).refreshControl.props;

const never = () => new Promise<never>(() => undefined);

describe('Today: pull to refresh (UX-FOOD-13)', () => {
  it('a focus refetch does not spin the pull-to-refresh; a pull does, and stops', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const { queryClient } = await renderWithTrpc(
      <HomeScreen />,
      {
        'dashboard.summary': () => {
          calls += 1;
          if (calls === 1) return summary('Tuesday 1 Sep');
          // Later calls are held open so "refetching" is observable.
          return new Promise((resolve) => {
            release = () => resolve(summary('Tuesday 1 Sep'));
          });
        },
      },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('home-title')).toBeOnTheScreen());

    // The focus effect (and any other refetch) is in flight: nothing spins.
    await act(async () => {
      void queryClient.refetchQueries();
    });
    expect(queryClient.isFetching()).toBeGreaterThan(0);
    expect(refresh().refreshing).toBe(false);

    // A user pull does spin it, until the refetch settles.
    await act(async () => {
      refresh().onRefresh();
    });
    expect(refresh().refreshing).toBe(true);
    await act(async () => {
      release?.();
    });
    await waitFor(() => expect(refresh().refreshing).toBe(false));
  });
});

describe('Today: the hour changes (UX-FOOD-23)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps the dashboard on screen while the new hour loads', async () => {
    const hours = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);
    const user = userEvent.setup();
    let calls = 0;
    await renderWithTrpc(
      <HomeScreen />,
      {
        'dashboard.summary': () => {
          calls += 1;
          return calls === 1 ? summary('Tuesday 1 Sep') : never();
        },
      },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('home-title')).toBeOnTheScreen());

    // The clock rolls over to 10:00 and the screen re-renders (any state change does).
    hours.mockReturnValue(10);
    await user.press(screen.getByTestId('today-quick-add'));
    await waitFor(() => expect(calls).toBeGreaterThan(1));

    expect(screen.getByTestId('home-title')).toBeOnTheScreen();
    expect(screen.queryByTestId('today-load-error')).toBeNull();
  });
});

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { WeeklyRecapDto } from '@chefer/types';
import { RecapTodayCard } from '../../src/features/recap/recap-today-card';
import { WeeklyRecapScreen } from '../../src/features/recap/weekly-recap-screen';

// Lane E2: "Your week in review" shows only what happened, a quiet week says
// so kindly, and the share card's contents are the user's pick.

const RECAP: WeeklyRecapDto = {
  weekStart: '2026-10-12',
  label: '12–18 Oct',
  food: {
    plannedMeals: 14,
    cookedFromPlan: 9,
    newRecipesTried: 2,
    newRecipes: [
      { id: 'a', name: 'Lemon pasta' },
      { id: 'b', name: 'Dal' },
    ],
    proteinDays: { hit: 4, logged: 6 },
  },
  gym: {
    sessions: 3,
    prCount: 1,
    prs: [{ exerciseName: 'Bench Press', label: '62.5 kg × 5' }],
    streakWeeks: 0,
  },
  empty: false,
};

let mockRecap: WeeklyRecapDto | undefined = RECAP;
const mockQueryInput = jest.fn<undefined, [unknown]>();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    recap: {
      week: {
        useQuery: (input: unknown, opts?: { enabled?: boolean }) => {
          mockQueryInput(input);
          return {
            data: opts?.enabled === false ? undefined : mockRecap,
            isError: false,
            refetch: jest.fn(),
          };
        },
      },
    },
  },
}));

const mockShare = jest.fn<Promise<void>, [unknown, string]>(() => Promise.resolve());
jest.mock('../../src/features/share/share-card', () => ({
  useShareCard: () => ({ share: mockShare, sharing: null }),
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
let mockGamification = false;
jest.mock('../../src/hooks/use-flags', () => ({
  useFlags: () => ({ gamification: mockGamification }),
}));
const mockPush = jest.fn<undefined, [string]>();
jest.mock('expo-router', () => ({
  router: {
    push: (href: string): undefined => mockPush(href),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({}),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const wrap = (node: React.ReactNode) => (
  <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockRecap = RECAP;
  mockGamification = false;
});

describe('WeeklyRecapScreen', () => {
  it('shows the week’s facts, never a shortfall, and no zero rows', async () => {
    await render(wrap(<WeeklyRecapScreen />));
    expect(screen.getByTestId('recap-week')).toHaveTextContent('12–18 Oct');
    expect(screen.getByText('9 meals cooked from your plan')).toBeOnTheScreen();
    expect(screen.queryByText(/9 of 14/)).toBeNull();
    expect(screen.getByText('2 new recipes tried')).toBeOnTheScreen();
    expect(screen.getByText('Lemon pasta')).toBeOnTheScreen();
    expect(screen.getByText('Protein goal reached on 4 of 6 logged days')).toBeOnTheScreen();
    expect(screen.getByText('3 workouts')).toBeOnTheScreen();
    expect(screen.getByText('Bench Press: 62.5 kg × 5')).toBeOnTheScreen();
    // streakWeeks 0: no "0-week streak" row.
    expect(screen.queryByText(/streak/)).toBeNull();
  });

  it('a quiet week says so kindly and offers no share', async () => {
    mockRecap = { ...RECAP, empty: true };
    await render(wrap(<WeeklyRecapScreen />));
    expect(screen.getByTestId('recap-quiet')).toHaveTextContent(/A quiet week/);
    expect(screen.queryByTestId('recap-share')).toBeNull();
  });

  it('the share card holds what the user picked; protein days are opt-in', async () => {
    const user = userEvent.setup();
    await render(wrap(<WeeklyRecapScreen />));
    await user.press(screen.getByTestId('recap-share'));
    expect(screen.getByTestId('recap-pick-protein')).toHaveProp('value', false);
    await user.press(screen.getByTestId('recap-share-go'));
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
    const [input, message] = mockShare.mock.calls[0] as [Record<string, unknown>, string];
    expect(input).toMatchObject({
      kind: 'recap',
      weekStart: '2026-10-12',
      include: { cooking: true, protein: false, training: true },
    });
    expect(message).toBe('My week with Chefer, 12–18 Oct.');
  });
});

describe('RecapTodayCard', () => {
  it('Monday only, and opens the recap', async () => {
    const user = userEvent.setup();
    const { rerender } = await render(wrap(<RecapTodayCard isMonday={false} />));
    expect(screen.queryByTestId('today-recap')).toBeNull();
    await rerender(wrap(<RecapTodayCard isMonday />));
    await user.press(screen.getByTestId('today-recap'));
    expect(mockPush).toHaveBeenCalledWith('/recap?from=today');
  });

  it('hides for a quiet week and when Kitchen progress owns the recap', async () => {
    mockRecap = { ...RECAP, empty: true };
    const { rerender } = await render(wrap(<RecapTodayCard isMonday />));
    expect(screen.queryByTestId('today-recap')).toBeNull();
    mockRecap = RECAP;
    mockGamification = true;
    await rerender(wrap(<RecapTodayCard isMonday />));
    expect(screen.queryByTestId('today-recap')).toBeNull();
  });
});

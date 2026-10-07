import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { buttonVariants } from '@chefer/ui-mobile';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';
import {
  NutritionSummary,
  RING_INNER_WIDTH,
} from '../../src/features/dashboard/components/nutrition-summary';
import { TonightCard } from '../../src/features/dashboard/components/tonight-card';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
import { AccountDataCard } from '../../src/features/profile/account-data-card';
import { TRACKER_TICK_HIT_PT, TrackerTick } from '../../src/features/tracker/tracker-tick';

// WP-04 lane C: food-screen readability and layout polish — 48 pt hit areas on
// Today's "I ate this" and the tracker tick, the ring caption held inside the
// ring (UX-FOOD-24), wrapping card copy (UX-ACC-27), a wrapping meal badge row
// (UX-PLAN-13).

// Button's className is compiled away under Jest, so record the props the hero
// passes it (the `lg` size is min-h-12 = 48 pt, asserted via buttonVariants).
const mockButtonProps: Record<string, { size?: string }> = {};
jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return {
    ...actual,
    Button: (props: React.ComponentProps<typeof actual.Button>) => {
      if (props.testID) mockButtonProps[props.testID] = { size: props.size ?? 'default' };
      return actual.Button(props);
    },
  };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('../../src/lib/share-file', () => ({ shareExportFile: jest.fn() }));
jest.mock('../../src/lib/sign-out', () => ({ signOut: jest.fn() }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    tracker: {
      logRecipe: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
      },
      unlogRecipe: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
      },
    },
    recipe: {
      getMyRating: { useQuery: () => ({ data: null, isLoading: false }) },
      rate: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    user: {
      deleteSelf: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    auth: {
      logout: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      me: { useQuery: () => ({ data: { email: 'alice@chefer.dev' } }) },
      linkedIdentities: { useQuery: () => ({ data: undefined }) },
      requestPasswordReset: {
        useMutation: () => ({
          mutate: jest.fn(),
          isError: false,
          isSuccess: false,
          isPending: false,
        }),
      },
    },
  },
}));

const classOf = (testID: string) => String(screen.getByTestId(testID).props.className);

describe('48 pt primary food controls', () => {
  it('Today hero "I ate this" uses the lg (min-h-12 = 48 pt) button', async () => {
    await render(
      <HeroMealCard
        isTomorrow={false}
        meal={{
          mealType: 'dinner',
          recipe: {
            id: 'curry',
            name: 'Lentil Curry',
            description: '',
            imageUrl: null,
            kcal: 700,
            servings: 1,
            prepTimeMins: 10,
            cookTimeMins: 30,
          },
        }}
      />,
    );
    expect(mockButtonProps['today-ate-this']?.size).toBe('lg');
    expect(buttonVariants({ size: 'lg' })).toMatch(/\bmin-h-12\b/);
  });

  it('the Tonight card "I ate this" row is at least 48 pt', async () => {
    await render(
      <TonightCard
        showNutrition
        onLogged={jest.fn()}
        meal={{
          mealType: 'dinner',
          done: false,
          planId: 'p1',
          dayOfWeek: 1,
          slotIndex: 0,
          recipe: {
            id: 'curry',
            name: 'Lentil Curry',
            description: '',
            imageUrl: null,
            kcal: 700,
            servings: 1,
            prepTimeMins: 10,
            cookTimeMins: 30,
          },
        }}
      />,
    );
    expect(classOf('tonight-ate-this')).toMatch(/\bmin-h-12\b/);
  });

  it('the tracker tick pads its hit area to 48 pt around a smaller visual', async () => {
    expect(TRACKER_TICK_HIT_PT).toBe(48);
    await render(<TrackerTick testID="tick" checked={false} />);
    expect(classOf('tick')).toMatch(/\bh-12\b/);
    expect(classOf('tick')).toMatch(/\bw-12\b/);
    await render(<TrackerTick testID="tick-on" checked />);
    expect(classOf('tick-on')).toMatch(/\bh-12 w-12\b/);
  });
});

describe('UX-FOOD-24 ring caption', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { __REDUCED_MOTION__?: boolean }).__REDUCED_MOTION__ = true;
  });
  afterAll(() => {
    (globalThis as typeof globalThis & { __REDUCED_MOTION__?: boolean }).__REDUCED_MOTION__ =
      undefined;
  });

  const nutrition = {
    dailyCalorieTarget: 1701,
    plannedKcal: 1700,
    eatenKcal: 900,
    protein: { planned: 100, targetG: 140, eaten: 60 },
    carbs: { planned: 180, targetG: 220, eaten: 90 },
    fat: { planned: 50, targetG: 70, eaten: 20 },
  };

  it('is short, wraps (never auto-shrinks) and stays inside the ring', async () => {
    await render(<NutritionSummary nutrition={nutrition} />);
    const caption = screen.getByTestId('calorie-ring-caption');
    expect(caption).toHaveTextContent('of 1,701 kcal');
    expect(caption).not.toHaveTextContent(/eaten/);
    expect(caption.props.numberOfLines).toBe(2);
    expect(caption.props.adjustsFontSizeToFit).toBeUndefined();
    expect(caption.props.maxFontSizeMultiplier).toBe(1.3);
    expect(caption).toHaveStyle({ maxWidth: RING_INNER_WIDTH });
    // Inner circle = 128 − 2×12 stroke; the caption keeps a margin inside it.
    expect(RING_INNER_WIDTH).toBeLessThan(128 - 2 * 12);
    // "eaten" is still announced.
    expect(screen.getByTestId('calorie-ring')).toHaveAccessibleName(
      '900 of 1,701 kcal eaten today',
    );
  });
});

describe('UX-ACC-27 card copy wraps', () => {
  it('the Your data card text is full-width with min-w-0', async () => {
    const queryClient = new QueryClient();
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <AccountDataCard />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    const copy = classOf('profile-your-data-copy');
    expect(copy).toMatch(/\bw-full\b/);
    expect(copy).toMatch(/\bmin-w-0\b/);
    expect(classOf('profile-your-data')).toMatch(/\bmin-w-0\b/);
  });
});

describe('UX-PLAN-13 meal card badges', () => {
  const recipe = {
    id: 'r1',
    name: 'Chicken Rice Bowl',
    description: '',
    ingredients: [],
    instructions: [],
    nutritionInfo: { calories: 500, protein: 40, carbs: 50, fat: 20, fiber: 5 },
    cuisineType: 'asian',
    dietaryTags: [],
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 1,
    imageUrl: null,
    imageStatus: 'DONE' as const,
  };

  it('the eyebrow row wraps so "Your pick" and the portion chip never collide', async () => {
    await render(
      <PlanMealCard
        testID="pm"
        day={1}
        meal={{ type: 'dinner', recipe, portion: 1.5, pinned: true, leftoverOf: 'Monday' }}
      />,
    );
    const row = classOf('pm-badges');
    expect(row).toMatch(/\bflex-wrap\b/);
    expect(row).toMatch(/\bmin-w-0\b/);
    expect(screen.getByText('Your pick')).toBeOnTheScreen();
    expect(screen.getByTestId('pm-portion')).toBeOnTheScreen();
  });
});

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import ProfileScreen from '../../app/profile';
import { openPremium } from '../../src/features/premium/open-premium';

// T-10.3 / T-10.8 (UX-10 §3, §4, §9): Profile › Plan & Premium, the downgrade
// summary (what you keep, what you lose — only the jobs used; cancel keeps
// Premium) and the honest Daily AI allowances.

const mockDowngrade = jest.fn();
const mockShow = jest.fn();
const mockTrack = jest.fn();
let downgradeOpts: { onSuccess?: () => void } = {};
let mockUser = {
  firstName: 'Ana',
  lastName: null,
  email: 'ana@test.dev',
  role: 'USER',
  planTier: 'FREE',
};
let mockUsage: Record<string, unknown> | undefined;
let mockMembers: { name: string }[] = [];

jest.mock('../../src/features/privacy/privacy-section', () => ({ PrivacySection: () => null }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/features/premium/use-premium-pitch', () => ({
  usePremiumPitch: () => ({
    bullets: ['Recipes scaled to everyone at your table'],
    alsoIncluded: ['Recipe import (daily allowance)'],
  }),
}));
jest.mock('../../src/lib/analytics', () => ({
  track: (...a: unknown[]) => {
    mockTrack(...a);
  },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@chefer/ui-mobile', () => ({
  ...jest.requireActual<Record<string, unknown>>('@chefer/ui-mobile'),
  useSnackbar: () => ({ show: mockShow }),
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      user: { me: { invalidate: jest.fn() } },
      auth: { me: { invalidate: jest.fn() } },
    }),
    user: {
      me: { useQuery: () => ({ data: mockUser }) },
      downgradePlan: {
        useMutation: (opts: typeof downgradeOpts) => {
          downgradeOpts = opts;
          return { mutate: mockDowngrade, isPending: false };
        },
      },
    },
    profile: { getAiUsage: { useQuery: () => ({ data: mockUsage, isLoading: false }) } },
    household: { list: { useQuery: () => ({ data: mockMembers }) } },
  },
}));

const usage = (over: Record<string, unknown> = {}, today: Record<string, number> = {}) => ({
  today: { MEAL_PLAN: 0, CHAT: 0, RECIPE_IMPORT: 0, SCAN: 0, CURATED_PLAN: 0, ...today },
  aiMealPlans: 0,
  curatedPlans: 0,
  importsSaved: 0,
  ...over,
});

async function renderProfile() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ProfileScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    firstName: 'Ana',
    lastName: null,
    email: 'ana@test.dev',
    role: 'USER',
    planTier: 'FREE',
  };
  mockUsage = usage();
  mockMembers = [];
});

describe('Profile › Plan & Premium', () => {
  it('free: says what Free includes and opens the premium sheet with source profile', async () => {
    const user = userEvent.setup();
    await renderProfile();
    expect(screen.getByTestId('profile-plan-title')).toHaveTextContent('Your plan: Free');
    expect(
      screen.getByText(
        'Free includes the gym log, weekly plans from our recipes, allergy checks on every plan and your shopping list.',
      ),
    ).toBeOnTheScreen();
    // The old generic pitch is gone (B-32).
    expect(screen.queryByText(/tailored to your goals|nutrition profile/i)).toBeNull();
    await user.press(screen.getByTestId('profile-upgrade'));
    expect(openPremium).toHaveBeenCalledWith('profile');
  });

  it('premium: "Included", what you have, and a switch back that asks first', async () => {
    mockUser = { ...mockUser, planTier: 'PREMIUM' };
    await renderProfile();
    expect(screen.getByTestId('profile-plan-title')).toHaveTextContent('Your plan: Premium');
    expect(screen.getByText('Included')).toBeOnTheScreen();
    expect(screen.getByText('What you have')).toBeOnTheScreen();
    expect(screen.getByText('Recipes scaled to everyone at your table')).toBeOnTheScreen();
    expect(screen.queryByText(/beta/i)).toBeNull();
    expect(screen.getByText('Switch back to Free')).toBeOnTheScreen();
    expect(mockDowngrade).not.toHaveBeenCalled();
  });
});

describe('downgrade summary (AC7)', () => {
  const open = async () => {
    const user = userEvent.setup();
    mockUser = { ...mockUser, planTier: 'PREMIUM' };
    await renderProfile();
    await user.press(screen.getByTestId('profile-downgrade'));
    return user;
  };

  it('says what you keep and lists only the Premium jobs this user used', async () => {
    mockMembers = [{ name: 'Luca' }];
    mockUsage = usage({}, { RECIPE_IMPORT: 1, CHAT: 2 });
    await open();
    expect(screen.getByTestId('downgrade-confirm-title')).toHaveTextContent('Switch back to Free?');
    const body = screen.getByTestId('downgrade-confirm-body');
    expect(body).toHaveTextContent("You'll keep your plans, recipes, ratings, logs and workouts.", {
      exact: false,
    });
    expect(body).toHaveTextContent("You'll lose:", { exact: false });
    expect(body).toHaveTextContent('Portions for your table — plans go back to 1 portion', {
      exact: false,
    });
    expect(body).toHaveTextContent('Recipe import', { exact: false });
    expect(body).toHaveTextContent('The AI chef', { exact: false });
    expect(body).not.toHaveTextContent('Photo meal logging', { exact: false });
  });

  it('cancel keeps Premium: nothing is sent', async () => {
    const user = await open();
    await user.press(screen.getByTestId('downgrade-confirm-cancel'));
    expect(mockDowngrade).not.toHaveBeenCalled();
    expect(screen.getByTestId('profile-plan-title')).toHaveTextContent('Your plan: Premium');
  });

  it('confirming switches to Free, then says the data is still there', async () => {
    const user = await open();
    await user.press(screen.getByTestId('downgrade-confirm-confirm'));
    expect(mockDowngrade).toHaveBeenCalledTimes(1);
    await act(() => {
      downgradeOpts.onSuccess?.();
    });
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: "You're on Free. Your data is all still here." }),
    );
    expect(mockTrack).toHaveBeenCalledWith('downgrade_completed', {});
  });
});

describe('Daily AI allowances (T-10.8, AC13)', () => {
  it('free: counts plans from our recipes against the 3/day cap, never as AI, never "unlimited"', async () => {
    mockUsage = usage({ curatedPlans: 2 });
    await renderProfile();
    expect(screen.getByText('Daily AI allowances')).toBeOnTheScreen();
    expect(screen.getByText('Plans from our recipes')).toBeOnTheScreen();
    expect(screen.getByText('2 / 3')).toBeOnTheScreen();
    expect(screen.queryByText('AI meal plans')).toBeNull();
    expect(screen.queryByText('Meal plans generated')).toBeNull();
    expect(screen.queryByText(/unlimited and don.t count/i)).toBeNull();
    expect(screen.getByTestId('profile-usage-helper')).toHaveTextContent(
      'Plans from our recipes use no AI, and free accounts can build a few a day.',
    );
  });

  it('premium: AI meal plans count the AI reservations; an import counts when read', async () => {
    mockUser = { ...mockUser, planTier: 'PREMIUM' };
    mockUsage = usage({ aiMealPlans: 1, importsSaved: 1 }, { RECIPE_IMPORT: 2, CHAT: 4 });
    await renderProfile();
    expect(screen.getByText('AI meal plans')).toBeOnTheScreen();
    expect(screen.getByText('1 / 20')).toBeOnTheScreen();
    expect(screen.getByText('Recipe imports read')).toBeOnTheScreen();
    expect(screen.getByText('2 / 5')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-usage-helper')).toHaveTextContent(
      'An import counts when we read it; saving it is free (1 saved today).',
      { exact: false },
    );
  });
});

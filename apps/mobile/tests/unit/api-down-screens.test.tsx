import type { ReactElement } from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import MealPlanScreen from '../../app/(food)/meal-plan';
import RecipesScreen from '../../app/(food)/recipes';
import ShoppingListScreen from '../../app/(food)/shopping-list';
import ProgressScreen from '../../app/progress';
import TrackerScreen from '../../app/tracker';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// WP-02 acceptance: "with the API stopped, every Today, tracker, plan, shop and
// recipe screen shows an error with Retry — none shows 'Loading…' forever or an
// empty state". Every procedure answers 500; each screen must offer Try again.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    Link: ({ children }: { children: React.ReactNode }) => children,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useIsFocused: () => true,
    useLocalSearchParams: () => ({}),
  };
});
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => jest.fn(),
  AiConsentHost: () => null,
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

/** Every procedure fails, like an API that is stopped. */
const noHandlers: Handlers = {};
const allDown: Handlers = new Proxy(noHandlers, {
  get: () => () => {
    throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'boom');
  },
  has: () => true,
});

const SCREENS: [string, () => ReactElement][] = [
  ['Plan', () => <MealPlanScreen />],
  ['Shop', () => <ShoppingListScreen />],
  ['Recipes', () => <RecipesScreen />],
  ['Tracker', () => <TrackerScreen />],
  ['Progress', () => <ProgressScreen />],
];

describe('API stopped', () => {
  it.each(SCREENS)('%s shows an error with Try again', async (_name, screenElement) => {
    await renderWithTrpc(screenElement(), allDown, testQueryClient());
    await waitFor(() => expect(screen.getAllByText('Try again').length).toBeGreaterThan(0));
  });
});

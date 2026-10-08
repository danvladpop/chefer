import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CustomIngredientSheet } from '../../src/features/ingredients/custom-ingredient-sheet';
import { resetPremiumStoreForTests } from '../../src/features/premium/open-premium';

// Orchestrator follow-up: "Fill in for me" on a free account presents the
// premium sheet FROM INSIDE the custom-ingredient sheet. iOS cannot present a
// Modal over a Modal, so the sheet mounts its own nested <PremiumHost />; this
// renders the real sheet, host and store (nothing about premium is mocked).

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const mockEstimate = jest.fn();

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_f: string, run: () => void) => {
    run();
  },
  AiConsentHost: () => null,
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/lib/trpc', () => {
  const idle = { mutate: jest.fn(), reset: jest.fn(), isPending: false, isError: false };
  return {
    trpc: {
      useUtils: () => ({ invalidate: jest.fn(), mealPlan: {}, shoppingList: {} }),
      profile: { flags: { useQuery: () => ({ data: {} }) } },
      preferences: {
        get: { useQuery: () => ({ data: { jobs: ['PLAN_MEALS'] } }) },
        hasProfile: { useQuery: () => ({ data: true }) },
      },
      household: { list: { useQuery: () => ({ data: [] }) } },
      mealPlan: {
        generate: { useMutation: () => idle },
        getForWeek: { useQuery: () => ({ data: null }) },
      },
      user: { upgradePlan: { useMutation: () => idle } },
      ingredients: {
        createCustom: { useMutation: () => idle },
        estimateNutrition: {
          useMutation: () => ({
            ...idle,
            mutate: (i: unknown) => {
              mockEstimate(i);
            },
          }),
        },
      },
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  resetPremiumStoreForTests();
});

it('free: "Fill in for me" opens the job-led premium sheet inside the custom sheet, and estimates nothing', async () => {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CustomIngredientSheet
        visible
        initialName="oat bran"
        onClose={jest.fn()}
        onCreated={jest.fn()}
        testID="custom-sheet"
      />
    </SafeAreaProvider>,
  );
  expect(screen.queryByTestId('premium-sheet-title')).toBeNull();

  await fireEvent.press(screen.getByTestId('custom-sheet-fill-in'));

  expect(mockEstimate).not.toHaveBeenCalled();
  expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent(
    'Fill in nutrition in one tap',
  );
  expect(screen.getByText('INCLUDED')).toBeOnTheScreen();
});

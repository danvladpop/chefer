import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CustomIngredientSheet } from '../../src/features/ingredients/custom-ingredient-sheet';

// T-40.8 (UX-40 slice 2): the mobile custom-ingredient sheet. `Fill in for
// me` is the only lock on this screen (P4) — free taps never call
// ingredients.estimateNutrition, they open the upsell instead (delta rule 2:
// no price/checkout copy anywhere in that path).

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let mockPremiumUser: { planTier: string; role: string } | undefined = {
  planTier: 'PREMIUM',
  role: 'USER',
};
const mockCreateCustom = jest.fn();
const mockEstimate = jest.fn();
const mockPush = jest.fn();
const mockOpenPremium = jest.fn();
let mockEstimateState: {
  isPending: boolean;
  isError: boolean;
  data: unknown;
} = { isPending: false, isError: false, data: undefined };

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
}));

jest.mock('../../src/features/premium/premium-host', () => ({ PremiumHost: () => null }));
jest.mock('../../src/features/premium/open-premium', () => ({
  openPremium: (...args: unknown[]) => {
    mockOpenPremium(...args);
  },
}));
jest.mock('../../src/hooks/use-is-premium', () => ({
  useIsPremium: () =>
    mockPremiumUser && (mockPremiumUser.planTier === 'PREMIUM' || mockPremiumUser.role === 'ADMIN'),
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    ingredients: {
      createCustom: {
        useMutation: (opts: { onSuccess?: (row: { displayName: string }) => void }) => ({
          mutate: (input: { name: string }) => {
            mockCreateCustom(input);
            opts.onSuccess?.({ displayName: input.name });
          },
          isPending: false,
          isError: false,
        }),
      },
      estimateNutrition: {
        useMutation: (opts: {
          onSuccess?: (est: Record<string, number | string | null>) => void;
        }) => ({
          ...mockEstimateState,
          mutate: (input: { name: string }) => {
            mockEstimate(input);
            if (!mockEstimateState.isError) {
              opts.onSuccess?.({
                caloriesPer100g: 379,
                proteinPer100g: 13,
                carbsPer100g: 67,
                fatPer100g: 7,
                gramsPerPiece: null,
                source: 'ai',
              });
            }
          },
        }),
      },
    },
  },
}));

const onCreated = jest.fn();
const onClose = jest.fn();

async function renderSheet(initialName = 'oat bran') {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CustomIngredientSheet
        visible
        initialName={initialName}
        onClose={onClose}
        onCreated={onCreated}
        testID="custom-sheet"
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPremiumUser = { planTier: 'PREMIUM', role: 'USER' };
  mockEstimateState = { isPending: false, isError: false, data: undefined };
});

describe('CustomIngredientSheet', () => {
  it('prefills the name from the search query and saves over ingredients.createCustom', async () => {
    await renderSheet('oat bran');
    await fireEvent.changeText(screen.getByTestId('custom-sheet-kcal'), '246');
    await fireEvent.press(screen.getByTestId('custom-sheet-save'));

    expect(mockCreateCustom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'oat bran', caloriesPer100g: 246, fiberPer100g: 0 }),
    );
    expect(onCreated).toHaveBeenCalledWith('oat bran');
  });

  it('the save button stays disabled until a name and calories are entered', async () => {
    await renderSheet('');
    expect(screen.getByTestId('custom-sheet-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('custom-sheet-name'), 'xy');
    await fireEvent.changeText(screen.getByTestId('custom-sheet-kcal'), '100');
    expect(screen.getByTestId('custom-sheet-save')).toBeEnabled();
  });

  it('premium: "Fill in for me" calls estimateNutrition and fills the macro fields', async () => {
    await renderSheet('oat bran');
    await fireEvent.press(screen.getByTestId('custom-sheet-fill-in'));

    expect(mockEstimate).toHaveBeenCalledWith({ name: 'oat bran' });
    expect(mockOpenPremium).not.toHaveBeenCalled();
    expect(screen.getByTestId('custom-sheet-kcal').props.value).toBe('379');
    expect(screen.getByTestId('custom-sheet-protein').props.value).toBe('13');
  });

  it('free: "Fill in for me" never calls estimateNutrition and opens the upsell instead', async () => {
    mockPremiumUser = { planTier: 'FREE', role: 'USER' };
    await renderSheet('oat bran');
    await fireEvent.press(screen.getByTestId('custom-sheet-fill-in'));

    expect(mockEstimate).not.toHaveBeenCalled();
    expect(mockOpenPremium).toHaveBeenCalledWith('ingredient-autofill');
  });

  it('free: no price or checkout copy appears anywhere on the locked path (delta rule 2)', async () => {
    mockPremiumUser = { planTier: 'FREE', role: 'USER' };
    await renderSheet('oat bran');
    expect(screen.queryByText(/\$|€|£|\bprice\b|\bcheckout\b|\bbuy\b/i)).toBeNull();
  });
});

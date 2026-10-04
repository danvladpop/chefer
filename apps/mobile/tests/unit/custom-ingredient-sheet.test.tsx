import { Keyboard } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CustomIngredientSheet } from '../../src/features/ingredients/custom-ingredient-sheet';
import { focusedFields, resetFocusedFields } from './keyboard-test-utils';

// plan-ingredient-catalog §8.1 / D5 (P9; T-40.8 originally): the mobile
// private-ingredient sheet. All five label values are required, CONFLICT
// offers the catalog row or an explicit "mine is different". `Fill in for
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

// R-10: "Fill in for me" asks for AI-data consent first. The consent guard is
// replaced by a stub that either allows (runs the action) or declines.
let mockConsentGranted = true;
const mockRequestConsent = jest.fn();
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (feature: string, run: () => void) => {
    mockRequestConsent(feature);
    if (mockConsentGranted) run();
  },
  AiConsentHost: () => null,
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

let mockConflictOnce = false;
const mockResolveFetch = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      ingredients: {
        resolve: {
          fetch: (input: unknown) => {
            mockResolveFetch(input);
            return Promise.resolve([
              {
                rawName: 'skyr',
                unit: '',
                note: null,
                confidence: 'ALIAS',
                candidates: [],
                match: {
                  id: 'skyr-id',
                  slug: 'skyr-plain',
                  name: 'Skyr, plain',
                  category: 'DAIRY_YOGURT_CREAM',
                  owner: 'global',
                  portions: [],
                  hasDensity: true,
                  nutritionSource: 'USDA_FDC',
                },
              },
            ]);
          },
        },
      },
    }),
    ingredients: {
      createCustom: {
        useMutation: (opts: {
          onSuccess?: (row: Record<string, unknown>) => void;
          onError?: (error: { message: string; data: { code: string } }) => void;
        }) => ({
          mutate: (input: { name: string; confirmDifferent?: boolean }) => {
            mockCreateCustom(input);
            if (mockConflictOnce && !input.confirmDifferent) {
              mockConflictOnce = false;
              opts.onError?.({
                message: 'Chefer already has "Skyr, plain" — search for it instead.',
                data: { code: 'CONFLICT' },
              });
              return;
            }
            opts.onSuccess?.({
              name: input.name,
              displayName: input.name,
              imageUrl: '',
              hasMacros: true,
              isCustom: true,
              per100g: null,
              id: 'new-id',
              slug: 'new',
              category: 'OTHER',
              owner: 'mine',
              portions: [],
              hasDensity: false,
              nutritionSource: 'USER',
            });
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
                fiberPer100g: 10,
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
  mockConflictOnce = false;
  mockConsentGranted = true;
});

async function fillLabel(
  values = { kcal: '246', protein: '17', carbs: '50', fat: '7', fiber: '15' },
) {
  await fireEvent.changeText(screen.getByTestId('custom-sheet-kcal'), values.kcal);
  await fireEvent.changeText(screen.getByTestId('custom-sheet-protein'), values.protein);
  await fireEvent.changeText(screen.getByTestId('custom-sheet-carbs'), values.carbs);
  await fireEvent.changeText(screen.getByTestId('custom-sheet-fat'), values.fat);
  await fireEvent.changeText(screen.getByTestId('custom-sheet-fiber'), values.fiber);
}

describe('CustomIngredientSheet', () => {
  it('saves all five label values plus the optional piece weight and density', async () => {
    await renderSheet('oat bran');
    await fillLabel();
    await fireEvent.changeText(screen.getByTestId('custom-sheet-grams-per-piece'), '30');
    await fireEvent.changeText(screen.getByTestId('custom-sheet-grams-per-100ml'), '50');
    await fireEvent.press(screen.getByTestId('custom-sheet-save'));

    expect(mockCreateCustom).toHaveBeenCalledWith({
      name: 'oat bran',
      caloriesPer100g: 246,
      proteinPer100g: 17,
      carbsPer100g: 50,
      fatPer100g: 7,
      fiberPer100g: 15,
      gramsPerPiece: 30,
      densityGPerMl: 0.5,
    });
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-id', name: 'oat bran', owner: 'mine' }),
    );
  });

  it('D5: a missing value blocks the save and says all five are needed', async () => {
    await renderSheet('oat bran');
    await fillLabel({ kcal: '246', protein: '17', carbs: '50', fat: '7', fiber: '' });
    await fireEvent.press(screen.getByTestId('custom-sheet-save'));

    expect(mockCreateCustom).not.toHaveBeenCalled();
    expect(screen.getByTestId('custom-sheet-incomplete')).toHaveTextContent(
      'Fill in all five values from the label.',
    );
  });

  it('CONFLICT offers the catalog row: "Use it" links it, nothing is created', async () => {
    mockConflictOnce = true;
    await renderSheet('skyr');
    await fillLabel();
    await fireEvent.press(screen.getByTestId('custom-sheet-save'));

    expect(screen.getByText('Chefer already has "Skyr, plain"')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('custom-sheet-use-it'));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'skyr-id' })),
    );
    expect(mockResolveFetch).toHaveBeenCalledWith({ lines: [{ rawName: 'Skyr, plain' }] });
    expect(mockCreateCustom).toHaveBeenCalledTimes(1);
  });

  it('CONFLICT: "No, mine is different" re-sends with confirmDifferent', async () => {
    mockConflictOnce = true;
    await renderSheet('skyr');
    await fillLabel();
    await fireEvent.press(screen.getByTestId('custom-sheet-save'));
    await fireEvent.press(screen.getByTestId('custom-sheet-mine-is-different'));

    expect(mockCreateCustom).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'skyr', confirmDifferent: true }),
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-id' }));
  });

  it('premium: "Fill in for me" calls estimateNutrition and fills the macro fields', async () => {
    await renderSheet('oat bran');
    await fireEvent.press(screen.getByTestId('custom-sheet-fill-in'));

    expect(mockEstimate).toHaveBeenCalledWith({ name: 'oat bran' });
    expect(mockOpenPremium).not.toHaveBeenCalled();
    expect(screen.getByTestId('custom-sheet-kcal').props.value).toBe('379');
    expect(screen.getByTestId('custom-sheet-protein').props.value).toBe('13');
    expect(screen.getByTestId('custom-sheet-fiber').props.value).toBe('10');
  });

  it('premium: "Fill in for me" asks for AI consent first (feature ingredient-estimate); declining sends nothing (R-10)', async () => {
    mockConsentGranted = false;
    await renderSheet('oat bran');
    await fireEvent.press(screen.getByTestId('custom-sheet-fill-in'));

    expect(mockRequestConsent).toHaveBeenCalledWith('ingredient-estimate');
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('free: "Fill in for me" never calls estimateNutrition and opens the upsell instead', async () => {
    mockPremiumUser = { planTier: 'FREE', role: 'USER' };
    await renderSheet('oat bran');
    await fireEvent.press(screen.getByTestId('custom-sheet-fill-in'));

    expect(mockEstimate).not.toHaveBeenCalled();
    expect(mockRequestConsent).not.toHaveBeenCalled();
    expect(mockOpenPremium).toHaveBeenCalledWith('ingredient-autofill');
  });

  it('free: no price or checkout copy appears anywhere on the locked path (delta rule 2)', async () => {
    mockPremiumUser = { planTier: 'FREE', role: 'USER' };
    await renderSheet('oat bran');
    expect(screen.queryByText(/\$|€|£|\bprice\b|\bcheckout\b|\bbuy\b/i)).toBeNull();
  });
});

// Tester feedback 2026-10-04: name -> kcal -> protein -> carbs -> fat -> fibre
// -> g/piece -> g/100 ml on Return / Next, closing the keyboard after the last.
describe('CustomIngredientSheet — keyboard (tester feedback 2026-10-04)', () => {
  it('Return walks every field in order and the last one closes the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await renderSheet();
    const order = [
      'custom-sheet-name',
      'custom-sheet-kcal',
      'custom-sheet-protein',
      'custom-sheet-carbs',
      'custom-sheet-fat',
      'custom-sheet-fiber',
      'custom-sheet-grams-per-piece',
      'custom-sheet-grams-per-100ml',
    ];
    expect(screen.getByTestId(order[0] ?? '').props.returnKeyType).toBe('next');
    expect(screen.getByTestId(order[7] ?? '').props.returnKeyType).toBe('done');
    // number pads have no Return key on iOS: each carries its own Next / Done bar.
    for (const id of order.slice(1)) {
      expect(screen.getByTestId(id).props.inputAccessoryViewID).toBeTruthy();
    }

    resetFocusedFields();
    for (const id of order.slice(0, 7)) {
      await fireEvent(screen.getByTestId(id), 'submitEditing');
    }
    expect(focusedFields()).toEqual(order.slice(1));
    expect(dismiss).not.toHaveBeenCalled();

    await fireEvent(screen.getByTestId(order[7] ?? ''), 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });
});

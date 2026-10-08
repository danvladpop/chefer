import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { NumbersModeProvider } from '../../src/features/numbers-mode/numbers-mode';
import { TargetsCard } from '../../src/features/preferences/targets-card';

// WP-08: Preferences → Your targets is ONE card holding "What do you want to keep
// an eye on?" (preferences.setNumbersMode) and the older "Show calories and
// macros on Today" switch (preferences.setHomeDisplay). Each control calls only
// its own procedure; a successful save invalidates everything so Today, the
// tracker and the plan switch straight away.

const mockSetNumbersMode = jest.fn();
const mockSetHomeDisplay = jest.fn();
const mockInvalidateAll = jest.fn();
const mockInvalidatePreferences = jest.fn();
let mockNumbersOpts: { onSuccess?: (r: { numbersMode: string }) => void } = {};
let mockTargets: unknown;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      invalidate: mockInvalidateAll,
      preferences: { invalidate: mockInvalidatePreferences },
      dashboard: { invalidate: jest.fn() },
      targets: { get: { invalidate: jest.fn() }, changes: { invalidate: jest.fn() } },
      tracker: { getDay: { invalidate: jest.fn() } },
    }),
    targets: {
      get: {
        useQuery: () => ({
          data: mockTargets,
          isLoading: !mockTargets,
          isError: false,
          refetch: jest.fn(),
        }),
      },
      set: { useMutation: () => ({ mutate: jest.fn(), isPending: false, isSuccess: false }) },
    },
    preferences: {
      setNumbersMode: {
        useMutation: (opts: typeof mockNumbersOpts) => {
          mockNumbersOpts = opts;
          return { mutate: mockSetNumbersMode, isPending: false, isError: false, error: null };
        },
      },
      setHomeDisplay: {
        useMutation: () => ({
          mutate: mockSetHomeDisplay,
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

const SAFE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const targets = (proteinWhy?: unknown) => ({
  targetMode: 'SUGGESTED',
  effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  suggested: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  custom: { kcal: null, proteinG: null, carbsG: null, fatG: null },
  inputs: { weightKg: 80 },
  ...(proteinWhy !== undefined && { proteinWhy }),
});

function renderCard(numbersMode: string | null = null, showNutritionOnToday = true) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE}>
      {/* The app-wide mode (NumbersModeHost) follows the saved setting. */}
      <NumbersModeProvider mode={numbersMode}>
        <TargetsCard numbersSettings={{ numbersMode, showNutritionOnToday }} />
      </NumbersModeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTargets = targets();
});

describe('Your targets card — numbers settings (WP-08)', () => {
  it('holds the choice and the Today toggle in the one card, even while targets load', async () => {
    mockTargets = undefined;
    await renderCard();
    expect(screen.getByTestId('targets-card')).toBeOnTheScreen();
    expect(screen.getByTestId('targets-numbers-settings')).toBeOnTheScreen();
    expect(screen.getByText('Calories and macros')).toBeOnTheScreen();
    expect(screen.getByText('Just protein')).toBeOnTheScreen();
    expect(screen.getByTestId('prefs-home-display-switch')).toBeOnTheScreen();
  });

  it('picking Just protein calls setNumbersMode, and not setHomeDisplay', async () => {
    const user = userEvent.setup();
    await renderCard();
    expect(screen.getByTestId('prefs-numbers-mode-full').props).toMatchObject({
      accessibilityState: { selected: true },
    });
    await user.press(screen.getByTestId('prefs-numbers-mode-protein'));
    expect(mockSetNumbersMode).toHaveBeenCalledWith({ numbersMode: 'PROTEIN_ONLY' });
    expect(mockSetNumbersMode).toHaveBeenCalledTimes(1);
    expect(mockSetHomeDisplay).not.toHaveBeenCalled();
    expect(screen.getByTestId('prefs-numbers-mode-protein').props).toMatchObject({
      accessibilityState: { selected: true },
    });
  });

  it('switching back to Calories and macros calls setNumbersMode with FULL', async () => {
    const user = userEvent.setup();
    await renderCard('PROTEIN_ONLY');
    await user.press(screen.getByTestId('prefs-numbers-mode-full'));
    expect(mockSetNumbersMode).toHaveBeenCalledWith({ numbersMode: 'FULL' });
  });

  it('tapping the mode already chosen saves nothing', async () => {
    const user = userEvent.setup();
    await renderCard('PROTEIN_ONLY');
    await user.press(screen.getByTestId('prefs-numbers-mode-protein'));
    expect(mockSetNumbersMode).not.toHaveBeenCalled();
  });

  it('the Today toggle calls setHomeDisplay only', async () => {
    await renderCard('PROTEIN_ONLY', true);
    await fireEvent(screen.getByTestId('prefs-home-display-switch'), 'valueChange', false);
    expect(mockSetHomeDisplay).toHaveBeenCalledWith({ showNutritionOnToday: false });
    expect(mockSetNumbersMode).not.toHaveBeenCalled();
  });

  it('a saved mode invalidates every query so the other screens switch at once', async () => {
    await renderCard();
    mockNumbersOpts.onSuccess?.({ numbersMode: 'PROTEIN_ONLY' });
    expect(mockInvalidateAll).toHaveBeenCalledTimes(1);
  });

  it('in protein-only mode the suggested block is the protein number, with a Why sheet', async () => {
    const user = userEvent.setup();
    mockTargets = targets({
      effectiveG: 150,
      gPerKg: 1.9,
      referenceGPerKg: 1.6,
      referenceG: 128,
      differs: true,
      reason: 'LIFTER_GOAL',
      sentence: 'Your protein is 150 g a day because you train to build muscle.',
    });
    await renderCard('PROTEIN_ONLY');
    expect(screen.getByTestId('targets-suggested-protein')).toHaveTextContent(
      '150 g protein a day',
    );
    expect(screen.queryByTestId('targets-suggested-kcal')).toBeNull();
    await user.press(screen.getByTestId('targets-protein-why'));
    expect(await screen.findByTestId('protein-why-sheet-title')).toHaveTextContent(
      'Why this protein number?',
    );
    expect(
      screen.getByText('Your protein is 150 g a day because you train to build muscle.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('128 g')).toBeOnTheScreen();
  });

  it('the full numbers keep the calorie headline', async () => {
    await renderCard('FULL');
    expect(screen.getByTestId('targets-suggested-kcal')).toHaveTextContent('2,200 kcal');
    expect(screen.queryByTestId('targets-protein-why')).toBeNull();
  });
});

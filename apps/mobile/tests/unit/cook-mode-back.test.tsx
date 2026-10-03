import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CookModeScreen from '../../app/cook/[id]';
import { resetCookSessionsForTests } from '../../src/features/recipes/cook-session-store';

// UX-COOK-02 (WP-03): BACK closes the ingredients panel first, then confirms
// when cooking has started (step > 0); the step and the ticks survive leaving.
// The navigation layer is mocked: the mock records the latest
// (prevent, callback) pair, which is what the real hook hands the navigator —
// `prevent === true` is what also disables the iOS swipe-back.

type PreventCallback = (options: { data: { action: unknown } }) => void;
const mockPrevent: { value: boolean; callback: PreventCallback | null } = {
  value: false,
  callback: null,
};
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'r1' }),
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, callback: PreventCallback) => {
    mockPrevent.value = prevent;
    mockPrevent.callback = callback;
  },
}));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({
    memberCount: 0,
    tablePortions: null,
    portionSum: null,
    scaledMembers: null,
  }),
}));
jest.mock('../../src/hooks/use-cooking-for', () => ({ useCookingFor: () => null }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/features/recipes/star-rating', () => ({ StarRating: () => null }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    mealPlan: {
      getRecipe: {
        useQuery: () => ({
          isLoading: false,
          data: {
            id: 'r1',
            name: 'Lentil Curry',
            servings: 2,
            allergenWarnings: [],
            instructions: ['Chop the onion.', 'Simmer the lentils.', 'Season and serve.'],
            ingredients: [
              { name: 'lentils', quantity: 200, unit: 'g' },
              { name: 'onion', quantity: 1, unit: '' },
            ],
          },
        }),
      },
    },
    recipe: { getSafetyChecks: { useQuery: () => ({ data: { safetyChecks: null } }) } },
    tracker: {
      logRecipe: { useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false }) },
    },
  },
}));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const BACK_ACTION = { type: 'GO_BACK' };

function renderCook() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <CookModeScreen />
    </SafeAreaProvider>,
  );
}

/** A removal attempt: header ✕, iOS swipe or Android BACK reaching the navigator. */
const requestBack = async () => {
  await act(() => {
    mockPrevent.callback?.({ data: { action: BACK_ACTION } });
  });
};

const nextStep = () => fireEvent.press(screen.getByTestId('cook-next'));

beforeEach(() => {
  resetCookSessionsForTests();
  mockPrevent.value = false;
  mockPrevent.callback = null;
  mockDispatch.mockClear();
  mockGoBack.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Cook mode back navigation (UX-COOK-02)', () => {
  it('at step 1 with the panel closed, leaving is not held back', async () => {
    await renderCook();
    expect(mockPrevent.value).toBe(false);
  });

  it('mid-recipe, leaving asks first; "Keep cooking" stays on the same step', async () => {
    await renderCook();
    await nextStep();
    expect(mockPrevent.value).toBe(true);

    await requestBack();
    expect(screen.getByText('Leave cook mode?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cook-leave-cancel'));
    expect(screen.getByTestId('cook-step-text')).toHaveTextContent('Simmer the lentils.');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('"Leave" lets the blocked navigation through', async () => {
    await renderCook();
    await nextStep();
    await requestBack();
    await fireEvent.press(screen.getByTestId('cook-leave-confirm'));
    expect(mockDispatch).toHaveBeenCalledWith(BACK_ACTION);
  });

  it('BACK closes the ingredients panel first, with no confirm — even on step 1', async () => {
    await renderCook();
    await fireEvent.press(screen.getByTestId('cook-ingredients-toggle'));
    expect(screen.getByText('Ingredients')).toBeOnTheScreen();
    // The panel holds the iOS swipe too.
    expect(mockPrevent.value).toBe(true);

    await requestBack();
    expect(screen.queryByText('Ingredients')).toBeNull();
    expect(screen.queryByText('Leave cook mode?')).toBeNull();
    expect(screen.getByTestId('cook-step-text')).toBeOnTheScreen();
    expect(mockPrevent.value).toBe(false);
  });

  it('Android hardware BACK with the panel open closes it and does not exit', async () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers: BackListener[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    });
    await renderCook();
    await fireEvent.press(screen.getByTestId('cook-ingredients-toggle'));
    const handler = handlers[handlers.length - 1];
    let consumed: boolean | null | undefined;
    await act(() => {
      consumed = handler?.({ type: 'hardwareBackPress', timeStamp: 0 });
    });
    expect(consumed).toBe(true);
    expect(screen.queryByText('Ingredients')).toBeNull();
    expect(screen.queryByText('Leave cook mode?')).toBeNull();
  });

  it('re-entering resumes the step and the ticked ingredients', async () => {
    const first = await renderCook();
    await nextStep();
    await nextStep();
    await fireEvent.press(screen.getByTestId('cook-ingredients-toggle'));
    await fireEvent.press(screen.getByText(/onion/));
    await first.unmount();

    await renderCook();
    expect(screen.getByText('Step 3 of 3')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cook-ingredients-toggle'));
    const onion = screen.getByText(/onion/);
    expect(onion.props.className).toMatch(/line-through/);
  });

  it('finishing forgets the place: the next cook starts at step 1', async () => {
    const first = await renderCook();
    await nextStep();
    await nextStep();
    await nextStep(); // Finish
    expect(screen.getByTestId('cook-finished')).toBeOnTheScreen();
    expect(mockPrevent.value).toBe(false);
    await first.unmount();

    await renderCook();
    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
  });
});

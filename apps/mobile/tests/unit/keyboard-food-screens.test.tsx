import type { ReactNode } from 'react';
import type { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Input, KeyboardAwareScrollView, SEARCH_LIST_PROPS, Sheet } from '@chefer/ui-mobile';
import RecipesScreen from '../../app/(food)/recipes';
import MyWeeksScreen from '../../app/my-weeks';
import { WeightCard } from '../../src/features/coach/weight-card';
import { RecipePickerSheet } from '../../src/features/meal-plan/recipe-picker-sheet';

// WP-03 lane A: keyboard-aware scrolling on Today's weight card (UX-FOOD-08),
// My weeks (UX-PLAN-10) and the Input primitive (UX-FOOD-10), and the shared
// SearchField + list props on Cookbook and the Replace picker (UX-X-17).

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const Safe = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
);

const mockTemplates = [
  {
    id: 't1',
    name: 'Mediterranean week',
    mealsCount: 14,
    previewNames: ['Shakshuka'],
    isFollowed: false,
  },
];
const mockRecipes = [
  {
    id: 'r1',
    name: 'Lentil curry',
    imageUrl: null,
    cuisineType: 'Indian',
    prepTimeMins: 10,
    cookTimeMins: 20,
    nutritionInfo: { calories: 500, protein: 20, carbs: 60, fat: 10 },
    isFavourite: false,
    safetyChecks: { checked: [] },
  },
];
const mockRecipeListQuery = jest.fn((..._args: unknown[]) => ({
  data: mockRecipes,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
}));
const mutation = () => ({ mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() });

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Link: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../../src/features/history/past-weeks-section', () => ({
  PastWeeksSection: () => null,
}));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/safety/what-we-check-sheet', () => ({
  WhatWeCheckSheet: () => null,
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  AiConsentHost: () => null,
}));
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: {
      get: { useQuery: () => ({ data: { chefProfile: { preferredUnits: 'METRIC' } } }) },
    },
    useUtils: () => ({
      mealPlan: {
        listTemplates: { invalidate: jest.fn() },
        getForWeek: { invalidate: jest.fn() },
      },
      dashboard: { summary: { invalidate: jest.fn() } },
      tracker: { invalidate: jest.fn(), weightHistory: { invalidate: jest.fn() } },
      shoppingList: { invalidate: jest.fn() },
      gym: {
        stats: { bodyweight: { invalidate: jest.fn() } },
        bootstrap: { invalidate: jest.fn() },
      },
      recipe: {
        list: { cancel: jest.fn(), getData: jest.fn(), setData: jest.fn(), invalidate: jest.fn() },
        discover: { invalidate: jest.fn() },
      },
    }),
    mealPlan: {
      listTemplates: { useQuery: () => ({ data: mockTemplates, isLoading: false }) },
      getForWeek: { useQuery: () => ({ data: { planId: 'p1' } }) },
      saveAsTemplate: { useMutation: mutation },
      followTemplate: { useMutation: mutation },
      unfollowTemplate: { useMutation: mutation },
      renameTemplate: { useMutation: mutation },
      deleteTemplate: { useMutation: mutation },
    },
    tracker: {
      weightHistory: { useQuery: () => ({ data: [] }) },
      logWeight: { useMutation: mutation },
    },
    recipe: {
      list: { useQuery: (...args: unknown[]) => mockRecipeListQuery(...args) },
      listHiddenCount: { useQuery: () => ({ data: undefined }) },
      discover: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      discoverHiddenCount: { useQuery: () => ({ data: undefined }) },
      toggleFavourite: { useMutation: mutation },
    },
    safety: { getTable: { useQuery: () => ({ data: undefined }) } },
  },
}));

/** The mock TextInput class' prototype: spying on it intercepts every field's measureLayout/focus. */
async function textInputPrototype(): Promise<TextInput> {
  const holder: { node: TextInput | null } = { node: null };
  await render(
    <Input
      ref={(n) => {
        holder.node = n;
      }}
    />,
  );
  if (!holder.node) throw new Error('no TextInput ref');
  return Object.getPrototypeOf(holder.node) as TextInput;
}

function mockMeasure(proto: TextInput) {
  return jest
    .spyOn(proto, 'measureLayout')
    .mockImplementation(
      (_rel: unknown, onSuccess: (x: number, y: number, w: number, h: number) => void) =>
        onSuccess(0, 400, 0, 0),
    );
}

afterEach(() => jest.restoreAllMocks());

describe('Input inside keyboard-aware containers (UX-FOOD-10)', () => {
  it('scrolls itself into view on focus inside a KeyboardAwareScrollView', async () => {
    const proto = await textInputPrototype();
    const measure = mockMeasure(proto);
    await render(
      <KeyboardAwareScrollView>
        <Input testID="field" />
      </KeyboardAwareScrollView>,
    );
    await fireEvent(screen.getByTestId('field'), 'focus');
    expect(measure).toHaveBeenCalled();
  });

  it('scrolls itself into view on focus inside a Sheet body', async () => {
    const proto = await textInputPrototype();
    const measure = mockMeasure(proto);
    await render(
      <Safe>
        <Sheet visible onClose={jest.fn()} title="Quick add">
          <Input testID="sheet-field" />
        </Sheet>
      </Safe>,
    );
    await fireEvent(screen.getByTestId('sheet-field'), 'focus');
    expect(measure).toHaveBeenCalled();
  });

  it('still calls the caller’s own onFocus, and is a no-op outside a scroll container', async () => {
    const onFocus = jest.fn();
    await render(<Input testID="plain" onFocus={onFocus} />);
    await fireEvent(screen.getByTestId('plain'), 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});

describe('Today weight card in a keyboard-aware scroll (UX-FOOD-08)', () => {
  it('scrolls the weight field clear of the keyboard when focused', async () => {
    const proto = await textInputPrototype();
    const measure = mockMeasure(proto);
    await render(
      <KeyboardAwareScrollView testID="today-scroll">
        <WeightCard />
      </KeyboardAwareScrollView>,
    );
    expect(screen.getByTestId('today-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    await fireEvent(screen.getByTestId('weight-input'), 'focus');
    expect(measure).toHaveBeenCalled();
  });
});

describe('My weeks (UX-PLAN-10)', () => {
  it('scrolls in a keyboard-aware container whose taps land on the first press', async () => {
    await render(
      <Safe>
        <MyWeeksScreen />
      </Safe>,
    );
    expect(screen.getByTestId('my-weeks-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('my-weeks-save-name')).toBeOnTheScreen();
  });

  it('the rename field opens clear of the keyboard', async () => {
    const proto = await textInputPrototype();
    const measure = mockMeasure(proto);
    const user = userEvent.setup();
    await render(
      <Safe>
        <MyWeeksScreen />
      </Safe>,
    );
    await user.press(screen.getByLabelText('Rename Mediterranean week'));
    await fireEvent(screen.getByTestId('my-weeks-rename-input'), 'focus');
    expect(measure).toHaveBeenCalled();
  });
});

describe('Cookbook search (UX-X-17)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses the shared SearchField: search key, clear button, list dismisses on drag', async () => {
    await render(
      <Safe>
        <RecipesScreen />
      </Safe>,
    );
    const input = screen.getByTestId('recipes-search');
    expect(input.props.returnKeyType).toBe('search');
    expect(screen.queryByLabelText('Clear search')).toBeNull();

    await fireEvent.changeText(input, 'curry');
    expect(screen.getByLabelText('Clear search')).toBeOnTheScreen();
    expect(screen.getByTestId('recipes-search').props.value).toBe('curry');

    const list = screen.getByTestId('recipes-list');
    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(SEARCH_LIST_PROPS.keyboardDismissMode).toBe('on-drag');
  });

  it('clearing shows the full list at once, without waiting out the debounce', async () => {
    await render(
      <Safe>
        <RecipesScreen />
      </Safe>,
    );
    await fireEvent.changeText(screen.getByTestId('recipes-search'), 'curry');
    await act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(mockRecipeListQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'curry' }),
      expect.anything(),
    );

    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByTestId('recipes-search').props.value).toBe('');
    expect(mockRecipeListQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined }),
      expect.anything(),
    );
  });
});

describe('Replace picker search (UX-X-17)', () => {
  it('uses the shared SearchField and a list that dismisses the keyboard on drag', async () => {
    await render(
      <Safe>
        <RecipePickerSheet
          visible
          mealName="Dinner"
          busy={false}
          error={null}
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </Safe>,
    );
    const input = screen.getByTestId('picker-search');
    expect(input.props.returnKeyType).toBe('search');
    await fireEvent.changeText(input, 'lentil');
    expect(screen.getByLabelText('Clear search')).toBeOnTheScreen();
    const list = screen.getByTestId('picker-list');
    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  });
});

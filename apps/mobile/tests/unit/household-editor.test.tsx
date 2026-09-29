import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { HouseholdEditor } from '../../src/features/household/household-editor';

// Backlog P2-3: members (and their allergies + restrictions) are free on
// every tier; removing one asks first (F-ONB-3-2); scaling is the premium
// upsell. T-01.7: allergies/diet/dislikes are now set through the shared
// SafetyPicker in a Sheet ("Allergies & diet for {name}"), not free-text
// inputs — Sheet needs a SafeAreaProvider ancestor in tests.

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderEditor(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockUpdateSafety = jest.fn();
const mockPush = jest.fn();
const mockOpenPremium = jest.fn();
let mockMembers: Record<string, unknown>[] = [];
let mockIsPremium: boolean | undefined = false;
let mockTable: { people: unknown[]; hasRules: boolean; needsReview: boolean } = {
  people: [],
  hasRules: false,
  needsReview: false,
};

// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in health-consent.test.tsx, so here consent is always on record.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

jest.mock('../../src/hooks/use-is-premium', () => ({
  useIsPremium: () => mockIsPremium,
}));

jest.mock('../../src/features/premium/open-premium', () => ({
  openPremium: (...args: unknown[]) => {
    mockOpenPremium(...args);
  },
}));
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
}));

jest.mock('../../src/lib/trpc', () => {
  const invalidate = () => Promise.resolve();
  return {
    trpc: {
      useUtils: () => ({
        household: { list: { invalidate } },
        preferences: { get: { invalidate } },
        mealPlan: { invalidate },
        shoppingList: { getForWeek: { invalidate } },
        safety: { getTable: { invalidate } },
      }),
      preferences: {
        get: {
          useQuery: () => ({
            data: { dietaryPreferences: { allergies: ['Shellfish'], dietaryRestrictions: [] } },
          }),
        },
        updateSafety: {
          useMutation: () => ({ mutate: mockUpdateSafety, isPending: false }),
        },
      },
      safety: {
        getTable: { useQuery: () => ({ data: mockTable }) },
      },
      household: {
        list: { useQuery: () => ({ data: mockMembers, isLoading: false }) },
        add: {
          useMutation: () => ({ mutate: mockAdd, isPending: false, isError: false, error: null }),
        },
        update: {
          useMutation: () => ({ mutate: mockUpdate, isPending: false, error: null }),
        },
        remove: { useMutation: () => ({ mutate: mockRemove, isPending: false }) },
      },
    },
  };
});

const sam = {
  id: 'm1',
  name: 'Sam',
  portionFactor: 0.5,
  isKid: true,
  allergies: ['Peanuts'],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMembers = [];
  mockIsPremium = false;
  mockTable = { people: [], hasRules: false, needsReview: false };
});

describe('HouseholdEditor', () => {
  it('a FREE user adds a kid with allergies and a diet, set through the SafetyPicker sheet', async () => {
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);

    await user.press(screen.getByTestId('household-preset-kid'));
    await user.type(screen.getByTestId('household-name'), 'Sam');
    await user.press(screen.getByTestId('household-safety-open'));
    await user.press(screen.getByText('Peanuts'));
    await user.press(screen.getByText('Vegetarian'));
    await user.press(screen.getByTestId('household-member-safety-done'));
    expect(screen.getByTestId('household-safety-summary')).toHaveTextContent(
      /allergic: Peanuts.*Vegetarian/,
    );

    await user.press(screen.getByTestId('household-add'));

    expect(mockAdd).toHaveBeenCalledWith({
      name: 'Sam',
      portionFactor: 0.5,
      isKid: true,
      allergies: ['Peanuts'],
      dietaryRestrictions: ['Vegetarian'],
      dislikedIngredients: [],
    });
  });

  it('removing a member asks for confirmation first', async () => {
    mockMembers = [sam];
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);

    await user.press(screen.getByTestId('household-remove-m1'));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.getByText(/stop applying to your plans/)).toBeOnTheScreen();

    await user.press(screen.getByTestId('household-confirm-remove-m1'));
    expect(mockRemove).toHaveBeenCalledWith({ id: 'm1' });
  });

  it('free tables see that scaling is premium; premium does not', async () => {
    mockMembers = [sam];
    await renderEditor(<HouseholdEditor />);
    expect(screen.getByTestId('household-upsell')).toBeOnTheScreen();
    expect(screen.getByText(/sized for one portion/)).toBeOnTheScreen();

    mockIsPremium = true;
    await renderEditor(<HouseholdEditor />);
    expect(screen.queryByTestId('household-upsell')).toBeNull();
  });

  it('any tier edits an existing member in place, pre-filling the SafetyPicker (F-PM-12)', async () => {
    mockMembers = [sam];
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);

    await user.press(screen.getByTestId('household-edit-m1'));
    expect(screen.getByTestId('household-form-title')).toHaveTextContent('Edit Sam');
    expect(screen.getByTestId('household-safety-summary')).toHaveTextContent(/allergic: Peanuts/);

    await user.clear(screen.getByTestId('household-name'));
    await user.type(screen.getByTestId('household-name'), 'Samuel');
    await user.press(screen.getByTestId('household-portion-0.75'));
    await user.press(screen.getByTestId('household-add'));

    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'm1',
      name: 'Samuel',
      portionFactor: 0.75,
      isKid: true,
      allergies: ['Peanuts'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('cancelling an edit returns the form to "Add someone"', async () => {
    mockMembers = [sam];
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);
    await user.press(screen.getByTestId('household-edit-m1'));
    await user.press(screen.getByTestId('household-edit-cancel'));
    expect(screen.getByTestId('household-form-title')).toHaveTextContent('Add someone');
    expect(screen.getByTestId('household-name').props.value).toBe('');
  });

  it('the free ghost reflects the chip tapped: the kid chip shows Sam, ½ portion, peanuts', async () => {
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);
    expect(screen.queryByTestId('household-ghost-sample')).toBeNull();

    await user.press(screen.getByTestId('household-preset-kid'));
    const ghost = screen.getByTestId('household-ghost-sample');
    expect(ghost).toHaveTextContent(/your week with Sam/);
    expect(ghost).toHaveTextContent(/½ portion, allergic to peanuts/);
    // Merged with the owner's own diet.
    expect(screen.getByTestId('household-ghost-rules')).toHaveTextContent(
      'Combined table rules: no shellfish · no peanuts',
    );

    await user.press(screen.getByTestId('household-preset-partner'));
    expect(screen.getByTestId('household-ghost-sample')).toHaveTextContent(/your week with Alex/);

    await user.press(screen.getByTestId('household-ghost-upgrade'));
    expect(mockOpenPremium).toHaveBeenCalledWith('household');
  });

  it('premium tables get no ghost', async () => {
    mockIsPremium = true;
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);
    await user.press(screen.getByTestId('household-preset-kid'));
    expect(screen.queryByTestId('household-ghost-sample')).toBeNull();
  });

  it('the onboarding variant skips the empty card, the upsell and the You card', async () => {
    await renderEditor(<HouseholdEditor variant="onboarding" />);
    expect(screen.queryByTestId('household-empty')).toBeNull();
    expect(screen.queryByTestId('household-upsell')).toBeNull();
    expect(screen.queryByTestId('household-you-card')).toBeNull();
    expect(screen.getByTestId('household-add')).toBeOnTheScreen();
  });

  it('a "You" card is always first on the screen variant (UX-01)', async () => {
    await renderEditor(<HouseholdEditor />);
    expect(screen.getByTestId('household-you-card')).toBeOnTheScreen();
  });

  it('shows the table read-back summary once the table has rules (CI-41)', async () => {
    mockMembers = [sam];
    mockTable = {
      people: [
        { who: 'you', isOwner: true, items: [], notes: [] },
        {
          who: 'Sam',
          isOwner: false,
          items: [{ id: 'peanuts', label: 'Peanuts', kind: 'allergy' }],
          notes: [],
        },
      ],
      hasRules: true,
      needsReview: false,
    };
    await renderEditor(<HouseholdEditor />);
    expect(screen.getByTestId('household-table-summary')).toHaveTextContent(
      '2 at the table · we’ll check for Peanuts (Sam)',
    );
  });
});

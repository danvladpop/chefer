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
const mockRefetchList = jest.fn();
const mockRefetchPrefs = jest.fn();
// UX-ACC-03: the two loads the editor builds on can fail independently.
let mockListState: Record<string, unknown> = {};
let mockPrefsState: Record<string, unknown> = {};
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
          useQuery: () => mockPrefsState,
        },
        updateSafety: {
          useMutation: () => ({ mutate: mockUpdateSafety, isPending: false }),
        },
      },
      safety: {
        getTable: { useQuery: () => ({ data: mockTable }) },
      },
      household: {
        list: { useQuery: () => ({ data: mockMembers, isLoading: false, ...mockListState }) },
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
  mockListState = { refetch: mockRefetchList };
  mockPrefsState = {
    data: { dietaryPreferences: { allergies: ['Shellfish'], dietaryRestrictions: [] } },
    isError: false,
    refetch: mockRefetchPrefs,
  };
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

  it('UX-PLAN-12: age chips appear for a kid only, pre-fill the portion and are sent with the member', async () => {
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);

    // Not a kid yet: no age chips.
    expect(screen.queryByTestId('household-age-group')).toBeNull();

    await user.press(screen.getByTestId('household-preset-kid'));
    expect(screen.getByTestId('household-age-group')).toBeOnTheScreen();
    await user.type(screen.getByTestId('household-name'), 'Ana');
    await user.press(screen.getByTestId('household-age-TEEN'));
    expect(screen.getByTestId('household-age-TEEN').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('household-age-TEEN').props.accessibilityLabel).toBe('Age 14–17');
    // The portion is pre-filled but stays adjustable.
    expect(screen.getByTestId('household-portion-1.25').props.accessibilityState).toMatchObject({
      selected: true,
    });
    await user.press(screen.getByTestId('household-portion-1'));
    await user.press(screen.getByTestId('household-add'));

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ana', isKid: true, ageBand: 'TEEN', portionFactor: 1 }),
    );
  });

  it('UX-PLAN-12: shows the stored band on the member and can clear it', async () => {
    mockMembers = [{ ...sam, ageBand: 'CHILD' }];
    const user = userEvent.setup();
    await renderEditor(<HouseholdEditor />);
    expect(screen.getByText('Kid · 4–8')).toBeOnTheScreen();

    await user.press(screen.getByTestId('household-edit-m1'));
    expect(screen.getByTestId('household-age-CHILD').props.accessibilityState).toMatchObject({
      selected: true,
    });
    await user.press(screen.getByTestId('household-age-CHILD')); // tap again = none
    await user.press(screen.getByTestId('household-add'));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', isKid: true, ageBand: null }),
    );
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

  // UX-ACC-01: a term typed in "Something else?" but never confirmed with "+"
  // must be in what Done / Save stores.
  describe('a typed-but-unadded "Something else?" term', () => {
    it('is added by Done on the member sheet and saved with the member', async () => {
      const user = userEvent.setup();
      await renderEditor(<HouseholdEditor />);
      await user.type(screen.getByTestId('household-name'), 'Sam');
      await user.press(screen.getByTestId('household-safety-open'));
      await user.press(screen.getByText('Dairy'));
      await user.type(screen.getByTestId('household-member-something-else-input'), 'sesame');
      await user.press(screen.getByTestId('household-member-safety-done'));

      expect(screen.getByTestId('household-safety-summary')).toHaveTextContent(/Sesame/);
      await user.press(screen.getByTestId('household-add'));
      expect(mockAdd).toHaveBeenCalledTimes(1);
      const [payload] = mockAdd.mock.calls[0] as [{ allergies: string[] }];
      expect(payload.allergies).toEqual(expect.arrayContaining(['Dairy', 'Sesame']));
    });

    it('holds the member sheet open when the term still needs a Keep/Remove choice', async () => {
      const user = userEvent.setup();
      await renderEditor(<HouseholdEditor />);
      await user.type(screen.getByTestId('household-name'), 'Sam');
      await user.press(screen.getByTestId('household-safety-open'));
      await user.type(screen.getByTestId('household-member-something-else-input'), 'zzqqxx');
      await user.press(screen.getByTestId('household-member-safety-done'));

      expect(screen.getByTestId('household-member-save-blocked')).toHaveTextContent(/zzqqxx/);
      expect(screen.getByTestId('household-member-safety-done')).toBeOnTheScreen();
      expect(screen.getByTestId('household-member-unchecked-notice')).toBeOnTheScreen();
    });

    it('is added by Save on the "You" sheet and sent with your existing allergies', async () => {
      const user = userEvent.setup();
      await renderEditor(<HouseholdEditor />);
      await user.press(screen.getByTestId('household-you-card'));
      await user.type(screen.getByTestId('household-you-something-else-input'), 'sesame');
      await user.press(screen.getByTestId('household-you-save'));

      expect(mockUpdateSafety).toHaveBeenCalledTimes(1);
      const [payload] = mockUpdateSafety.mock.calls[0] as [{ allergies: string[] }];
      expect(payload.allergies).toEqual(expect.arrayContaining(['Shellfish', 'Sesame']));
    });
  });

  // UX-ACC-03: a failed load must never look like "Just you", and "You" must
  // never be editable from data that never arrived (saving it replaces the
  // stored allergies).
  describe('when a load fails', () => {
    it('shows an error with Retry instead of "Just you at the table"', async () => {
      mockListState = {
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetchList,
      };
      const user = userEvent.setup();
      await renderEditor(<HouseholdEditor />);

      expect(screen.getByTestId('household-load-error')).toBeOnTheScreen();
      expect(screen.queryByTestId('household-empty')).toBeNull();
      expect(screen.queryByTestId('household-form')).toBeNull();
      await user.press(screen.getByTestId('household-load-error-retry'));
      expect(mockRefetchList).toHaveBeenCalled();
    });

    it('does not offer "You" until the saved preferences loaded', async () => {
      mockPrefsState = { data: undefined, isError: true, refetch: mockRefetchPrefs };
      const user = userEvent.setup();
      await renderEditor(<HouseholdEditor />);

      expect(screen.queryByTestId('household-you-card')).toBeNull();
      expect(screen.getByTestId('household-you-unavailable')).toHaveTextContent(/Couldn’t load/);
      await user.press(screen.getByTestId('household-you-retry'));
      expect(mockRefetchPrefs).toHaveBeenCalled();
      expect(mockUpdateSafety).not.toHaveBeenCalled();
    });
  });
});

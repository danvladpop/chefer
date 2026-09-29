import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MigrationCard } from '../../src/features/safety/migration-card';

// T-01.3 — the one-time free-text migration card (UX-01 (b), AC9). Until
// confirmed, the filter over-blocks (old literal match + new mapping).

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderCard(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

const mockConfirm = jest.fn();
const mockUpdateSafety = jest.fn();
let mockTable: { people: unknown[]; hasRules: boolean; needsReview: boolean } = {
  people: [],
  hasRules: false,
  needsReview: false,
};
let mockPrefs: {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
} = {
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      safety: { getTable: { invalidate: () => Promise.resolve() } },
      preferences: { get: { invalidate: () => Promise.resolve() } },
      mealPlan: { invalidate: () => Promise.resolve() },
    }),
    safety: {
      getTable: { useQuery: () => ({ data: mockTable }) },
      confirmReview: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (...a: unknown[]) => {
            mockConfirm(...a);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
    preferences: {
      get: { useQuery: () => ({ data: { dietaryPreferences: mockPrefs } }) },
      updateSafety: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (...a: unknown[]) => {
            mockUpdateSafety(...a);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockTable = { people: [], hasRules: false, needsReview: false };
  mockPrefs = { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] };
});

describe('MigrationCard (T-01.3)', () => {
  it('renders nothing when nothing needs review', async () => {
    await renderCard(<MigrationCard />);
    expect(screen.queryByTestId('safety-migration-card')).toBeNull();
  });

  it('maps legacy free text and confirms with "Looks right" (AC9)', async () => {
    mockTable = { people: [], hasRules: true, needsReview: true };
    mockPrefs = {
      allergies: ['tree nuts'],
      dietaryRestrictions: ['no eggs'],
      dislikedIngredients: ['pre-diabetes'],
    };
    await renderCard(<MigrationCard />);
    expect(screen.getByText('“tree nuts” → Tree nuts')).toBeTruthy();
    expect(screen.getByText('“no eggs” → Vegetarian, no eggs')).toBeTruthy();
    expect(screen.getByText('“pre-diabetes” → can’t check (note)')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('safety-migration-card-looks-right'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('"Change" opens the SafetyPicker pre-applied, saving updates and confirms together', async () => {
    mockTable = { people: [], hasRules: true, needsReview: true };
    mockPrefs = { allergies: ['tree nuts'], dietaryRestrictions: [], dislikedIngredients: [] };
    await renderCard(<MigrationCard />);
    await fireEvent.press(screen.getByTestId('safety-migration-card-change'));
    const chip = screen.getByRole('button', { name: 'Tree nuts' }).props as {
      accessibilityState?: { selected?: boolean };
    };
    expect(chip.accessibilityState?.selected).toBe(true);

    // Untouched, Save re-sends the same stored value (canonicalising only
    // happens on a chip the user actually toggles) and confirms in the same
    // flow.
    await fireEvent.press(screen.getByTestId('safety-migration-card-change-save'));
    expect(mockUpdateSafety).toHaveBeenCalledWith(
      expect.objectContaining({ allergies: ['tree nuts'] }),
    );
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });
});

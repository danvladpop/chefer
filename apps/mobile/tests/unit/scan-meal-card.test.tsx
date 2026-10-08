import { Linking } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ScanMealCard } from '../../src/features/tracker/scan-meal-card';

// Bug B-36 (default meal slot by hour), B-37 (camera-denied notice + a way
// out), B-44 (Today lagging the tracker after a snap log — one shared
// invalidateDayQueries()).

const mockMutate = jest.fn();
const mockUndo = jest.fn();
const mockSnackbarShow = jest.fn();
const mockScan = jest.fn();
const mockInvalidate = jest.fn();
const mockRecordRebalance = jest.fn();
const mockRequestAiConsent = jest.fn((_kind: string, run: () => void) => run());
const mockMutation: {
  isPending: boolean;
  isError: boolean;
  error: { message: string } | null;
  onSuccess?: (data: unknown, vars: unknown) => void;
} = { isPending: false, isError: false, error: null };

jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return { ...actual, useSnackbar: () => ({ show: mockSnackbarShow }) };
});

jest.mock('../../src/lib/media-client', () => ({
  ...jest.requireActual<typeof import('../../src/lib/media-client')>('../../src/lib/media-client'),
  scanMealPhoto: (...args: unknown[]): unknown => mockScan(...args),
}));
jest.mock('../../src/lib/prepare-photo', () => ({
  photoPickerOptions: () => ({}),
  preparePhoto: () => Promise.resolve({ bytes: new Uint8Array([1]), mime: 'image/jpeg' }),
}));

jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ enabled: true, isPremium: true, limit: null }),
}));

jest.mock('../../src/features/tracker/rebalance-store', () => ({
  recordRebalance: (result: unknown) => {
    mockRecordRebalance(result);
  },
}));

jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => mockRequestAiConsent,
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: mockInvalidate },
        weeklySummary: { invalidate: mockInvalidate },
        monthlySummary: { invalidate: mockInvalidate },
        recents: { invalidate: mockInvalidate },
      },
      dashboard: { summary: { invalidate: mockInvalidate } },
    }),
    tracker: {
      logCustomMeal: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => {
          mockMutation.onSuccess = opts.onSuccess;
          return { ...mockMutation, mutate: mockMutate, reset: jest.fn() };
        },
      },
      deleteCustomMeal: {
        useMutation: () => ({ mutate: mockUndo, isPending: false }),
      },
    },
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockMutation.isError = false;
  mockMutation.error = null;
});

const onLogged = jest.fn();

async function renderCard() {
  await render(<ScanMealCard date="2026-09-27" onLogged={onLogged} />);
}

describe('ScanMealCard', () => {
  // UX-ACC-13: the post-upgrade "Snap your next meal" CTA lands on the tracker
  // with `snap=1` — the picker opens by itself, behind AI consent, exactly once.
  it('UX-ACC-13: autoPick opens the photo library once, after consent', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: true,
    } as never);
    const onAutoPicked = jest.fn();
    const { rerender } = await render(
      <ScanMealCard date="2026-09-27" onLogged={onLogged} autoPick onAutoPicked={onAutoPicked} />,
    );
    expect(mockRequestAiConsent).toHaveBeenCalledWith('meal-scan', expect.any(Function));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(onAutoPicked).toHaveBeenCalledTimes(1);
    // A re-render with the param still set does not reopen the picker.
    await rerender(
      <ScanMealCard date="2026-09-27" onLogged={onLogged} autoPick onAutoPicked={onAutoPicked} />,
    );
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it('UX-ACC-13: without autoPick nothing opens by itself', async () => {
    await renderCard();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(mockRequestAiConsent).not.toHaveBeenCalled();
  });

  it('bug B-37: a denied camera permission shows a muted notice with a way out', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
      granted: false,
    } as never);
    const user = userEvent.setup();
    await renderCard();

    await user.press(screen.getByTestId('scan-camera'));

    expect(await screen.findByTestId('scan-open-settings')).toBeTruthy();
    expect(screen.getByTestId('scan-choose-photo-instead')).toBeTruthy();
    // No raw red error text for this case.
    expect(screen.queryByText(/Camera access is needed/i)).toBeNull();
  });

  it('bug B-37: "Open Settings" opens the OS settings screen', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
      granted: false,
    } as never);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const user = userEvent.setup();
    await renderCard();

    await user.press(screen.getByTestId('scan-camera'));
    await user.press(await screen.findByTestId('scan-open-settings'));

    expect(openSettings).toHaveBeenCalled();
  });

  it('bug B-37: "Choose a photo instead" falls back to the library picker', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
      granted: false,
    } as never);
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: true,
    } as never);
    const user = userEvent.setup();
    await renderCard();

    await user.press(screen.getByTestId('scan-camera'));
    await user.press(await screen.findByTestId('scan-choose-photo-instead'));

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
  });

  it('bug B-44: logging a scan invalidates the day, weekly/monthly summaries and Today', async () => {
    await renderCard();
    const rebalance = null;
    await act(() => {
      mockMutation.onSuccess?.({ log: {}, rebalance }, { name: 'Soup' });
    });
    expect(mockRecordRebalance).toHaveBeenCalledWith(rebalance);
    expect(mockInvalidate).toHaveBeenCalledWith({ date: '2026-09-27' });
    // getDay, weeklySummary, monthlySummary, dashboard.summary
    expect(mockInvalidate.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(onLogged).toHaveBeenCalled();
  });

  // UX-FOOD-26 — the Snap result card.
  describe('result card (UX-FOOD-26)', () => {
    const ESTIMATE = {
      dishName: 'Grilled chicken with rice, roasted vegetables and a lemon tahini dressing',
      confidence: 'med' as const,
      kcal: 500,
      protein: 40,
      carbs: 50,
      fat: 10,
      portionNote: 'about 400 g',
    };

    const scanOnePhoto = async () => {
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///meal.jpg', base64: 'AA==', mimeType: 'image/jpeg' }],
      } as never);
      mockScan.mockResolvedValue(ESTIMATE);
      const user = userEvent.setup();
      await renderCard();
      await user.press(screen.getByTestId('scan-library'));
      await screen.findByTestId('scan-log');
      return user;
    };

    it('shows the photo thumbnail and a two-line dish name', async () => {
      await scanOnePhoto();
      expect(screen.getByTestId('scan-photo').props.source).toEqual({ uri: 'file:///meal.jpg' });
      expect(screen.getByTestId('scan-dish-name').props.numberOfLines).toBe(2);
    });

    it('lets the user correct the calories, scaling the macros with them', async () => {
      const user = await scanOnePhoto();
      expect(screen.getByTestId('scan-log')).toHaveTextContent('Log 500 kcal');

      await user.clear(screen.getByTestId('scan-kcal'));
      await user.type(screen.getByTestId('scan-kcal'), '250');
      expect(screen.getByTestId('scan-log')).toHaveTextContent('Log 250 kcal');
      expect(screen.getByTestId('scan-macros')).toHaveTextContent('20g P · 25g C · 5g F');

      await user.press(screen.getByTestId('scan-log'));
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          estimatedBy: 'vision',
          kcal: 250,
          protein: 20,
          carbs: 25,
          fat: 5,
        }),
      );
    });

    // WP-06 "Ate something else" → Snap: the estimate replaces the slot, which decides the meal.
    it("aimed at a plan slot, logs the estimate as that slot's replacement with no meal picker", async () => {
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///meal.jpg', base64: 'AA==', mimeType: 'image/jpeg' }],
      } as never);
      mockScan.mockResolvedValue(ESTIMATE);
      const user = userEvent.setup();
      await render(
        <ScanMealCard
          date="2026-09-27"
          onLogged={onLogged}
          replacesSlot={{ mealType: 'dinner', slotIndex: 2 }}
        />,
      );
      await user.press(screen.getByTestId('scan-library'));
      await user.press(await screen.findByTestId('scan-log'));
      expect(screen.queryByText('breakfast')).toBeNull();
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          estimatedBy: 'vision',
          mealType: 'dinner',
          replacesSlot: { mealType: 'dinner', slotIndex: 2 },
        }),
      );
    });

    it('cannot log zero calories', async () => {
      const user = await scanOnePhoto();
      await user.clear(screen.getByTestId('scan-kcal'));
      expect(screen.getByTestId('scan-log')).toBeDisabled();
    });

    it('confirms the log with a snackbar whose Undo deletes exactly that entry', async () => {
      await scanOnePhoto();
      await act(() => {
        mockMutation.onSuccess?.(
          { log: {}, rebalance: null, entryId: 'e-42' },
          { name: ESTIMATE.dishName },
        );
      });

      expect(mockSnackbarShow).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Logged ${ESTIMATE.dishName}`,
          actionLabel: 'Undo',
          tone: 'success',
        }),
      );
      const [{ onAction }] = mockSnackbarShow.mock.calls[0] as [{ onAction: () => void }];
      onAction();
      expect(mockUndo).toHaveBeenCalledWith({ date: '2026-09-27', entryId: 'e-42' });
    });

    it('offers no Undo when an older server answers without an entry id', async () => {
      await renderCard();
      await act(() => {
        mockMutation.onSuccess?.({ log: {}, rebalance: null }, { name: 'Soup' });
      });
      const [options] = mockSnackbarShow.mock.calls[0] as [Record<string, unknown>];
      expect(options).not.toHaveProperty('actionLabel');
    });
  });
});

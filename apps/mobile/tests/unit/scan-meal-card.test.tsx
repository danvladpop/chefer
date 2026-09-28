import { Linking } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ScanMealCard } from '../../src/features/tracker/scan-meal-card';

// Bug B-36 (default meal slot by hour), B-37 (camera-denied notice + a way
// out), B-44 (Today lagging the tracker after a snap log — one shared
// invalidateDayQueries()).

const mockMutate = jest.fn();
const mockInvalidate = jest.fn();
const mockRecordRebalance = jest.fn();
const mockRequestAiConsent = jest.fn((_kind: string, run: () => void) => run());
const mockMutation: {
  isPending: boolean;
  isError: boolean;
  error: { message: string } | null;
  onSuccess?: (data: unknown) => void;
} = { isPending: false, isError: false, error: null };

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
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => {
          mockMutation.onSuccess = opts.onSuccess;
          return { ...mockMutation, mutate: mockMutate, reset: jest.fn() };
        },
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
      mockMutation.onSuccess?.({ log: {}, rebalance });
    });
    expect(mockRecordRebalance).toHaveBeenCalledWith(rebalance);
    expect(mockInvalidate).toHaveBeenCalledWith({ date: '2026-09-27' });
    // getDay, weeklySummary, monthlySummary, dashboard.summary
    expect(mockInvalidate.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(onLogged).toHaveBeenCalled();
  });
});

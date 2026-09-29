import { render, screen, userEvent } from '@testing-library/react-native';
import { openPremium } from '../../src/features/premium/open-premium';
import { ScanMealCard } from '../../src/features/tracker/scan-meal-card';

// T-10.6 / bug B-35 / AC10: Snap to log on a free plan is a labelled taste for
// a food-job user — and nothing at all for a gym-only user. The taste sends
// nothing (no camera, no AI call): it only opens the premium sheet.

let mockEntitlement: { enabled: boolean; isPremium: boolean | undefined } = {
  enabled: false,
  isPremium: false,
};
let mockJobs: string[] = ['PLAN_MEALS'];
const mockRequestAiConsent = jest.fn();

jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ ...mockEntitlement, limit: null }),
}));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => mockRequestAiConsent,
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    preferences: { get: { useQuery: () => ({ data: { jobs: mockJobs } }) } },
    tracker: {
      logCustomMeal: {
        useMutation: () => ({ isPending: false, isError: false, error: null, mutate: jest.fn() }),
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
  mockEntitlement = { enabled: false, isPremium: false };
  mockJobs = ['PLAN_MEALS'];
});

const renderCard = () => render(<ScanMealCard date="2026-09-29" onLogged={jest.fn()} />);

describe('Snap to log on a free plan (B-35)', () => {
  it('a free food-job user sees a labelled example and "See what Premium adds"', async () => {
    const user = userEvent.setup();
    await renderCard();
    expect(screen.getByTestId('scan-taste')).toBeOnTheScreen();
    expect(screen.getByText('Snap to log')).toBeOnTheScreen();
    expect(
      screen.getByText('Photograph a restaurant meal and get an estimate in seconds.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Example')).toBeOnTheScreen();
    expect(screen.getByText('~620 kcal · 40 g protein')).toBeOnTheScreen();
    // No camera, no library: nothing here can send a photo.
    expect(screen.queryByTestId('scan-camera')).toBeNull();
    expect(screen.queryByTestId('scan-library')).toBeNull();

    await user.press(screen.getByTestId('scan-taste-premium'));
    expect(openPremium).toHaveBeenCalledWith('snap-scan');
    // The taste is static: it asks no AI consent because it sends nothing.
    expect(mockRequestAiConsent).not.toHaveBeenCalled();
  });

  it('a gym-only user never sees it', async () => {
    mockJobs = ['TRAIN'];
    await renderCard();
    expect(screen.queryByTestId('scan-taste')).toBeNull();
    expect(screen.queryByTestId('scan-meal-card')).toBeNull();
  });

  it('a user whose jobs are still unknown sees nothing yet', async () => {
    mockJobs = [];
    await renderCard();
    expect(screen.queryByTestId('scan-taste')).toBeNull();
  });

  it('premium gets the real card (with the AI consent gate on its camera and library)', async () => {
    mockEntitlement = { enabled: true, isPremium: true };
    const user = userEvent.setup();
    await renderCard();
    expect(screen.queryByTestId('scan-taste')).toBeNull();
    expect(screen.getByTestId('scan-meal-card')).toBeOnTheScreen();
    await user.press(screen.getByTestId('scan-camera'));
    expect(mockRequestAiConsent).toHaveBeenCalledWith('meal-scan', expect.any(Function));
  });
});

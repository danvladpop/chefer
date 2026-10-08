import { fireEvent, render, screen } from '@testing-library/react-native';
import { AnalyticsConsentCard } from '../../src/features/profile/analytics-consent-card';

// T-12.3: "Send anonymous usage counts" (default on, Q-8) and "Link usage to
// my account" (default off, disabled while anonymous is off). Every change
// is logged server-side via privacy.recordAnalyticsConsent (T-39.2).

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
}));

let mockConsent = { anonymous: true, linked: false };
const mockSetConsent = jest.fn((next: Partial<typeof mockConsent>) => {
  mockConsent =
    next.anonymous === false ? { anonymous: false, linked: false } : { ...mockConsent, ...next };
  return mockConsent;
});
const mockRecordConsentMutate = jest.fn();
const mockTrack = jest.fn();

let mockTransportEnabled = true;
jest.mock('../../src/lib/analytics', () => ({
  isTransportEnabled: () => mockTransportEnabled,
  getAnalyticsConsent: () => mockConsent,
  setAnalyticsConsent: (next: Partial<{ anonymous: boolean; linked: boolean }>) =>
    mockSetConsent(next),
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    privacy: {
      recordAnalyticsConsent: { useMutation: () => ({ mutate: mockRecordConsentMutate }) },
    },
  },
}));

beforeEach(() => {
  mockTransportEnabled = true;
  mockConsent = { anonymous: true, linked: false };
  mockSetConsent.mockClear();
  mockRecordConsentMutate.mockClear();
  mockTrack.mockClear();
  mockPush.mockClear();
});

describe('mobile AnalyticsConsentCard', () => {
  it('renders nothing when the analytics transport is disabled (R-08)', async () => {
    mockTransportEnabled = false;
    await render(<AnalyticsConsentCard />);
    expect(screen.queryByTestId('profile-analytics-consent')).toBeNull();
    expect(screen.queryByTestId('profile-analytics-anonymous-switch')).toBeNull();
  });

  it('opens the Privacy Policy in the app, at its analytics section (UX-ACC-19)', async () => {
    await render(<AnalyticsConsentCard />);
    await fireEvent.press(screen.getByText('Privacy policy'));
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy?anchor=analytics');
  });

  it('defaults to anonymous on, linked off', async () => {
    await render(<AnalyticsConsentCard />);
    expect(screen.getByTestId('profile-analytics-anonymous-switch').props.value).toBe(true);
    expect(screen.getByTestId('profile-analytics-linked-switch').props.value).toBe(false);
  });

  it('turning linking on saves it locally and logs it server-side', async () => {
    await render(<AnalyticsConsentCard />);

    await fireEvent(screen.getByTestId('profile-analytics-linked-switch'), 'valueChange', true);

    expect(mockSetConsent).toHaveBeenCalledWith({ linked: true });
    expect(mockRecordConsentMutate).toHaveBeenCalledWith({ linked: true });
    expect(mockTrack).toHaveBeenCalledWith('analytics_consent_changed', {
      anonymous: true,
      linked: true,
    });
  });

  it('turning anonymous off also turns linking off, and logs both', async () => {
    await render(<AnalyticsConsentCard />);

    await fireEvent(screen.getByTestId('profile-analytics-anonymous-switch'), 'valueChange', false);

    expect(mockSetConsent).toHaveBeenCalledWith({ anonymous: false });
    expect(mockRecordConsentMutate).toHaveBeenCalledWith({ anonymous: false, linked: false });
  });

  it('the "linked" switch is disabled while anonymous is off', async () => {
    mockConsent = { anonymous: false, linked: false };
    await render(<AnalyticsConsentCard />);

    expect(screen.getByTestId('profile-analytics-linked-switch').props.disabled).toBe(true);
  });
});

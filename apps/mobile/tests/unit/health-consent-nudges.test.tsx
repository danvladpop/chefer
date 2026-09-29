import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { LogWeightPrompt } from '../../src/features/gym/stats/log-weight-prompt';
import {
  HealthConsentLaunchPrompt,
  resetHealthConsentLaunchPromptForTests,
} from '../../src/features/privacy/health-consent-launch-prompt';
import { HealthConsentTodayNotice } from '../../src/features/privacy/health-consent-notice';
import { setHealthConsentDeclined } from '../../src/features/privacy/health-declined-store';

// UX-26 follow-ups: Q-7 launch prompt (existing data is kept, the user is asked
// once per launch), the Food Today card after "Don't save it", and the gym weight
// prompt going through the same consent guard.

let mockUser: { healthDataConsentAt: Date | null } | undefined;
let mockPrefs: unknown;
const mockGrant = jest.fn();
const mockLogWeight = jest.fn();

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      user: {
        me: {
          setData: jest.fn(),
          getData: () => mockUser,
          fetch: () => Promise.resolve(mockUser),
          invalidate: jest.fn(),
        },
      },
      gym: {
        bootstrap: { invalidate: jest.fn() },
        stats: { bodyweight: { invalidate: jest.fn() }, monthlyRecap: { invalidate: jest.fn() } },
      },
      tracker: { weightHistory: { invalidate: jest.fn() } },
    }),
    user: { me: { useQuery: () => ({ data: mockUser }) } },
    preferences: { get: { useQuery: () => ({ data: mockPrefs }) } },
    tracker: {
      logWeight: {
        useMutation: () => ({ mutate: mockLogWeight, isPending: false }),
      },
    },
    privacy: {
      grantHealthConsent: {
        useMutation: () => ({
          mutate: (_i: unknown, opts?: { onSuccess?: () => void }) => {
            mockGrant();
            opts?.onSuccess?.();
          },
          reset: jest.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (node: React.ReactNode) => (
  <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>
);
const WITH_ALLERGY = {
  dietaryPreferences: { allergies: ['Peanuts'], dietaryRestrictions: [], dislikedIngredients: [] },
  chefProfile: null,
};
const EMPTY = {
  dietaryPreferences: { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
  chefProfile: null,
};

beforeAll(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
});
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { healthDataConsentAt: null };
  mockPrefs = WITH_ALLERGY;
  setHealthConsentDeclined(false);
  resetHealthConsentLaunchPromptForTests();
});

describe('HealthConsentLaunchPrompt (Q-7)', () => {
  it('asks once when health data exists but consent does not, and never re-asks', async () => {
    const view = await render(wrap(<HealthConsentLaunchPrompt signedIn />));
    expect(await screen.findByTestId('health-consent-allow')).toBeTruthy();
    await userEvent.setup().press(screen.getByTestId('health-consent-decline'));
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
    // Nothing stored or changed by declining.
    expect(mockGrant).not.toHaveBeenCalled();

    await view.rerender(wrap(<HealthConsentLaunchPrompt signedIn />));
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it.each([
    ['consent is on record', () => (mockUser = { healthDataConsentAt: new Date() })],
    ['no health data is stored', () => (mockPrefs = EMPTY)],
  ])('stays quiet when %s', async (_name, arrange) => {
    arrange();
    await render(wrap(<HealthConsentLaunchPrompt signedIn />));
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it('stays quiet when signed out', async () => {
    await render(wrap(<HealthConsentLaunchPrompt signedIn={false} />));
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });
});

describe('HealthConsentTodayNotice (AC2)', () => {
  it('is hidden for a brand-new user who has not declined', async () => {
    await render(wrap(<HealthConsentTodayNotice />));
    expect(screen.queryByTestId('health-consent-notice-card')).toBeNull();
  });

  it('shows after "Don\'t save it", reopens the sheet, and can be dismissed', async () => {
    setHealthConsentDeclined(true);
    await render(wrap(<HealthConsentTodayNotice />));
    expect(screen.getByText('Plans aren’t being checked for allergies')).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByTestId('health-consent-notice-allow'));
    expect(screen.getByTestId('health-consent-allow')).toBeTruthy();
    await user.press(screen.getByTestId('health-consent-decline'));
    await user.press(screen.getByTestId('health-consent-notice-dismiss'));
    expect(screen.queryByTestId('health-consent-notice-card')).toBeNull();
  });

  it('is hidden once consent is on record', async () => {
    setHealthConsentDeclined(true);
    mockUser = { healthDataConsentAt: new Date() };
    await render(wrap(<HealthConsentTodayNotice />));
    expect(screen.queryByTestId('health-consent-notice-card')).toBeNull();
  });
});

describe('gym LogWeightPrompt goes through the consent guard', () => {
  it('asks first; "Don\'t save it" logs nothing; "Allow and save" logs the weight', async () => {
    await render(wrap(<LogWeightPrompt />));
    const user = userEvent.setup();
    await user.type(screen.getByTestId('log-weight-prompt-input'), '72');
    await user.press(screen.getByTestId('log-weight-prompt-save'));
    expect(mockLogWeight).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('health-consent-decline'));
    expect(mockLogWeight).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
    expect(screen.getByTestId('log-weight-prompt-declined')).toBeTruthy();

    await user.press(screen.getByTestId('log-weight-prompt-save'));
    await user.press(screen.getByTestId('health-consent-allow'));
    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(mockLogWeight).toHaveBeenCalledWith({ weightKg: 72 });
  });
});

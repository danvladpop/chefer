import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import YouTab from '../../app/(main)/you';
import { householdSummary } from '../../src/features/shell/you-screen';

// 10 Oct redesign, board "You": You is the one home of every setting — Meals,
// Training, Notifications and Account rows — plus progress, people, the
// admin-only preview, help (feedback in a sheet) and sign out.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
  usePathname: () => '/you',
}));

let mockVariant = 'production';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { appVariant: mockVariant } };
    },
  },
}));

// The real pill pulls in the whole Add/Log-a-workout stack; its own tests cover it.
jest.mock('../../src/features/shell/add-action', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { View } = require('react-native') as typeof import('react-native');
  return { AskChefAction: () => <View testID="shell-ask-chef" /> };
});

const mockLogoutMutate = jest.fn();
const mockFeedbackMutate = jest.fn();
let mockFeedbackOnSuccess: (() => void) | undefined;
let mockMe: { role: string; planTier: string } | undefined;
let mockMembers: { name: string }[] = [];
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    // Kitchen progress is off in these tests (flags answer nothing).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
    ...(require('./progress-trpc-mock') as typeof import('./progress-trpc-mock')).progressTrpcOff(),
    auth: {
      me: { useQuery: () => ({ data: mockMe }) },
      logout: { useMutation: () => ({ mutate: mockLogoutMutate, isPending: false }) },
    },
    household: {
      list: { useQuery: () => ({ data: mockMembers }) },
      // ADR 0002: household sharing off (a solo household), no notices.
      sharing: { useQuery: () => ({ data: undefined }) },
      notices: { useQuery: () => ({ data: undefined }) },
    },
    feedback: {
      submit: {
        useMutation: (opts: { onSuccess?: () => void }) => {
          mockFeedbackOnSuccess = opts.onSuccess;
          return {
            mutate: mockFeedbackMutate,
            isPending: false,
            isSuccess: false,
            isError: false,
            error: null,
          };
        },
      },
    },
  },
}));
jest.mock('../../src/lib/sign-out', () => ({ signOut: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

let mockAvailable = true;
let mockBadge = 0;
jest.mock('../../src/features/friends/api/use-friends-badge', () => ({
  useFriendsBadge: () => ({ available: mockAvailable, badgeCount: mockBadge }),
}));

// WP-18: "Your trainer" / "Trainer tools" follow `coaching.availability` (off by default here).
let mockCoaching = { enabled: false, canBeTrainer: false };
jest.mock('../../src/features/trainer/api/use-coaching-availability', () => ({
  useCoachingAvailability: () => mockCoaching,
}));

// Trainer mode (trainer-mode.md §6.9): off unless a test turns it on.
let mockTrainerMode = false;
let mockTrainerTotal = 0;
jest.mock('../../src/features/trainer-mode/use-trainer-mode', () => ({
  useTrainerModeAvailability: () => mockTrainerMode,
  useTrainerBadges: () => ({ requests: mockTrainerTotal, total: mockTrainerTotal, loaded: true }),
}));
const mockSwitch = jest.fn();
jest.mock('../../src/features/trainer-mode/switch-mode', () => ({
  switchShellMode: (...args: unknown[]) => {
    mockSwitch(...args);
  },
}));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');
const { openPremium } = jest.requireMock<{ openPremium: jest.Mock }>(
  '../../src/features/premium/open-premium',
);

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderYou() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <YouTab />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockLogoutMutate.mockClear();
  mockFeedbackMutate.mockClear();
  track.mockClear();
  openPremium.mockClear();
  mockFeedbackOnSuccess = undefined;
  mockMe = { role: 'USER', planTier: 'FREE' };
  mockMembers = [];
  mockAvailable = true;
  mockBadge = 0;
  mockVariant = 'production';
  mockCoaching = { enabled: false, canBeTrainer: false };
  mockTrainerMode = false;
  mockTrainerTotal = 0;
  mockSwitch.mockClear();
});

describe('You (10 Oct redesign)', () => {
  it('names itself in the shared top bar, next to Ask Chef (F5)', async () => {
    await renderYou();
    expect(screen.getByRole('header', { name: 'You' })).toBeTruthy();
    expect(screen.getByTestId('shell-ask-chef')).toBeTruthy();
    // No second, larger title on its own row under Ask Chef.
    expect(screen.queryByTestId('you-title')).toBeNull();
  });

  it('every row opens its screen', async () => {
    await renderYou();
    const expected: Record<string, string> = {
      'you-progress': '/progress',
      'you-my-weeks': '/my-weeks',
      'you-meal-settings': '/settings/meals',
      'you-training-settings': '/gym/settings',
      'you-notifications': '/settings/notifications',
      'you-account': '/settings',
      'you-household': '/household',
      'you-friends': '/friends',
      'you-terms': '/legal/terms',
      'you-privacy': '/legal/privacy',
    };
    for (const [testID, href] of Object.entries(expected)) {
      mockPush.mockClear();
      await fireEvent.press(screen.getByTestId(testID));
      expect(mockPush).toHaveBeenCalledWith(href);
    }
    expect(track).toHaveBeenCalledWith('friends_opened', { source: 'more' });
  });

  it('labels the settings rows the way the board does', async () => {
    await renderYou();
    expect(screen.getByText('Stats')).toBeTruthy();
    expect(screen.getByText('Meals, days, allergies, budget')).toBeTruthy();
    expect(screen.getByText('Units, equipment, reminders')).toBeTruthy();
    expect(screen.getByText('Goal, targets, Premium, privacy')).toBeTruthy();
  });

  it('drops the old Profile, Settings and Gym settings rows', async () => {
    await renderYou();
    expect(screen.queryByTestId('you-profile')).toBeNull();
    expect(screen.queryByTestId('you-settings')).toBeNull();
    expect(screen.queryByTestId('you-gym-settings')).toBeNull();
    // The feedback form is a row now, not an open card.
    expect(screen.queryByTestId('feedback-input')).toBeNull();
  });

  it('Household shows who is at the table', async () => {
    mockMembers = [{ name: 'Ana' }];
    await renderYou();
    expect(screen.getByTestId('you-household')).toHaveTextContent(/You \+ Ana/);
  });

  it('Following keeps its count badge, and hides with the feature off', async () => {
    mockBadge = 2;
    const { unmount } = await renderYou();
    expect(screen.getByTestId('you-friends-badge')).toHaveTextContent('2');
    await unmount();

    mockAvailable = false;
    await renderYou();
    expect(screen.queryByTestId('you-friends')).toBeNull();
  });

  it('the Preview section is for admins and test builds only', async () => {
    const { unmount } = await renderYou();
    expect(screen.queryByTestId('shell-preview-section')).toBeNull();
    await unmount();

    mockMe = { role: 'ADMIN', planTier: 'FREE' };
    const admin = await renderYou();
    expect(screen.getByTestId('shell-preview-switch')).toBeTruthy();
    expect(screen.getByText('Admins and test builds only.')).toBeTruthy();
    await admin.unmount();

    mockVariant = 'development';
    await renderYou();
    expect(screen.getByTestId('shell-preview-section')).toBeTruthy();
  });

  it('Send feedback opens the form in a sheet and sends it with the route', async () => {
    await renderYou();
    await fireEvent.press(screen.getByTestId('you-feedback'));
    expect(screen.getByTestId('you-feedback-sheet-title')).toHaveTextContent('Send feedback');

    // Empty Send stays disabled (UX-ACC-25), and the field keeps its cap.
    await fireEvent.press(screen.getByTestId('feedback-submit'));
    expect(mockFeedbackMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('feedback-input').props.maxLength).toBe(2000);

    await fireEvent.changeText(screen.getByTestId('feedback-input'), 'The plan is slow');
    await fireEvent.press(screen.getByTestId('feedback-submit'));
    expect(mockFeedbackMutate).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The plan is slow', route: '/you' }),
    );

    // Sent: the sheet closes.
    await act(() => {
      mockFeedbackOnSuccess?.();
    });
    await waitFor(() => expect(screen.queryByTestId('feedback-input')).toBeNull());
  });

  it('sign out asks first', async () => {
    await renderYou();
    await fireEvent.press(screen.getByTestId('logout-button'));
    expect(screen.getByTestId('you-sign-out-confirm-body')).toBeTruthy();
    expect(mockLogoutMutate).not.toHaveBeenCalled();
  });

  it('shows the version line', async () => {
    await renderYou();
    expect(screen.getByTestId('build-info')).toHaveTextContent(/^Version/);
  });
});

describe('You: trainer coaching rows (WP-18)', () => {
  it('coaching off: neither "Your trainer" nor "Trainer tools" exists', async () => {
    await renderYou();
    expect(screen.queryByTestId('you-your-trainer')).toBeNull();
    expect(screen.queryByTestId('you-trainer-tools')).toBeNull();
  });

  it('coaching on: "Your trainer" under People opens /coaching; no "Trainer tools" for a non-trainer', async () => {
    mockCoaching = { enabled: true, canBeTrainer: false };
    await renderYou();
    expect(screen.getByTestId('you-your-trainer')).toHaveTextContent(/Your trainer/);
    expect(screen.queryByTestId('you-trainer-tools')).toBeNull();
    await fireEvent.press(screen.getByTestId('you-your-trainer'));
    expect(mockPush).toHaveBeenLastCalledWith('/coaching');
  });

  it('a user who may be a trainer also gets "Trainer tools" → /trainer, after Following', async () => {
    mockCoaching = { enabled: true, canBeTrainer: true };
    await renderYou();
    const ids = screen.getAllByRole('button').map((b) => b.props.testID as string | undefined);
    expect(ids.indexOf('you-household')).toBeLessThan(ids.indexOf('you-friends'));
    expect(ids.indexOf('you-friends')).toBeLessThan(ids.indexOf('you-your-trainer'));
    expect(ids.indexOf('you-your-trainer')).toBeLessThan(ids.indexOf('you-trainer-tools'));
    await fireEvent.press(screen.getByTestId('you-trainer-tools'));
    expect(mockPush).toHaveBeenLastCalledWith('/trainer');
  });
});

describe('You: trainer mode (trainer-mode.md §6.9)', () => {
  it('an active trainer gets "Switch to trainer mode" first, badged, and no "Trainer tools"', async () => {
    mockCoaching = { enabled: true, canBeTrainer: true };
    mockTrainerMode = true;
    mockTrainerTotal = 2;
    await renderYou();
    const ids = screen.getAllByRole('button').map((b) => b.props.testID as string | undefined);
    expect(ids[0]).toBe('you-switch-to-trainer');
    const row = screen.getByTestId('you-switch-to-trainer');
    expect(row).toHaveAccessibleName('Switch to trainer mode, 2 things waiting');
    expect(screen.getByTestId('you-switch-to-trainer-badge')).toHaveTextContent('2');
    expect(screen.queryByTestId('you-trainer-tools')).toBeNull();
    // "Your trainer" (the client side) stays.
    expect(screen.getByTestId('you-your-trainer')).toBeTruthy();
    await fireEvent.press(row);
    expect(mockSwitch).toHaveBeenCalledWith('trainer');
  });

  it('nothing waiting: no badge, a plain label', async () => {
    mockCoaching = { enabled: true, canBeTrainer: true };
    mockTrainerMode = true;
    await renderYou();
    expect(screen.getByTestId('you-switch-to-trainer')).toHaveAccessibleName(
      'Switch to trainer mode',
    );
    expect(screen.queryByTestId('you-switch-to-trainer-badge')).toBeNull();
  });

  it('flag off, or tools not turned on yet: no switch, "Trainer tools" stays', async () => {
    mockCoaching = { enabled: true, canBeTrainer: true };
    mockTrainerMode = false;
    mockTrainerTotal = 3;
    await renderYou();
    expect(screen.queryByTestId('you-switch-to-trainer')).toBeNull();
    expect(screen.getByTestId('you-trainer-tools')).toBeTruthy();
  });
});

describe('the tier row (F6, F7)', () => {
  it('a free user sees their plan first, and a tap shows what Premium adds', async () => {
    await renderYou();
    const plan = screen.getByTestId('you-tier');
    expect(plan).toHaveTextContent(/Free plan/);
    expect(plan).toHaveTextContent(/See what Premium adds/);
    await fireEvent.press(plan);
    expect(openPremium).toHaveBeenCalledWith('tier-row');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a premium user sees status only, and a tap opens what they have', async () => {
    mockMe = { role: 'USER', planTier: 'PREMIUM' };
    await renderYou();
    const plan = screen.getByTestId('you-tier');
    expect(plan).toHaveTextContent(/Premium plan/);
    expect(plan).toHaveTextContent(/Included · What you have/);
    expect(within(plan).queryByText(/See what Premium adds/)).toBeNull();
    await fireEvent.press(plan);
    expect(mockPush).toHaveBeenCalledWith('/profile?section=plan');
    expect(openPremium).not.toHaveBeenCalled();
  });

  it('an admin has every feature: Premium status with nothing to open or switch off', async () => {
    mockMe = { role: 'ADMIN', planTier: 'FREE' };
    await renderYou();
    const tier = screen.getByTestId('you-tier');
    expect(tier).toHaveTextContent(/Premium plan/);
    expect(tier).toHaveTextContent(/Included with admin access/);
    await fireEvent.press(tier);
    expect(mockPush).not.toHaveBeenCalled();
    expect(openPremium).not.toHaveBeenCalled();
  });

  it('shows nothing until the plan is known, so it never flashes "Free"', async () => {
    mockMe = undefined;
    await renderYou();
    expect(screen.queryByTestId('you-tier')).toBeNull();
  });
});

describe('householdSummary', () => {
  it('names one or two people and counts more', () => {
    expect(householdSummary([])).toBeUndefined();
    expect(householdSummary(['Ana'])).toBe('You + Ana');
    expect(householdSummary(['Ana', 'Ben'])).toBe('You + Ana, Ben');
    expect(householdSummary(['Ana', 'Ben', 'Cy'])).toBe('You + 3');
  });
});

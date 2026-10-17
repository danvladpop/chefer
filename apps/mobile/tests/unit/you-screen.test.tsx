import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { householdSummary, YouScreen } from '../../src/features/shell/you-screen';

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
    auth: {
      me: { useQuery: () => ({ data: mockMe }) },
      logout: { useMutation: () => ({ mutate: mockLogoutMutate, isPending: false }) },
    },
    household: { list: { useQuery: () => ({ data: mockMembers }) } },
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

let mockAvailable = true;
let mockBadge = 0;
jest.mock('../../src/features/friends/api/use-friends-badge', () => ({
  useFriendsBadge: () => ({ available: mockAvailable, badgeCount: mockBadge }),
}));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderYou() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <YouScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockLogoutMutate.mockClear();
  mockFeedbackMutate.mockClear();
  track.mockClear();
  mockFeedbackOnSuccess = undefined;
  mockMe = { role: 'USER', planTier: 'FREE' };
  mockMembers = [];
  mockAvailable = true;
  mockBadge = 0;
  mockVariant = 'production';
});

describe('You (10 Oct redesign)', () => {
  it('has Ask Chef in its top bar and the large "You" title', async () => {
    await renderYou();
    expect(screen.getByTestId('shell-ask-chef')).toBeTruthy();
    expect(within(screen.getByTestId('you-title')).getByText('You')).toBeTruthy();
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

describe('householdSummary', () => {
  it('names one or two people and counts more', () => {
    expect(householdSummary([])).toBeUndefined();
    expect(householdSummary(['Ana'])).toBe('You + Ana');
    expect(householdSummary(['Ana', 'Ben'])).toBe('You + Ana, Ben');
    expect(householdSummary(['Ana', 'Ben', 'Cy'])).toBe('You + 3');
  });
});

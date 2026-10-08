import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  ACCOUNT_DELETION_COPY as COPY,
  SOCIAL_AUTH_MESSAGES,
  type LinkedIdentities,
} from '@chefer/types';
import {
  SocialCancelledError,
  type SocialSignInPayload,
} from '../../src/features/auth/social/social-credentials';
import type { SocialProviders } from '../../src/features/auth/social/social-providers';
import { AccountDataCard } from '../../src/features/profile/account-data-card';

// WP-22: an account that signs in with Google/Apple only has no password, so
// deleting it asks for a fresh provider sign-in (`reauth`) instead.

let mockIdentities: LinkedIdentities | undefined;
let mockProviders: SocialProviders;
const mockDeleteMutate = jest.fn();
let mockDeleteState: { isError: boolean; error: Error | null } = { isError: false, error: null };
const mockRequest = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { exportData: { fetch: jest.fn() } } }),
    user: {
      deleteSelf: {
        useMutation: () => ({
          mutate: mockDeleteMutate,
          reset: jest.fn(),
          isPending: false,
          ...mockDeleteState,
        }),
      },
    },
    auth: {
      logout: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      me: { useQuery: () => ({ data: { email: 'ada@gmail.com' } }) },
      linkedIdentities: { useQuery: () => ({ data: mockIdentities }) },
      requestPasswordReset: {
        useMutation: () => ({
          mutate: jest.fn(),
          isError: false,
          isSuccess: false,
          isPending: false,
        }),
      },
    },
  },
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../../src/lib/sign-out', () => ({ signOut: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/lib/share-file', () => ({ shareExportFile: jest.fn() }));
jest.mock('../../src/features/auth/account-deleted-notice', () => ({
  markAccountDeleted: jest.fn(),
}));
jest.mock('../../src/features/auth/social/social-providers', () => ({
  useSocialProviders: () => mockProviders,
}));
jest.mock('../../src/features/auth/social/use-social-sign-in', () => ({
  requestProviderCredential: (providers: SocialProviders, key: string) =>
    mockRequest(providers, key) as Promise<SocialSignInPayload>,
}));

const BOTH: SocialProviders = {
  apple: {} as NonNullable<SocialProviders['apple']>,
  google: { module: {} as never, config: { webClientId: 'w' } },
};
const apple = { id: 'a', provider: 'APPLE' as const, email: null, linkedAt: new Date() };
const google = {
  id: 'g',
  provider: 'GOOGLE' as const,
  email: 'ada@gmail.com',
  linkedAt: new Date(),
};

const METRICS = {
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
async function openSheet() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AccountDataCard />
    </SafeAreaProvider>,
  );
  await fireEvent.press(screen.getByTestId('profile-delete-account'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProviders = BOTH;
  mockIdentities = { hasPassword: false, identities: [apple] };
  mockDeleteState = { isError: false, error: null };
});

describe('delete account — OAuth-only (re-auth)', () => {
  it('shows no password field, and the provider button stays disabled until DELETE is typed', async () => {
    await openSheet();
    expect(screen.queryByTestId('delete-account-password')).toBeNull();
    expect(screen.getByTestId('delete-account-reauth')).toHaveTextContent(
      new RegExp(COPY.reauthHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    expect(screen.getByTestId('delete-account-reauth-type-first')).toHaveTextContent(
      COPY.reauthTypeFirst,
    );
    const button = screen.getByTestId('delete-account-reauth-apple');
    expect(button).toHaveTextContent(COPY.reauthApple);
    expect(
      (button.props as { accessibilityState: { disabled: boolean } }).accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(button);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('runs a fresh Apple sign-in and deletes with {reauth, confirm} — no password', async () => {
    mockRequest.mockResolvedValue({
      provider: 'APPLE',
      idToken: 'fresh.apple.token',
      nonce: 'fresh-raw-nonce-123456',
      authorizationCode: 'unused-here',
    } satisfies SocialSignInPayload);
    await openSheet();
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-text'), 'delete');
    await fireEvent.press(screen.getByTestId('delete-account-reauth-apple'));

    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalledTimes(1));
    expect(mockRequest).toHaveBeenCalledWith(BOTH, 'apple');
    expect(mockDeleteMutate).toHaveBeenCalledWith({
      reauth: { provider: 'APPLE', idToken: 'fresh.apple.token', nonce: 'fresh-raw-nonce-123456' },
      confirm: 'DELETE',
    });
  });

  it('offers one button per connected provider (Google label from the shared copy)', async () => {
    mockIdentities = { hasPassword: false, identities: [apple, google] };
    await openSheet();
    expect(screen.getByTestId('delete-account-reauth-google')).toHaveTextContent(COPY.reauthGoogle);
    expect(screen.getByTestId('delete-account-reauth-apple')).toBeTruthy();
  });

  it('cancelling the provider sheet deletes nothing and says nothing', async () => {
    mockRequest.mockRejectedValue(new SocialCancelledError());
    await openSheet();
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-text'), 'DELETE');
    await fireEvent.press(screen.getByTestId('delete-account-reauth-apple'));
    await act(() => Promise.resolve());
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-account-error')).toBeNull();
  });

  it('says so when this device cannot run the connected provider', async () => {
    mockProviders = { apple: null, google: null };
    await openSheet();
    expect(screen.getByTestId('delete-account-reauth-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('delete-account-reauth-apple')).toBeNull();
  });

  it('shows the server refusal (deleteNeedsReauth) under the explanation', async () => {
    mockDeleteState = { isError: true, error: new Error(SOCIAL_AUTH_MESSAGES.deleteNeedsReauth) };
    await openSheet();
    expect(screen.getByTestId('delete-account-error')).toHaveTextContent(
      SOCIAL_AUTH_MESSAGES.deleteNeedsReauth,
    );
  });

  it('an account WITH a password keeps the password flow', async () => {
    mockIdentities = { hasPassword: true, identities: [apple] };
    await openSheet();
    expect(screen.getByTestId('delete-account-password')).toBeTruthy();
    expect(screen.getByTestId('delete-account-confirm')).toBeTruthy();
    expect(screen.queryByTestId('delete-account-reauth')).toBeNull();
  });
});

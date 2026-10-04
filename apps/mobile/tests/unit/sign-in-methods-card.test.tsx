import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SOCIAL_AUTH_MESSAGES, type LinkedIdentities } from '@chefer/types';
import {
  SocialCancelledError,
  type SocialSignInPayload,
} from '../../src/features/auth/social/social-credentials';
import type { SocialProviders } from '../../src/features/auth/social/social-providers';
import { SignInMethodsCard } from '../../src/features/profile/sign-in-methods-card';

// WP-22: Profile › Sign-in methods — list, connect, disconnect, the
// last-method guard, and "set a password" for an OAuth-only account.

let mockIdentities: LinkedIdentities | undefined;
let mockProviders: SocialProviders;
const mockLinkMutate = jest.fn();
const mockUnlinkMutate = jest.fn();
const mockResetMutate = jest.fn();
const mockSetData = jest.fn();
let mockLinkOptions: { onSuccess?: (n: LinkedIdentities) => void; onError?: (e: unknown) => void };
let mockUnlinkOptions: typeof mockLinkOptions;
let mockResetState = { isSuccess: false, isPending: false, isError: false };
const mockRequest = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ auth: { linkedIdentities: { setData: mockSetData } } }),
    auth: {
      linkedIdentities: { useQuery: () => ({ data: mockIdentities }) },
      me: { useQuery: () => ({ data: { email: 'alice@chefer.dev' } }) },
      linkIdentity: {
        useMutation: (o: typeof mockLinkOptions) => {
          mockLinkOptions = o;
          return { mutate: mockLinkMutate, isPending: false, variables: undefined };
        },
      },
      unlinkIdentity: {
        useMutation: (o: typeof mockUnlinkOptions) => {
          mockUnlinkOptions = o;
          return { mutate: mockUnlinkMutate, isPending: false };
        },
      },
      requestPasswordReset: {
        useMutation: () => ({ mutate: mockResetMutate, error: null, ...mockResetState }),
      },
    },
  },
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
const NONE: SocialProviders = { apple: null, google: null };
const linkedGoogle = {
  id: 'i1',
  provider: 'GOOGLE' as const,
  email: 'ada@gmail.com',
  linkedAt: new Date(),
};

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
async function renderCard() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SignInMethodsCard />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentities = { hasPassword: true, identities: [] };
  mockProviders = BOTH;
  mockResetState = { isSuccess: false, isPending: false, isError: false };
});

describe('Sign-in methods card', () => {
  it('lists the connected account with its email and offers the other provider', async () => {
    mockIdentities = { hasPassword: true, identities: [linkedGoogle] };
    await renderCard();
    expect(screen.getByTestId('sign-in-method-google')).toHaveTextContent(/ada@gmail\.com/);
    expect(screen.getByTestId('sign-in-method-google-disconnect')).toBeTruthy();
    expect(screen.getByTestId('sign-in-method-apple-connect')).toBeTruthy();
  });

  it('renders nothing while loading, or with nothing connected and nothing offerable', async () => {
    mockIdentities = undefined;
    await renderCard();
    expect(screen.queryByTestId('profile-sign-in-methods')).toBeNull();
  });

  it('hides the card when no provider can be offered and none is connected', async () => {
    mockProviders = NONE;
    await renderCard();
    expect(screen.queryByTestId('profile-sign-in-methods')).toBeNull();
  });

  it('still lists a connected account on a device that cannot offer its provider', async () => {
    mockProviders = NONE;
    mockIdentities = { hasPassword: true, identities: [linkedGoogle] };
    await renderCard();
    expect(screen.getByTestId('sign-in-method-google')).toBeTruthy();
    expect(screen.queryByTestId('sign-in-method-apple')).toBeNull();
  });

  it('connect: runs a FRESH provider sign-in and sends only what linkIdentity takes', async () => {
    mockRequest.mockResolvedValue({
      provider: 'APPLE',
      idToken: 'apple.token.x',
      nonce: 'raw-nonce-1234567890',
      authorizationCode: 'code',
      givenName: 'Ada',
    } satisfies SocialSignInPayload);
    await renderCard();
    await fireEvent.press(screen.getByTestId('sign-in-method-apple-connect'));
    await waitFor(() => expect(mockLinkMutate).toHaveBeenCalledTimes(1));
    expect(mockRequest).toHaveBeenCalledWith(BOTH, 'apple');
    expect(mockLinkMutate).toHaveBeenCalledWith({
      provider: 'APPLE',
      idToken: 'apple.token.x',
      nonce: 'raw-nonce-1234567890',
      authorizationCode: 'code',
    });
  });

  it('connect: cancelling the sheet is silent', async () => {
    mockRequest.mockRejectedValue(new SocialCancelledError());
    await renderCard();
    await fireEvent.press(screen.getByTestId('sign-in-method-google-connect'));
    await act(() => Promise.resolve());
    expect(mockLinkMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sign-in-methods-error')).toBeNull();
  });

  it('connect: a server conflict is shown in plain words; a success updates the list', async () => {
    await renderCard();
    await act(async () => {
      mockLinkOptions.onError?.(
        Object.assign(new Error(SOCIAL_AUTH_MESSAGES.identityTaken), {
          data: { code: 'CONFLICT' },
        }),
      );
      await Promise.resolve();
    });
    expect(screen.getByTestId('sign-in-methods-error')).toHaveTextContent(
      SOCIAL_AUTH_MESSAGES.identityTaken,
    );
    const next = { hasPassword: true, identities: [linkedGoogle] };
    mockLinkOptions.onSuccess?.(next);
    expect(mockSetData).toHaveBeenCalledWith(undefined, next);
  });

  it('disconnect: calls unlinkIdentity for that provider', async () => {
    mockIdentities = { hasPassword: true, identities: [linkedGoogle] };
    await renderCard();
    await fireEvent.press(screen.getByTestId('sign-in-method-google-disconnect'));
    expect(mockUnlinkMutate).toHaveBeenCalledWith({ provider: 'GOOGLE' });
  });

  it('disconnect of the last sign-in method shows the server guard message', async () => {
    mockIdentities = { hasPassword: false, identities: [linkedGoogle] };
    await renderCard();
    await act(async () => {
      mockUnlinkOptions.onError?.(
        Object.assign(new Error(SOCIAL_AUTH_MESSAGES.lastSignInMethod), {
          data: { code: 'BAD_REQUEST' },
        }),
      );
      await Promise.resolve();
    });
    expect(screen.getByTestId('sign-in-methods-error')).toHaveTextContent(
      SOCIAL_AUTH_MESSAGES.lastSignInMethod,
    );
  });

  it('an account without a password can ask for a link to set one', async () => {
    mockIdentities = { hasPassword: false, identities: [linkedGoogle] };
    await renderCard();
    expect(screen.getByTestId('sign-in-methods-no-password')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sign-in-methods-set-password'));
    expect(mockResetMutate).toHaveBeenCalledWith({ email: 'alice@chefer.dev' });
  });

  it('an account with a password does not show the set-password block', async () => {
    mockIdentities = { hasPassword: true, identities: [linkedGoogle] };
    await renderCard();
    expect(screen.queryByTestId('sign-in-methods-no-password')).toBeNull();
  });
});

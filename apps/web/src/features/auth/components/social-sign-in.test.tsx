// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { SocialSignIn } from './social-sign-in';

// WP-22: the buttons only exist when the API says the provider is configured,
// and tapping one sends acceptLegal (the consent line is the consent).

type State = {
  availability: unknown;
  mutate: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  onSuccess: ((r: { isNewUser: boolean }) => void) | undefined;
  onError: ((e: Error) => void) | undefined;
};
const state = vi.hoisted(
  (): State => ({
    availability: undefined,
    mutate: vi.fn(),
    push: vi.fn(),
    onSuccess: undefined,
    onError: undefined,
  }),
);

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, refresh: vi.fn() }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      socialAvailability: { useQuery: () => ({ data: state.availability }) },
      socialSignIn: {
        useMutation: (opts: {
          onSuccess: (r: { isNewUser: boolean }) => void;
          onError: (e: Error) => void;
        }) => {
          state.onSuccess = opts.onSuccess;
          state.onError = opts.onError;
          return { mutate: state.mutate, isPending: false };
        },
      },
    },
  },
}));
// Google's iframe button is not exercised in jsdom.
vi.mock('./google-sign-in-button', () => ({
  GoogleSignInButton: ({ clientId }: { clientId: string }) => (
    <div data-testid="google-slot">{clientId}</div>
  ),
}));

const enabled = {
  google: { enabled: true, webClientId: 'web-id', iosClientId: null, androidClientId: null },
  apple: {
    enabled: true,
    servicesId: 'dev.chefer.web',
    bundleId: 'com.popdan.chefer',
    redirectUri: 'https://chefer.example/login',
  },
};

beforeEach(() => {
  state.mutate.mockReset();
  state.push.mockReset();
  state.availability = undefined;
  vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
    queueMicrotask(() => {
      (node as HTMLScriptElement).onload?.(new Event('load'));
    });
    return node;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SocialSignIn', () => {
  it('renders nothing while availability is unknown or every provider is disabled', () => {
    const { container, rerender } = render(<SocialSignIn mode="login" />);
    expect(container.innerHTML).toBe('');
    state.availability = {
      google: { enabled: false, webClientId: null, iosClientId: null, androidClientId: null },
      apple: { enabled: false, servicesId: null, bundleId: null, redirectUri: null },
    };
    rerender(<SocialSignIn mode="login" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows Google, Apple and the consent line when configured', () => {
    state.availability = enabled;
    render(<SocialSignIn mode="register" />);
    expect(screen.getByTestId('google-slot').textContent).toBe('web-id');
    expect(screen.getByRole('button', { name: /continue with apple/i })).toBeTruthy();
    const consent = screen.getByTestId('social-consent').textContent ?? '';
    expect(consent).toMatch(/agree to the Terms and Privacy Policy/);
    expect(consent).toMatch(/16 or older/);
  });

  it('shows only the configured provider', () => {
    state.availability = { ...enabled, apple: { ...enabled.apple, enabled: false } };
    render(<SocialSignIn mode="login" />);
    expect(screen.getByTestId('google-slot')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /continue with apple/i })).toBeNull();
  });

  it('Apple tap sends the token with acceptLegal, the terms version and the raw nonce', async () => {
    state.availability = enabled;
    vi.stubGlobal('AppleID', {
      auth: {
        init: vi.fn(),
        signIn: () =>
          Promise.resolve({
            authorization: { id_token: 'a'.repeat(40), code: 'c1' },
            user: { name: { firstName: 'Ann', lastName: 'Lee' } },
          }),
      },
    });
    render(<SocialSignIn mode="login" />);
    fireEvent.click(screen.getByRole('button', { name: /continue with apple/i }));

    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'APPLE',
        idToken: 'a'.repeat(40),
        authorizationCode: 'c1',
        givenName: 'Ann',
        familyName: 'Lee',
        acceptLegal: true,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        nonce: expect.any(String) as string,
      }),
    );
  });

  it('a cancelled Apple popup shows no error and sends nothing', async () => {
    state.availability = enabled;
    vi.stubGlobal('AppleID', {
      auth: {
        init: vi.fn(),
        signIn: () =>
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Apple's SDK rejects with a plain { error } object
          Promise.reject({ error: 'popup_closed_by_user' }),
      },
    });
    render(<SocialSignIn mode="login" />);
    fireEvent.click(screen.getByRole('button', { name: /continue with apple/i }));
    await new Promise((r) => setTimeout(r, 20));
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('social-sign-in-error')).toBeNull();
  });

  it('routes new users to onboarding and returning users to the dashboard', () => {
    state.availability = enabled;
    render(<SocialSignIn mode="login" />);
    state.onSuccess?.({ isNewUser: true });
    expect(state.push).toHaveBeenCalledWith('/onboarding');
    state.onSuccess?.({ isNewUser: false });
    expect(state.push).toHaveBeenLastCalledWith('/dashboard');
  });

  it('shows the API message (not raw JSON) when sign-in fails', async () => {
    state.availability = enabled;
    render(<SocialSignIn mode="login" />);
    act(() => state.onError?.(new Error('We couldn’t verify your sign-in. Please try again.')));
    expect((await screen.findByTestId('social-sign-in-error')).textContent).toBe(
      'We couldn’t verify your sign-in. Please try again.',
    );
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInMethodsCard } from './SignInMethodsCard';

type State = {
  linked: unknown;
  availability: unknown;
  unlink: ReturnType<typeof vi.fn>;
  link: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};
const state = vi.hoisted(
  (): State => ({
    linked: undefined,
    availability: undefined,
    unlink: vi.fn(),
    link: vi.fn(),
    reset: vi.fn(),
  }),
);

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ auth: { linkedIdentities: { setData: vi.fn() } } }),
    auth: {
      linkedIdentities: { useQuery: () => ({ data: state.linked }) },
      socialAvailability: { useQuery: () => ({ data: state.availability }) },
      me: { useQuery: () => ({ data: { email: 'alice@chefer.dev' } }) },
      linkIdentity: { useMutation: () => ({ mutate: state.link, isPending: false }) },
      unlinkIdentity: { useMutation: () => ({ mutate: state.unlink, isPending: false }) },
      requestPasswordReset: {
        useMutation: () => ({
          mutate: state.reset,
          isPending: false,
          isSuccess: false,
          isError: false,
        }),
      },
    },
  },
}));
vi.mock('@/features/auth/components/google-sign-in-button', () => ({
  GoogleSignInButton: () => <div data-testid="google-slot" />,
}));

const availability = {
  google: { enabled: true, webClientId: 'web-id', iosClientId: null, androidClientId: null },
  apple: { enabled: false, servicesId: null, bundleId: null, redirectUri: null },
};
const googleLinked = {
  id: 'i1',
  provider: 'GOOGLE',
  email: 'alice@gmail.com',
  linkedAt: new Date(),
};

beforeEach(() => {
  state.unlink.mockReset();
  state.reset.mockReset();
  state.linked = { hasPassword: true, identities: [] };
  state.availability = availability;
});
afterEach(cleanup);

describe('SignInMethodsCard', () => {
  it('is hidden when no provider is offered and nothing is connected', () => {
    state.availability = undefined;
    const { container } = render(<SignInMethodsCard />);
    expect(container.innerHTML).toBe('');
  });

  it('offers connecting Google when it is available but not connected', () => {
    render(<SignInMethodsCard />);
    expect(screen.getByTestId('sign-in-method-google')).toBeTruthy();
    expect(screen.getByTestId('google-slot')).toBeTruthy();
    expect(screen.queryByTestId('sign-in-method-apple')).toBeNull();
    expect(screen.queryByTestId('sign-in-methods-no-password')).toBeNull();
  });

  it('shows a connected account and disconnects it', () => {
    state.linked = { hasPassword: true, identities: [googleLinked] };
    render(<SignInMethodsCard />);
    expect(screen.getByText('alice@gmail.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(state.unlink).toHaveBeenCalledWith({ provider: 'GOOGLE' });
  });

  it('keeps showing a connected provider even if the web build cannot offer it', () => {
    state.availability = undefined;
    state.linked = { hasPassword: true, identities: [googleLinked] };
    render(<SignInMethodsCard />);
    expect(screen.getByTestId('sign-in-method-google')).toBeTruthy();
  });

  it('an account with no password can request a link to set one', () => {
    state.linked = { hasPassword: false, identities: [googleLinked] };
    render(<SignInMethodsCard />);
    expect(screen.getByTestId('sign-in-methods-no-password')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /link to set a password/i }));
    expect(state.reset).toHaveBeenCalledWith({ email: 'alice@chefer.dev' });
  });
});

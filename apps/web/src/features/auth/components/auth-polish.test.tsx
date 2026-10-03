// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESET_LINK_INVALID_MESSAGE } from '@chefer/types';
import { RegisterForm } from './register-form';
import { ResetPasswordForm } from './reset-password-form';

// WP-09 lane B web parity: UX-ACC-07 (trimmed email), -09 (dead reset link,
// stage titles), -15 (account already exists), -16 (stale mismatch).

type Opts = { onError?: (e: unknown) => void; onSuccess?: (d: unknown) => void };
const captured: { register: Opts; reset: Opts } = { register: {}, reset: {} };
const registerMutate = vi.fn();
const resetMutate = vi.fn();
let token = 'raw-token';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(token ? `token=${token}` : ''),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      register: {
        useMutation: (opts: Opts) => {
          captured.register = opts;
          return { mutate: registerMutate, isPending: false };
        },
      },
      resetPassword: {
        useMutation: (opts: Opts) => {
          captured.reset = opts;
          return { mutate: resetMutate, isPending: false };
        },
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  token = 'raw-token';
});

describe('RegisterForm', () => {
  it('sends a trailing-space email trimmed (UX-ACC-07)', async () => {
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Pop' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ana@example.com ' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByLabelText(/i agree/i));
    fireEvent.click(screen.getByLabelText(/16 or older/i));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(registerMutate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@example.com' }),
      ),
    );
  });

  it('offers Sign in / Reset when the account exists, and drops them when the email changes (UX-ACC-15)', async () => {
    render(<RegisterForm />);
    act(() => {
      captured.register.onError?.(
        Object.assign(new Error('An account with this email already exists'), {
          data: { code: 'CONFLICT' },
        }),
      );
    });

    expect(screen.getByRole('link', { name: 'Sign in instead' }).getAttribute('href')).toBe(
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Reset your password' }).getAttribute('href')).toBe(
      '/forgot-password',
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'other@example.com' } });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Sign in instead' })).toBeNull());
  });
});

describe('ResetPasswordForm', () => {
  it('swaps to a request-a-new-link card when the link is dead (UX-ACC-09)', () => {
    render(<ResetPasswordForm />);
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeTruthy();

    act(() => {
      captured.reset.onError?.(Object.assign(new Error(RESET_LINK_INVALID_MESSAGE), {}));
    });

    expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Request a new reset link' }).getAttribute('href'),
    ).toBe('/forgot-password');
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it('retitles once the password is changed (UX-ACC-09)', () => {
    render(<ResetPasswordForm />);
    act(() => {
      captured.reset.onSuccess?.({ success: true });
    });
    expect(screen.getByRole('heading', { name: 'Password changed' })).toBeTruthy();
  });

  it('drops "Passwords do not match" once the password is corrected (UX-ACC-16)', async () => {
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'NewPass124!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText('Passwords do not match')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPass124!' } });

    await waitFor(() => expect(screen.queryByText('Passwords do not match')).toBeNull());
  });
});

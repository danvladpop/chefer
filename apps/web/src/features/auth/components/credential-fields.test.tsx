// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './forgot-password-form';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';
import { ResetPasswordForm } from './reset-password-form';

// Tester feedback 2026-10-04 ("the password field is not treated like a
// password field"): the web forms already declare their credential fields
// properly — this pins it so a refactor cannot regress the browser/password
// manager hints, in step with the mobile screens.

const mutation = { mutate: vi.fn(), isPending: false };
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('token=raw-token'),
}));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      login: { useMutation: () => mutation },
      register: { useMutation: () => mutation },
      resetPassword: { useMutation: () => mutation },
      requestPasswordReset: { useMutation: () => mutation },
    },
  },
}));

afterEach(cleanup);

function fields(container: HTMLElement, selector: string) {
  return Array.from(container.querySelectorAll<HTMLInputElement>(selector));
}

describe('credential fields declare themselves', () => {
  it('login: type=email + autocomplete=email, type=password + current-password', () => {
    const { container } = render(<LoginForm />);
    const [email] = fields(container, 'input[type="email"]');
    expect(email?.getAttribute('autocomplete')).toBe('email');
    const passwords = fields(container, 'input[type="password"]');
    expect(passwords).toHaveLength(1);
    expect(passwords[0]?.getAttribute('autocomplete')).toBe('current-password');
  });

  it('register: email, and BOTH password fields are new-password', () => {
    const { container } = render(<RegisterForm />);
    expect(fields(container, 'input[type="email"]')[0]?.getAttribute('autocomplete')).toBe('email');
    const passwords = fields(container, 'input[type="password"]');
    expect(passwords).toHaveLength(2);
    for (const field of passwords) expect(field.getAttribute('autocomplete')).toBe('new-password');
  });

  it('reset: both fields are new-password', () => {
    const { container } = render(<ResetPasswordForm />);
    const passwords = fields(container, 'input[type="password"]');
    expect(passwords).toHaveLength(2);
    for (const field of passwords) expect(field.getAttribute('autocomplete')).toBe('new-password');
  });

  it('forgot password: email', () => {
    const { container } = render(<ForgotPasswordForm />);
    const [email] = fields(container, 'input[type="email"]');
    expect(email?.getAttribute('autocomplete')).toBe('email');
  });
});

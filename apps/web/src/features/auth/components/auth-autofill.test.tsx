// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

// WP-22 / owner feedback: password managers on iOS/Android only offer to
// suggest-and-save a strong password when the fields declare what they are.

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      login: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      register: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

afterEach(cleanup);

const attr = (selector: string, name: string) =>
  document.querySelector(selector)?.getAttribute(name);

describe('auth form autofill attributes', () => {
  it('login: email is "email", password is a password field with current-password', () => {
    render(<LoginForm />);
    expect(attr('#email', 'type')).toBe('email');
    expect(attr('#email', 'autocomplete')).toBe('email');
    expect(attr('#password', 'type')).toBe('password');
    expect(attr('#password', 'autocomplete')).toBe('current-password');
  });

  it('register: both password fields are new-password (so managers suggest a strong one)', () => {
    render(<RegisterForm />);
    expect(attr('#email', 'autocomplete')).toBe('email');
    expect(attr('#password', 'type')).toBe('password');
    expect(attr('#password', 'autocomplete')).toBe('new-password');
    expect(attr('#confirmPassword', 'type')).toBe('password');
    expect(attr('#confirmPassword', 'autocomplete')).toBe('new-password');
  });
});

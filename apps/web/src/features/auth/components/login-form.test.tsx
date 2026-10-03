// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

// UX-ACC-10: an expired session lands on /login?from=… — the form says why.

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: { auth: { login: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
}));

afterEach(cleanup);

describe('LoginForm session-expired notice (UX-ACC-10)', () => {
  it('says why the user is here after a 401', () => {
    render(<LoginForm sessionExpired />);
    expect(screen.getByTestId('login-session-expired').textContent).toMatch(/session expired/i);
  });

  it('shows nothing extra on a normal visit', () => {
    render(<LoginForm />);
    expect(screen.queryByTestId('login-session-expired')).toBeNull();
  });
});

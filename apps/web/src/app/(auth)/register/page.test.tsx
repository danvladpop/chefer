// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './page';

// Onboarding V4 flag switch on /register: on → "Save your plan"; off (or the
// flag read failing) → today's register page.
const m = vi.hoisted(() => ({ flags: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock('@/features/auth/lib/session', () => ({ getSessionUser: () => Promise.resolve(null) }));
vi.mock('@/features/auth/components/register-form', () => ({
  RegisterForm: () => <p>current register form</p>,
}));
vi.mock('@/features/auth/components/social-sign-in', () => ({ SocialSignIn: () => null }));
vi.mock('@/features/onboarding-v4/register-v4', () => ({
  RegisterV4: () => <p>save your plan</p>,
}));
vi.mock('@/lib/trpc-server', () => ({ serverClient: { profile: { flags: { query: m.flags } } } }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe('/register — onboardingV4 flag', () => {
  it('flag on renders the V4 account step', async () => {
    m.flags.mockResolvedValue({ onboardingV4: true });
    render(await RegisterPage());
    expect(screen.getByText('save your plan')).toBeTruthy();
    expect(screen.queryByText('current register form')).toBeNull();
  });

  it('flag off renders the current page', async () => {
    m.flags.mockResolvedValue({});
    render(await RegisterPage());
    expect(screen.getByText('current register form')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
  });

  it('a failed flag read keeps the current page', async () => {
    m.flags.mockRejectedValue(new Error('down'));
    render(await RegisterPage());
    expect(screen.getByText('current register form')).toBeTruthy();
  });
});

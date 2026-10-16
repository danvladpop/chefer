// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingPage from './page';

// Onboarding V4 flag switch: on → the V4 flow; off (or the flag read failing)
// → today's wizard, unchanged.
const m = vi.hoisted(() => ({ flags: vi.fn() }));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Map([['cookie', 'c']])) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/features/onboarding/components/onboarding-wizard', () => ({
  OnboardingWizard: () => <p>current wizard</p>,
}));
vi.mock('@/features/onboarding-v4/onboarding-v4', () => ({
  OnboardingV4: ({ savedUnits }: { savedUnits: string | null }) => (
    <p>onboarding v4 {String(savedUnits)}</p>
  ),
}));
vi.mock('@/lib/trpc-server', () => ({
  createServerClient: () => ({
    profile: { flags: { query: m.flags } },
    user: { me: { query: () => Promise.resolve({ planTier: 'FREE', role: 'USER' }) } },
    preferences: {
      hasProfile: { query: () => Promise.resolve(false) },
      get: {
        query: () =>
          Promise.resolve({
            chefProfile: { preferredUnits: 'IMPERIAL' },
            dietaryPreferences: null,
            jobs: [],
          }),
      },
    },
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe('/onboarding — onboardingV4 flag', () => {
  it('flag on renders Onboarding V4 with the saved units', async () => {
    m.flags.mockResolvedValue({ onboardingV4: true });
    render(await OnboardingPage());
    expect(screen.getByText('onboarding v4 IMPERIAL')).toBeTruthy();
    expect(screen.queryByText('current wizard')).toBeNull();
  });

  it('flag off renders the current wizard', async () => {
    m.flags.mockResolvedValue({ onboardingV4: false });
    render(await OnboardingPage());
    expect(screen.getByText('current wizard')).toBeTruthy();
  });

  it('a failed flag read keeps the current wizard', async () => {
    m.flags.mockRejectedValue(new Error('down'));
    render(await OnboardingPage());
    expect(screen.getByText('current wizard')).toBeTruthy();
  });
});

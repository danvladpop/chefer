// @vitest-environment jsdom
import { AiConsentProvider } from '@/features/ai-consent/AiConsentProvider';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from './onboarding-wizard';

// UX-03 AC7 (rev 2, delta rule 3): finishing a food path auto-generates the
// first week — a premium account is asked for AI consent first
// (useAiConsent('meal-plan', …)); "Not now" sends nothing and never blocks
// onboarding (it still lands on /dashboard); free users are never asked
// (free generation is curated, not AI). Mirrors
// apps/mobile/tests/unit/onboarding-ai-consent.test.tsx — uses the REAL
// AiConsentProvider (not a stub) so this checks the gate actually wired in
// front of mealPlan.generate, not just the gate itself (covered generically
// by AiConsentProvider.test.tsx).

const m = vi.hoisted(() => ({
  push: vi.fn(),
  grant: vi.fn(),
  generate: vi.fn(),
}));

// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in privacy/use-health-consent.test.tsx, so here consent is always on record.
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeCard: () => null }));
vi.mock('@/features/preferences/components/household-section', () => ({
  HouseholdSection: () => <p>household editor</p>,
}));

let mockUser: { aiDataConsentAt: Date | null } | undefined;

vi.mock('@/lib/trpc', () => {
  const mutation = (fn: (...a: unknown[]) => unknown) => () => ({
    mutate: fn,
    mutateAsync: fn,
    isPending: false,
  });
  return {
    trpc: {
      useUtils: () => ({
        preferences: { invalidate: vi.fn() },
        dashboard: { invalidate: vi.fn() },
        user: { me: { setData: vi.fn(), fetch: () => Promise.resolve(mockUser) } },
      }),
      preferences: {
        setJobs: {
          useMutation: mutation(() => Promise.resolve({ jobs: ['PLAN_MEALS'], intent: null })),
        },
        updateSafety: { useMutation: mutation(() => Promise.resolve({})) },
        saveProfileBasics: { useMutation: mutation(() => Promise.resolve({})) },
        updateTargets: { useMutation: mutation(() => Promise.resolve({})) },
        setDisplayPreferences: { useMutation: mutation(() => Promise.resolve({})) },
      },
      training: { setDayKinds: { useMutation: mutation(() => Promise.resolve({})) } },
      household: { list: { useQuery: () => ({ data: [] }) } },
      mealPlan: {
        setShape: { useMutation: mutation(() => Promise.resolve({})) },
        getShape: {
          useQuery: () => ({
            data: {
              slots: ['breakfast', 'lunch', 'dinner'],
              days: [0, 1, 2, 3, 4, 5, 6],
              timeCapMins: null,
              weekendNoLimit: false,
              cookingFor: null,
              leftovers: false,
            },
          }),
        },
        generate: { useMutation: () => ({ mutate: m.generate, isPending: false }) },
      },
      profile: { aiProviders: { useQuery: () => ({ data: undefined }) } },
      user: {
        me: { useQuery: () => ({ data: mockUser }) },
        grantAiDataConsent: {
          useMutation: () => ({
            mutate: (_input: undefined, opts?: { onSuccess?: () => void }) => {
              m.grant();
              opts?.onSuccess?.();
            },
            reset: () => undefined,
            isPending: false,
            isError: false,
          }),
        },
      },
    },
  };
});

function renderWizard(isPremium: boolean) {
  render(
    <AiConsentProvider>
      <OnboardingWizard isPremium={isPremium} />
    </AiConsentProvider>,
  );
}

/**
 * Jobs -> Diet -> How you cook -> Goal -> Metrics -> Finish (free tier, no
 * trailing Cuisine step). Keeps clicking Continue until the button reads the
 * finish label, so it does not hard-code a step count.
 */
async function driveToFinish() {
  fireEvent.click(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
    const isFinish = screen.queryByText('Plan my first week') !== null;
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    if (isFinish) return;
  }
  throw new Error('driveToFinish: never reached the finish button within 10 steps');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { aiDataConsentAt: null };
});
afterEach(cleanup);

describe('OnboardingWizard — AC7 AI consent before the first-week generate', () => {
  it('free tier: never asks, generates immediately', async () => {
    renderWizard(false);
    await driveToFinish();

    await waitFor(() => expect(m.generate).toHaveBeenCalledWith({ weekOffset: 0 }));
    expect(screen.queryByTestId('ai-consent-allow')).toBeNull();
    expect(m.push).toHaveBeenCalledWith('/dashboard');
  });

  it('premium tier: asks first; "Not now" sends nothing and still finishes onboarding', async () => {
    renderWizard(true);
    await driveToFinish();

    await waitFor(() => expect(screen.getByTestId('ai-consent-not-now')).toBeTruthy());
    expect(m.generate).not.toHaveBeenCalled();
    // Finishing onboarding itself doesn't wait on the consent decision.
    expect(m.push).toHaveBeenCalledWith('/dashboard');

    fireEvent.click(screen.getByTestId('ai-consent-not-now'));
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.grant).not.toHaveBeenCalled();
  });

  it('premium tier: "Allow" records consent, then generates', async () => {
    renderWizard(true);
    await driveToFinish();

    await waitFor(() => expect(screen.getByTestId('ai-consent-allow')).toBeTruthy());
    fireEvent.click(screen.getByTestId('ai-consent-allow'));

    expect(m.grant).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(m.generate).toHaveBeenCalledWith({ weekOffset: 0 }));
  });
});

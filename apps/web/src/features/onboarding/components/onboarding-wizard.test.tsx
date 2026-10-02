// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from './onboarding-wizard';

// §2.4, T-03.6 (rev 2): the jobs-based wizard — mirrors mobile's
// onboarding-wizard.test.tsx. AC1 (multi-select, Continue disabled at 0) and
// AC2 (Train only hands off to gym setup unchanged).
const m = vi.hoisted(() => ({
  push: vi.fn(),
  setJobs: vi.fn(),
  safety: vi.fn(),
  basics: vi.fn(),
  requestAiConsent: vi.fn(),
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
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => m.requestAiConsent,
}));
vi.mock('@/lib/trpc', () => {
  const mutation = (fn: (...a: unknown[]) => unknown) => () => ({
    mutate: fn,
    mutateAsync: fn,
    isPending: false,
  });
  // setJobs.mutate is called both as a plain fire-and-forget (Finish) and
  // with a per-call { onSuccess } (Skip/"Just looking around") — react-query
  // invokes that callback itself, so the mock has to as well.
  const setJobsMutate = (input: unknown, opts?: { onSuccess?: () => void }): unknown => {
    const result: unknown = m.setJobs(input, opts);
    opts?.onSuccess?.();
    return result;
  };
  return {
    trpc: {
      useUtils: () => ({
        preferences: { invalidate: vi.fn() },
        dashboard: { invalidate: vi.fn() },
      }),
      preferences: {
        setJobs: {
          useMutation: () => ({ mutate: setJobsMutate, mutateAsync: m.setJobs, isPending: false }),
        },
        updateSafety: { useMutation: mutation((...a) => m.safety(...a)) },
        saveProfileBasics: { useMutation: mutation((...a) => m.basics(...a)) },
        updateTargets: { useMutation: mutation(() => Promise.resolve({})) },
        setDisplayPreferences: { useMutation: mutation(() => Promise.resolve({})) },
      },
      training: { setDayKinds: { useMutation: mutation(() => Promise.resolve({})) } },
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
        generate: { useMutation: mutation(() => undefined) },
      },
    },
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.setJobs.mockResolvedValue({ jobs: ['PLAN_MEALS'], intent: 'EAT_BETTER' });
  m.safety.mockResolvedValue({});
  m.basics.mockResolvedValue({});
});

describe('OnboardingWizard — jobs step (§2.4, T-03.6)', () => {
  it('asks "What should Chefer help with?" first, Continue disabled at 0 (AC1)', () => {
    render(<OnboardingWizard isPremium={false} />);
    expect(screen.getByRole('heading', { name: 'What should Chefer help with?' })).toBeTruthy();
    expect(screen.getByText('Getting started')).toBeTruthy();
    expect(screen.queryByText(/% complete/)).toBeNull();
    expect(screen.getByTestId('onboarding-continue').getAttribute('disabled')).toBe('');
  });

  it('selecting a job enables Continue and its label counts (AC1)', () => {
    render(<OnboardingWizard isPremium={false} />);
    fireEvent.click(screen.getByTestId('onboarding-job-PLAN_MEALS'));
    expect(screen.getByText('Continue — 1 selected')).toBeTruthy();
    expect(screen.getByTestId('onboarding-continue').hasAttribute('disabled')).toBe(false);
  });

  it('tapping a selected card deselects it (AC1)', () => {
    render(<OnboardingWizard isPremium={false} />);
    const card = screen.getByTestId('onboarding-job-TRAIN');
    fireEvent.click(card);
    expect(card.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(card);
    expect(card.getAttribute('aria-checked')).toBe('false');
  });

  it('Feed my household adds "Who\'s at your table?" before the food steps (AC4)', async () => {
    render(<OnboardingWizard isPremium={false} />);
    fireEvent.click(screen.getByTestId('onboarding-job-HOUSEHOLD'));
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Who's at your table?" })).toBeTruthy(),
    );
    expect(m.setJobs).toHaveBeenCalledWith({ jobs: ['HOUSEHOLD'] });
    expect(screen.getByText('household editor')).toBeTruthy();
  });

  it('Train only goes straight to gym setup — no food wizard first (AC2)', async () => {
    render(<OnboardingWizard isPremium={false} />);
    fireEvent.click(screen.getByTestId('onboarding-job-TRAIN'));
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/gym/setup'));
    expect(m.setJobs).toHaveBeenCalledWith({ jobs: ['TRAIN'] });
  });

  it('"Just looking around" saves PLAN_MEALS and lands on the dashboard', async () => {
    render(<OnboardingWizard isPremium={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Just looking around' }));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/dashboard'));
    const [input, opts] = m.setJobs.mock.calls[0] as [
      { jobs: string[] },
      { onSuccess?: () => void } | undefined,
    ];
    expect(input).toEqual({ jobs: ['PLAN_MEALS'] });
    expect(typeof opts?.onSuccess).toBe('function');
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from './onboarding-wizard';

// UX-ONB-09 (web parity): Finish used to fail silently and could be pressed
// again mid-save.

const m = vi.hoisted(() => ({
  push: vi.fn(),
  generate: vi.fn(),
  setJobs: vi.fn(),
  setShape: vi.fn(),
}));

vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
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
        mealPlan: { invalidate: vi.fn() },
        shoppingList: { invalidate: vi.fn() },
      }),
      preferences: {
        setJobs: { useMutation: mutation((...a) => m.setJobs(...a)) },
        updateSafety: { useMutation: mutation(() => Promise.resolve({})) },
        saveProfileBasics: { useMutation: mutation(() => Promise.resolve({})) },
        updateTargets: { useMutation: mutation(() => Promise.resolve({})) },
        setDisplayPreferences: { useMutation: mutation(() => Promise.resolve({})) },
      },
      training: { setDayKinds: { useMutation: mutation(() => Promise.resolve({})) } },
      mealPlan: {
        setShape: { useMutation: mutation((...a) => m.setShape(...a)) },
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
    },
  };
});

async function driveToFinish() {
  render(<OnboardingWizard isPremium={false} />);
  fireEvent.click(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
    if (screen.queryByText('Plan my first week') !== null) return;
    fireEvent.click(screen.getByTestId('onboarding-continue'));
  }
  throw new Error('never reached the finish button');
}

beforeEach(() => {
  vi.clearAllMocks();
  m.setJobs.mockResolvedValue({ jobs: ['PLAN_MEALS'] });
  m.setShape.mockResolvedValue({});
});
afterEach(cleanup);

describe('OnboardingWizard Finish (UX-ONB-09)', () => {
  it('a failing save step shows its error and Finish can be pressed again', async () => {
    m.setShape.mockRejectedValueOnce(new Error('Could not save your plan shape.'));
    await driveToFinish();
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByText('Could not save your plan shape.')).toBeTruthy();
    expect(m.generate).not.toHaveBeenCalled();
    expect((screen.getByTestId('onboarding-continue') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(m.generate).toHaveBeenCalled());
    expect(screen.queryByText('Could not save your plan shape.')).toBeNull();
  });

  it('a second press mid-save does not start a second save', async () => {
    let release!: () => void;
    m.setShape.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await driveToFinish();
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(m.setShape).toHaveBeenCalledTimes(1));
    const jobsSaves = m.setJobs.mock.calls.length;
    expect((screen.getByTestId('onboarding-continue') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    expect(m.setJobs).toHaveBeenCalledTimes(jobsSaves);
    expect(m.setShape).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(m.generate).toHaveBeenCalledTimes(1));
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_WIZARD_DATA, type WizardData } from '../types';
import { OnboardingWizard } from './onboarding-wizard';

// WP-08: the goal step asks "What do you want to keep an eye on?" — "Just
// protein" is saved at Finish through preferences.setNumbersMode (never before,
// so an abandoned setup changes nothing), and only when it differs from what is
// saved.

const m = vi.hoisted(() => ({
  push: vi.fn(),
  generate: vi.fn(),
  setJobs: vi.fn(),
  setShape: vi.fn(),
  setNumbersMode: vi.fn(),
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
        // WP-08: "Just protein" is saved at Finish.
        setNumbersMode: { useMutation: mutation((...a) => m.setNumbersMode(...a)) },
        setDisplayPreferences: { useMutation: mutation(() => Promise.resolve({})) },
      },
      training: { setDayKinds: { useMutation: mutation(() => Promise.resolve({})) } },
      household: { list: { useQuery: () => ({ data: [] }) } },
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

/** Drives a free PLAN_MEALS setup up to the goal step. */
async function driveToGoalStep(initialData: WizardData = EMPTY_WIZARD_DATA) {
  render(<OnboardingWizard isPremium={false} initialData={initialData} />);
  fireEvent.click(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
    if (screen.queryByTestId('goal-good-food') !== null) return;
    fireEvent.click(screen.getByTestId('onboarding-continue'));
  }
  throw new Error('never reached the goal step');
}

async function finish() {
  for (let i = 0; i < 10; i++) {
    if (screen.queryByText('Plan my first week') !== null) break;
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
  }
  fireEvent.click(screen.getByTestId('onboarding-continue'));
  await waitFor(() => expect(m.generate).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  m.setJobs.mockResolvedValue({ jobs: ['PLAN_MEALS'] });
  m.setShape.mockResolvedValue({});
  m.setNumbersMode.mockResolvedValue({ numbersMode: 'PROTEIN_ONLY' });
});
afterEach(cleanup);

describe('OnboardingWizard — what to keep an eye on (WP-08)', () => {
  it('the goal step asks the question with "Calories and macros" picked by default', async () => {
    await driveToGoalStep();
    expect(
      screen.getByRole('radiogroup', { name: 'What do you want to keep an eye on?' }),
    ).toBeTruthy();
    expect(screen.getByTestId('onb-numbers-full').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('onb-numbers-protein').textContent).toContain('Just protein');
    expect(screen.getByTestId('onb-numbers-protein').className).toContain('min-h-11');
  });

  it('"Just protein" is saved at Finish, not before', async () => {
    await driveToGoalStep();
    fireEvent.click(screen.getByTestId('onb-numbers-protein'));
    expect(screen.getByTestId('onb-numbers-protein').getAttribute('aria-checked')).toBe('true');
    expect(m.setNumbersMode).not.toHaveBeenCalled();
    await finish();
    expect(m.setNumbersMode).toHaveBeenCalledTimes(1);
    expect(m.setNumbersMode).toHaveBeenCalledWith({ numbersMode: 'PROTEIN_ONLY' });
  });

  it('leaving the default alone saves nothing', async () => {
    await driveToGoalStep();
    await finish();
    expect(m.setNumbersMode).not.toHaveBeenCalled();
  });

  it('a re-run starts from the saved mode, and picking the full numbers saves FULL', async () => {
    await driveToGoalStep({ ...EMPTY_WIZARD_DATA, numbersMode: 'PROTEIN_ONLY' });
    expect(screen.getByTestId('onb-numbers-protein').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('onb-numbers-full'));
    await finish();
    expect(m.setNumbersMode).toHaveBeenCalledWith({ numbersMode: 'FULL' });
  });

  it('"Just good food" shows no numbers at all, so the question goes and nothing is saved', async () => {
    await driveToGoalStep();
    fireEvent.click(screen.getByTestId('onb-numbers-protein'));
    fireEvent.click(screen.getByTestId('goal-good-food'));
    expect(screen.queryByTestId('onb-numbers-choice')).toBeNull();
    await finish();
    expect(m.setNumbersMode).not.toHaveBeenCalled();
  });
});

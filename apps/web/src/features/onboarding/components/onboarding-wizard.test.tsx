// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from './onboarding-wizard';

// Backlog P2-3 (audit F-PM-6): step 0 routes each audience.
const m = vi.hoisted(() => ({
  push: vi.fn(),
  setIntent: vi.fn(),
  safety: vi.fn(),
  setup: vi.fn(),
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
      preferences: {
        setIntent: { useMutation: mutation((...a) => m.setIntent(...a)) },
        setup: { useMutation: mutation((...a) => m.setup(...a)) },
        updateSafety: { useMutation: mutation((...a) => m.safety(...a)) },
        saveProfileBasics: { useMutation: mutation(() => Promise.resolve({})) },
      },
    },
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.setIntent.mockResolvedValue({});
  m.safety.mockResolvedValue({});
});

const pick = (name: RegExp) => fireEvent.click(screen.getByRole('radio', { name }));
const next = () =>
  fireEvent.click(screen.getByRole('button', { name: /Continue|Set up training/ }));

describe('OnboardingWizard — intent step (P2-3)', () => {
  it('asks "What brings you here?" first while unanswered', () => {
    render(<OnboardingWizard isPremium={false} />);
    expect(screen.getByRole('heading', { name: 'What brings you here?' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  });

  it('households go to "Who\'s at your table?" before the food steps', async () => {
    render(<OnboardingWizard isPremium={false} />);
    pick(/Feed my household/);
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
    next();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: "Who's at your table?" })).toBeTruthy(),
    );
    expect(m.setIntent).toHaveBeenCalledWith({ intent: 'HOUSEHOLD' });
    expect(screen.getByText('household editor')).toBeTruthy();
  });

  it('gym-goers go straight to gym setup — no food wizard first (F-PM-6)', async () => {
    render(<OnboardingWizard isPremium={false} />);
    pick(/Train/);
    next();
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/gym/setup'));
    expect(m.setIntent).toHaveBeenCalledWith({ intent: 'TRAIN' });
  });

  it('"Skip this question" keeps the solo flow working without saving an intent', () => {
    render(<OnboardingWizard isPremium={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    expect(m.setIntent).not.toHaveBeenCalled();
  });

  it('a saved intent skips the question; the premium flow has no serving-size step', () => {
    render(<OnboardingWizard isPremium initialIntent="TRAIN" />);
    expect(screen.queryByRole('heading', { name: 'What brings you here?' })).toBeNull();
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.queryByText(/How many people are you cooking for/)).toBeNull();
  });
});

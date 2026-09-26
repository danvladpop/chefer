// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreferencesForm } from './preferences-form';

// Backlog P2-6 / audit F-DASH-3-2: units and currency are editable on every
// tier and save through the free setDisplayPreferences procedure.
const m = vi.hoisted(() => ({
  safety: vi.fn(),
  display: vi.fn(),
  targets: vi.fn<[Record<string, unknown>], Promise<unknown>>(),
  computeTargets: vi.fn<[unknown], { data: unknown }>(() => ({ data: undefined })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('./household-section', () => ({ HouseholdSection: () => null }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeCard: () => null }));
vi.mock('@/lib/trpc', () => {
  const invalidate = () => Promise.resolve();
  return {
    trpc: {
      useUtils: () => ({
        preferences: { get: { invalidate } },
        dashboard: { invalidate },
        mealPlan: { invalidate },
        gym: { invalidate },
      }),
      preferences: {
        updateSafety: { useMutation: () => ({ mutateAsync: m.safety, isPending: false }) },
        setDisplayPreferences: {
          useMutation: () => ({ mutateAsync: m.display, isPending: false }),
        },
        updateTargets: { useMutation: () => ({ mutateAsync: m.targets, isPending: false }) },
        computeTargets: { useQuery: (input: unknown) => m.computeTargets(input) },
      },
    },
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.safety.mockResolvedValue({});
  m.display.mockResolvedValue({});
  m.targets.mockResolvedValue({});
});

const profile = {
  goal: null,
  biologicalSex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
  dailyCalorieTarget: null,
  weeklyBudgetEur: 55.56,
  deliveryCurrency: 'USD',
  preferredUnits: 'METRIC',
};

describe('PreferencesForm — units & currency', () => {
  it('lets a FREE user switch units and currency', async () => {
    render(<PreferencesForm chefProfile={profile} dietaryPreferences={null} isPremium={false} />);

    fireEvent.click(screen.getByRole('radio', { name: /Imperial/ }));
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'GBP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() =>
      expect(m.display).toHaveBeenCalledWith({ preferredUnits: 'IMPERIAL', currency: 'GBP' }),
    );
    expect(m.targets).not.toHaveBeenCalled();
  });

  it('skips the display save when nothing changed', async () => {
    render(<PreferencesForm chefProfile={profile} dietaryPreferences={null} isPremium={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(m.safety).toHaveBeenCalled());
    expect(m.display).not.toHaveBeenCalled();
  });

  it('shows the budget in the user currency and stores it in EUR', async () => {
    render(<PreferencesForm chefProfile={profile} dietaryPreferences={null} isPremium />);
    expect(screen.getByPlaceholderText('e.g. 60')).toHaveProperty('value', '60');
    expect(screen.getByText('$')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(m.targets).toHaveBeenCalled());
    const payload = m.targets.mock.calls[0]?.[0];
    expect(payload?.['weeklyBudgetEur']).toBe(55.56);
    // Units/currency no longer ride on the premium save.
    expect(payload).not.toHaveProperty('preferredUnits');
    expect(payload).not.toHaveProperty('deliveryCurrency');
  });
});

describe('PreferencesForm — macro preview', () => {
  const body = {
    ...profile,
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'MALE',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE',
  };

  it('shows the server targets and the lifter note for a lifter', () => {
    m.computeTargets.mockReturnValue({
      data: {
        dailyCalorieTarget: 3060,
        proteinG: 144,
        carbsG: 387,
        fatG: 85,
        proteinPct: 19,
        carbsPct: 51,
        fatPct: 25,
        lifter: { bodyweightKg: 80, proteinGPerKg: 1.8 },
      },
    });
    render(<PreferencesForm chefProfile={body} dietaryPreferences={null} isPremium />);
    expect(m.computeTargets).toHaveBeenCalledWith(
      expect.objectContaining({ goal: 'GAIN_MUSCLE', weightKg: 80 }),
    );
    expect(screen.getByText('144g')).toBeTruthy();
    expect(screen.getByText('Protein (19%)')).toBeTruthy();
    expect(screen.getByTestId('preferences-lifter-note').textContent).toBe(
      'Protein set from your bodyweight (1.8 g/kg) because you train.',
    );
  });

  it('has no lifter note for a non-lifter', () => {
    m.computeTargets.mockReturnValue({
      data: {
        dailyCalorieTarget: 3060,
        proteinG: 176,
        carbsG: 355,
        fatG: 85,
        proteinPct: 23,
        carbsPct: 46,
        fatPct: 25,
        lifter: null,
      },
    });
    render(<PreferencesForm chefProfile={body} dietaryPreferences={null} isPremium />);
    expect(screen.getByText('176g')).toBeTruthy();
    expect(screen.queryByTestId('preferences-lifter-note')).toBeNull();
  });
});

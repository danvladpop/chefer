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
// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in privacy/use-health-consent.test.tsx, so here consent is always on record.
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('./household-section', () => ({ HouseholdSection: () => null }));
vi.mock('@/features/safety/components/SafetyReviewCard', () => ({ SafetyReviewCard: () => null }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeCard: () => null }));
vi.mock('@/lib/trpc', () => {
  const invalidate = () => Promise.resolve();
  return {
    trpc: {
      useUtils: () => ({
        preferences: { get: { invalidate } },
        dashboard: { invalidate, summary: { invalidate } },
        mealPlan: { invalidate },
        gym: { invalidate },
        targets: { get: { invalidate }, changes: { invalidate } },
        tracker: { getDay: { invalidate } },
      }),
      preferences: {
        updateSafety: { useMutation: () => ({ mutateAsync: m.safety, isPending: false }) },
        setDisplayPreferences: {
          useMutation: () => ({ mutateAsync: m.display, isPending: false }),
        },
        updateTargets: { useMutation: () => ({ mutateAsync: m.targets, isPending: false }) },
        computeTargets: { useQuery: (input: unknown) => m.computeTargets(input) },
        // WP-08: the merged numbers settings.
        setNumbersMode: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        setHomeDisplay: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
      // TargetsCard (§2.11, T-35.3) — not under test here.
      targets: {
        get: { useQuery: () => ({ data: undefined, isLoading: true }) },
        set: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }) },
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

// UX-ACC-01: a term typed in "Something else?" but never added with "Add" must
// be in what "Save preferences" stores.
describe('PreferencesForm — typed-but-unadded safety term (UX-ACC-01)', () => {
  it('stores "sesame" together with the ticked allergies', async () => {
    render(<PreferencesForm chefProfile={profile} dietaryPreferences={null} isPremium={false} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Peanuts' }));
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'sesame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(m.safety).toHaveBeenCalled());
    const [payload] = m.safety.mock.calls[0] as [{ allergies: string[] }];
    expect(payload.allergies).toEqual(expect.arrayContaining(['Peanuts', 'Sesame']));
  });

  it('does not save while a typed term still needs a Keep/Remove choice', async () => {
    render(<PreferencesForm chefProfile={profile} dietaryPreferences={null} isPremium={false} />);
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'zzqqxx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(m.safety).not.toHaveBeenCalled();
    expect(screen.getByTestId('safety-save-blocked')).toBeTruthy();
  });
});

// WP-08: what to keep an eye on is free on every tier, so a free user still
// reaches it (their locked targets panel carries none of it).
describe('PreferencesForm — numbers settings (WP-08)', () => {
  const numbersSettings = { numbersMode: 'PROTEIN_ONLY', showNutritionOnToday: true };

  it('a FREE user gets the numbers choice and the Today switch', () => {
    render(
      <PreferencesForm
        chefProfile={profile}
        dietaryPreferences={null}
        isPremium={false}
        numbersSettings={numbersSettings}
      />,
    );
    const card = screen.getByTestId('numbers-settings-free');
    expect(card.contains(screen.getByTestId('prefs-numbers-mode-protein'))).toBe(true);
    expect(screen.getByTestId('prefs-numbers-mode-protein').getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(card.contains(screen.getByTestId('prefs-home-display-switch'))).toBe(true);
  });

  it('a PREMIUM user gets them inside "Your targets", once', () => {
    render(
      <PreferencesForm
        chefProfile={profile}
        dietaryPreferences={null}
        isPremium
        numbersSettings={numbersSettings}
      />,
    );
    expect(screen.queryByTestId('numbers-settings-free')).toBeNull();
    expect(screen.getAllByTestId('prefs-numbers-mode-protein')).toHaveLength(1);
    const card = screen.getByRole('heading', { name: 'Your targets' }).closest('section');
    expect(card?.contains(screen.getByTestId('prefs-home-display-switch'))).toBe(true);
  });
});

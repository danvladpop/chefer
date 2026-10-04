// @vitest-environment jsdom
import { NumbersModeProvider } from '@/features/numbers-mode/numbers-mode';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NumbersSettingsSection } from './numbers-settings-section';
import { TargetsCard } from './TargetsCard';

// WP-08: Preferences → Your targets is ONE card that holds the numbers mode
// ("What do you want to keep an eye on?") and the older "Show calories and
// macros on Today" switch. Each setting calls only its own procedure.

const m = vi.hoisted(() => ({
  setNumbersMode: vi.fn(),
  setHomeDisplay: vi.fn(),
  invalidateAll: vi.fn(),
  failMode: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      invalidate: m.invalidateAll,
      preferences: { invalidate: vi.fn() },
      dashboard: { invalidate: vi.fn() },
      targets: { get: { invalidate: vi.fn() }, changes: { invalidate: vi.fn() } },
      tracker: { getDay: { invalidate: vi.fn() } },
    }),
    preferences: {
      setNumbersMode: {
        useMutation: (opts: {
          onSuccess?: (r: { numbersMode: string }) => void;
          onError?: () => void;
        }) => ({
          isPending: false,
          isError: false,
          error: null,
          mutate: (input: { numbersMode: string }) => {
            m.setNumbersMode(input);
            if (m.failMode) opts.onError?.();
            else opts.onSuccess?.({ numbersMode: input.numbersMode });
          },
        }),
      },
      setHomeDisplay: {
        useMutation: (opts: { onSuccess?: (r: { showNutritionOnToday: boolean }) => void }) => ({
          isPending: false,
          isError: false,
          error: null,
          mutate: (input: { showNutritionOnToday: boolean }) => {
            m.setHomeDisplay(input);
            opts.onSuccess?.({ showNutritionOnToday: input.showNutritionOnToday });
          },
        }),
      },
    },
    targets: {
      get: {
        useQuery: () => ({
          data: {
            targetMode: 'SUGGESTED',
            effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
            suggested: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
            inputs: { weightKg: 80 },
            custom: { kcal: null, proteinG: null, carbsG: null, fatG: null },
            proteinWhy: {
              effectiveG: 150,
              gPerKg: 1.9,
              referenceGPerKg: 1.6,
              referenceG: 128,
              differs: true,
              reason: 'GOAL_SPLIT',
              sentence:
                'Your protein target is 150 g a day, about 1.9 g per kg. It comes from how your goal splits your calories, not from the usual 1.6 g per kg (128 g for you).',
            },
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      set: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
      },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.failMode = false;
});

describe('NumbersSettingsSection (WP-08)', () => {
  it('picking "Just protein" calls setNumbersMode and nothing else, then refreshes every screen', () => {
    render(<NumbersSettingsSection initialMode={null} initialShowNutrition />);
    expect(screen.getByTestId('prefs-numbers-mode-full').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('prefs-numbers-mode-protein'));
    expect(m.setNumbersMode).toHaveBeenCalledWith({ numbersMode: 'PROTEIN_ONLY' });
    expect(m.setHomeDisplay).not.toHaveBeenCalled();
    expect(m.invalidateAll).toHaveBeenCalled();
    expect(screen.getByTestId('prefs-numbers-mode-protein').getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('switching back to "Calories and macros" restores the full mode', () => {
    render(<NumbersSettingsSection initialMode="PROTEIN_ONLY" initialShowNutrition />);
    expect(screen.getByTestId('prefs-numbers-mode-protein').getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByTestId('prefs-numbers-mode-full'));
    expect(m.setNumbersMode).toHaveBeenCalledWith({ numbersMode: 'FULL' });
    expect(m.invalidateAll).toHaveBeenCalled();
  });

  it('tapping the mode that is already picked saves nothing', () => {
    render(<NumbersSettingsSection initialMode="PROTEIN_ONLY" initialShowNutrition />);
    fireEvent.click(screen.getByTestId('prefs-numbers-mode-protein'));
    expect(m.setNumbersMode).not.toHaveBeenCalled();
  });

  it('the Today switch calls setHomeDisplay only, and leaves the mode alone', () => {
    render(<NumbersSettingsSection initialMode="PROTEIN_ONLY" initialShowNutrition />);
    fireEvent.click(screen.getByTestId('prefs-home-display-switch'));
    expect(m.setHomeDisplay).toHaveBeenCalledWith({ showNutritionOnToday: false });
    expect(m.setNumbersMode).not.toHaveBeenCalled();
    expect(screen.getByTestId('prefs-numbers-mode-protein').getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('NONE (reserved, WP-16) and unknown values read as the full numbers', () => {
    render(<NumbersSettingsSection initialMode="NONE" initialShowNutrition={false} />);
    expect(screen.getByTestId('prefs-numbers-mode-full').getAttribute('aria-checked')).toBe('true');
  });

  it('a failed save rolls the pick back and says so', () => {
    m.failMode = true;
    render(<NumbersSettingsSection initialMode={null} initialShowNutrition />);
    fireEvent.click(screen.getByTestId('prefs-numbers-mode-protein'));
    expect(screen.getByTestId('prefs-numbers-mode-full').getAttribute('aria-checked')).toBe('true');
  });

  it('the choice is a labelled radio group with 44px targets', () => {
    render(<NumbersSettingsSection initialMode={null} initialShowNutrition />);
    expect(
      screen.getByRole('radiogroup', { name: 'What do you want to keep an eye on?' }),
    ).toBeTruthy();
    expect(screen.getByTestId('prefs-numbers-mode-protein').className).toContain('min-h-11');
    expect(screen.getByRole('switch', { name: 'Show calories and macros on Today' })).toBeTruthy();
  });
});

describe('TargetsCard — merged numbers settings (WP-08)', () => {
  it('holds the mode choice and the Today switch inside Your targets', () => {
    render(<TargetsCard numbersSettings={{ numbersMode: null, showNutritionOnToday: true }} />);
    const card = screen.getByRole('heading', { name: 'Your targets' }).closest('section');
    expect(card?.contains(screen.getByTestId('prefs-numbers-mode-protein'))).toBe(true);
    expect(card?.contains(screen.getByTestId('prefs-home-display-switch'))).toBe(true);
    // Full mode keeps the calorie number.
    expect(screen.getByTestId('targets-suggested-kcal').textContent).toContain('2,200');
  });

  it('without numbersSettings (onboarding) the card is unchanged', () => {
    render(<TargetsCard />);
    expect(screen.queryByTestId('targets-numbers-settings')).toBeNull();
  });

  it('protein-only: shows the protein number and "Why this protein number?" opens the API sentence', () => {
    render(
      <NumbersModeProvider mode="PROTEIN_ONLY">
        <TargetsCard
          numbersSettings={{ numbersMode: 'PROTEIN_ONLY', showNutritionOnToday: true }}
        />
      </NumbersModeProvider>,
    );
    expect(screen.getByTestId('targets-suggested-protein').textContent).toBe('150 g protein a day');
    expect(screen.queryByTestId('targets-suggested-kcal')).toBeNull();
    fireEvent.click(screen.getByTestId('targets-protein-why'));
    const sheet = screen.getByTestId('protein-why-sheet');
    expect(sheet.textContent).toContain('about 1.9 g per kg');
    expect(sheet.textContent).toContain('not from the usual 1.6 g per kg (128 g for you)');
    expect(sheet.textContent).toContain('Per kg of bodyweight');
    expect(sheet.textContent).toContain('At 1.6 g per kg');
    expect(sheet.textContent).not.toMatch(/kcal/i);
  });
});

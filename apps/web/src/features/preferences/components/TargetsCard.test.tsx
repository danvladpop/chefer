// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetsCard } from './TargetsCard';

// §2.11, T-35.3 — Suggested / My own, AC1 and AC4 at the client layer.

interface TargetsGetData {
  targetMode: 'SUGGESTED' | 'OWN';
  effective: { dailyCalorieTarget: number; proteinG: number; carbsG: number; fatG: number };
  suggested: { dailyCalorieTarget: number; proteinG: number; carbsG: number; fatG: number };
  inputs?: { weightKg: number | null };
  custom: {
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  };
}
interface SetMutationState {
  isPending: boolean;
  isSuccess: boolean;
  error: null | { message: string };
}

const m = vi.hoisted(() => {
  const state: {
    set: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
    getData: TargetsGetData | undefined;
    getFailed: boolean;
    refetch: ReturnType<typeof vi.fn>;
    setState: SetMutationState;
  } = {
    set: vi.fn(),
    invalidate: vi.fn(),
    getData: undefined,
    getFailed: false,
    refetch: vi.fn(),
    setState: { isPending: false, isSuccess: false, error: null },
  };
  return state;
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      targets: { get: { invalidate: m.invalidate }, changes: { invalidate: m.invalidate } },
      tracker: { getDay: { invalidate: m.invalidate } },
      dashboard: { summary: { invalidate: m.invalidate } },
    }),
    targets: {
      get: {
        useQuery: () => ({
          data: m.getData,
          isLoading: !m.getData && !m.getFailed,
          isError: m.getFailed && !m.getData,
          refetch: m.refetch,
        }),
      },
      set: {
        useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
          mutate: (input: unknown) => {
            m.set(input);
            opts?.onSuccess?.();
          },
          ...m.setState,
        }),
      },
    },
  },
}));

const SUGGESTED_DATA = {
  targetMode: 'SUGGESTED' as const,
  effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  suggested: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  custom: { kcal: null, proteinG: null, carbsG: null, fatG: null },
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.getData = SUGGESTED_DATA;
  m.getFailed = false;
  m.setState = { isPending: false, isSuccess: false, error: null };
});

describe('TargetsCard', () => {
  it('shows the suggested numbers by default', () => {
    render(<TargetsCard />);
    expect(screen.getByText('2,200 kcal')).toBeTruthy();
  });

  it('switching to My own reveals editable fields prefilled from suggested', () => {
    render(<TargetsCard />);
    fireEvent.click(screen.getByTestId('targets-mode-own'));
    expect(screen.getByDisplayValue('2200')).toBeTruthy();
  });

  it('rejects calories below the 1,200 floor before sending (AC4)', () => {
    render(<TargetsCard />);
    fireEvent.click(screen.getByTestId('targets-mode-own'));
    fireEvent.change(screen.getByTestId('targets-kcal'), { target: { value: '900' } });
    fireEvent.click(screen.getByTestId('targets-save'));

    expect(m.set).not.toHaveBeenCalled();
    expect(screen.getByTestId('targets-error').textContent).toMatch(/1,200 and 5,000/);
  });

  it('saves an own target with all four numbers (AC1)', () => {
    render(<TargetsCard />);
    fireEvent.click(screen.getByTestId('targets-mode-own'));
    fireEvent.change(screen.getByTestId('targets-kcal'), { target: { value: '2500' } });
    fireEvent.click(screen.getByTestId('targets-save'));

    expect(m.set).toHaveBeenCalledWith(
      expect.objectContaining({ targetMode: 'OWN', kcal: 2500, proteinG: 150 }),
    );
  });
});

// UX-X-12: a failed load is not "Loading…" forever.
describe('TargetsCard — failed load (UX-X-12)', () => {
  it('shows an error with Try again, and Try again refetches', () => {
    m.getData = undefined;
    m.getFailed = true;
    render(<TargetsCard />);
    expect(screen.getByTestId('targets-card-error')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(m.refetch).toHaveBeenCalled();
  });

  it('still says Loading… while the first load is in flight', () => {
    m.getData = undefined;
    render(<TargetsCard />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByTestId('targets-card-error')).toBeNull();
  });
});

// UX-FOOD-14: the onboarding targets step showed the 2,000 kcal default
// because the metrics are only saved when setup finishes.
describe('TargetsCard — previewKcal (onboarding, UX-FOOD-14)', () => {
  const DEFAULTS = {
    ...SUGGESTED_DATA,
    effective: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
    suggested: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
    inputs: { weightKg: null },
  };

  it('shows the number computed from the metrics entered, not the default', () => {
    m.getData = DEFAULTS;
    render(<TargetsCard previewKcal={1492} />);
    expect(screen.getByTestId('targets-suggested-kcal').textContent).toContain('1,492');
    expect(screen.queryByText(/2,000 kcal/)).toBeNull();
  });

  it('prefills My own from the preview with macros scaled to fit it', () => {
    m.getData = DEFAULTS;
    render(<TargetsCard previewKcal={1500} />);
    fireEvent.click(screen.getByTestId('targets-mode-own'));
    expect(screen.getByTestId('targets-kcal')).toHaveProperty('value', '1500');
    // 2000 -> 1500 kcal is x0.75
    expect(screen.getByTestId('targets-protein')).toHaveProperty('value', '94');
    expect(screen.getByTestId('targets-carbs')).toHaveProperty('value', '169');
    expect(screen.getByTestId('targets-fat')).toHaveProperty('value', '50');
  });

  it('ignores the preview once the server knows the body', () => {
    m.getData = { ...DEFAULTS, inputs: { weightKg: 80 } };
    render(<TargetsCard previewKcal={1492} />);
    expect(screen.getByTestId('targets-suggested-kcal').textContent).toContain('2,000');
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanSettingsSheet } from './PlanSettingsSheet';

// T-07.6 (web parity of the mobile HowYouCookForm/plan-settings-sheet.tsx):
// the live summary line, meal/day chip validation ("pick at least one"),
// hasPlan-aware footer copy, and save → onSaved/onClose.

const mocks = vi.hoisted(() => {
  const LEGACY_SHAPE = {
    slots: ['breakfast', 'lunch', 'dinner'],
    days: [0, 1, 2, 3, 4, 5, 6],
    timeCapMins: null,
    weekendNoLimit: false,
    cookingFor: null,
    leftovers: false,
  };
  const state: { shapeData: typeof LEGACY_SHAPE | undefined } = { shapeData: LEGACY_SHAPE };
  return {
    LEGACY_SHAPE,
    setShapeMutate: vi.fn((_input: unknown, opts?: { onSuccess?: (saved: unknown) => void }) =>
      opts?.onSuccess?.(LEGACY_SHAPE),
    ),
    shapeData: state.shapeData,
    shapeFailed: false,
    members: [] as { name: string }[],
    refetch: vi.fn(),
  };
});
const LEGACY_SHAPE = mocks.LEGACY_SHAPE;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    household: { list: { useQuery: () => ({ data: mocks.members }) } },
    mealPlan: {
      getShape: {
        useQuery: () => ({
          data: mocks.shapeData,
          isLoading: false,
          isError: mocks.shapeFailed && !mocks.shapeData,
          refetch: mocks.refetch,
        }),
      },
      setShape: {
        useMutation: () => ({
          mutate: mocks.setShapeMutate,
          isPending: false,
          isError: false,
          error: null,
          reset: vi.fn(),
        }),
      },
    },
  },
}));

vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: ({ source }: { source: string }) => (
    <button data-source={source}>See what Premium adds</button>
  ),
}));

beforeEach(() => {
  mocks.setShapeMutate.mockClear();
  mocks.shapeData = LEGACY_SHAPE;
  mocks.shapeFailed = false;
  mocks.members = [];
  mocks.refetch.mockClear();
});
afterEach(cleanup);

describe('PlanSettingsSheet', () => {
  it('shows the live summary line for the loaded shape', () => {
    render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByTestId('plan-settings-summary').textContent).toMatch(
      /Breakfast, Lunch, Dinner.*every day/,
    );
  });

  it('refuses to drop the last selected meal or day', () => {
    render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={vi.fn()}
      />,
    );
    // Deselect every meal but the last — the last one must stay pressed.
    fireEvent.click(screen.getByTestId('plan-settings-slot-breakfast'));
    fireEvent.click(screen.getByTestId('plan-settings-slot-lunch'));
    fireEvent.click(screen.getByTestId('plan-settings-slot-dinner'));
    expect(screen.getByTestId('plan-settings-slot-dinner').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('plan-settings-summary').textContent).toMatch(/Dinner/);
  });

  it('footer says "Save" for an empty week and "Save and re-plan {week}" once a plan exists', () => {
    const { rerender } = render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByTestId('plan-settings-save').textContent).toBe('Save');

    rerender(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan
        weekLabel="next week"
        isPremium={false}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByTestId('plan-settings-save').textContent).toBe('Save and re-plan next week');
  });

  it('saves the draft and calls onSaved + onClose', () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <PlanSettingsSheet
        open
        onClose={onClose}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByTestId('plan-settings-save'));
    // The mock's `mutate` calls `onSuccess` synchronously (see vi.hoisted
    // above), so onSaved/onClose firing already proves the draft was sent.
    expect(mocks.setShapeMutate.mock.calls[0]?.[0]).toEqual(LEGACY_SHAPE);
    expect(onSaved).toHaveBeenCalledWith(LEGACY_SHAPE);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the leftovers option only for premium', () => {
    render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByTestId('plan-settings-leftovers')).toBeTruthy();
  });

  it('hides the leftovers option for free', () => {
    render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('plan-settings-leftovers')).toBeNull();
  });

  // T-06.8 (UX-06 §4): `Fit meals to my training days` is a premium switch and
  // a locked preview for free.
  it('premium: the fit-training-days switch reports its change to the page', () => {
    const onFit = vi.fn();
    render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium
        onSaved={vi.fn()}
        fitTrainingDays
        onFitTrainingDaysChange={onFit}
      />,
    );
    const sw = screen.getByRole('switch', { name: 'Fit meals to my training days' });
    expect((sw as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sw);
    expect(onFit).toHaveBeenCalledWith(false);
  });

  it('free: the switch is disabled with a lock and a See what Premium adds link', () => {
    render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={vi.fn()}
      />,
    );
    const sw = screen.getByRole('switch', { name: 'Fit meals to my training days' });
    expect((sw as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'See what Premium adds' })).toBeTruthy();
  });
});

// UX-X-12: a failed load is not a spinner forever.
describe('PlanSettingsSheet — failed load', () => {
  it('shows an error with Try again instead of a spinner', () => {
    mocks.shapeData = undefined;
    mocks.shapeFailed = true;
    render(
      <PlanSettingsSheet
        open
        onClose={vi.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByTestId('plan-settings-load-error')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });
});

describe('PlanSettingsSheet — Cooking for with a household (UX-PLAN-12)', () => {
  const sheet = () => (
    <PlanSettingsSheet
      open
      onClose={vi.fn()}
      hasPlan={false}
      weekLabel="this week"
      isPremium={false}
      onSaved={vi.fn()}
    />
  );

  it('shows a read-only "You + 2" with Edit table instead of Just me / Two of us', () => {
    mocks.members = [{ name: 'Mia' }, { name: 'Noah' }];
    render(sheet());
    expect(screen.getByTestId('plan-settings-household-summary').textContent).toMatch(
      /You \+ 2.*Mia, Noah/,
    );
    expect(screen.getByTestId('plan-settings-household-summary-edit').textContent).toBe(
      'Edit table',
    );
    expect(screen.queryByTestId('plan-settings-for-1')).toBeNull();
    expect(screen.getByTestId('plan-settings-summary').textContent).toMatch(/cooking for 3/);
  });

  it('keeps the choice when there are no members', () => {
    render(sheet());
    expect(screen.getByTestId('plan-settings-for-1')).toBeTruthy();
    expect(screen.queryByTestId('plan-settings-household-summary')).toBeNull();
  });
});

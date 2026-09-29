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
  return {
    LEGACY_SHAPE,
    setShapeMutate: vi.fn((_input: unknown, opts?: { onSuccess?: (saved: unknown) => void }) =>
      opts?.onSuccess?.(LEGACY_SHAPE),
    ),
    shapeData: LEGACY_SHAPE,
  };
});
const LEGACY_SHAPE = mocks.LEGACY_SHAPE;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    mealPlan: {
      getShape: { useQuery: () => ({ data: mocks.shapeData, isLoading: false }) },
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

beforeEach(() => {
  mocks.setShapeMutate.mockClear();
  mocks.shapeData = LEGACY_SHAPE;
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
});

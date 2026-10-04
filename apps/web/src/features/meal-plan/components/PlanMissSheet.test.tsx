// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanMissSheet } from './PlanMissSheet';

// T-11.3: neutral under/over-target sheet — Bigger portions (preview then apply),
// Add a snack (never LOSE_WEIGHT, hidden for an unknown goal), Keep it.

const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidate: vi.fn(),
  applied: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { invalidate: m.invalidate },
      shoppingList: { invalidate: m.invalidate },
      dashboard: { invalidate: m.invalidate },
    }),
    mealPlan: {
      scaleDay: {
        // Two mutations share the procedure: the one whose `onSuccess` we get
        // first is the preview; calls with apply=true resolve the apply one.
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
          mutate: (input: { apply: boolean }) => {
            m.mutate(input);
            opts.onSuccess?.({ dayOfWeek: 2, meals: [], kcal: 2010, protein: 120 });
          },
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

const base = {
  open: true,
  onClose: vi.fn(),
  planId: 'p1',
  dayOfWeek: 2,
  dayName: 'Wednesday',
  kcal: 1600,
  target: 2000,
  onApplied: vi.fn(),
};

describe('PlanMissSheet', () => {
  it('previews Bigger portions with apply=false, then applies with apply=true', () => {
    const onApplied = vi.fn();
    const onClose = vi.fn();
    render(<PlanMissSheet {...base} goal="MAINTAIN" onApplied={onApplied} onClose={onClose} />);
    expect(m.mutate).toHaveBeenCalledWith({
      planId: 'p1',
      dayOfWeek: 2,
      factor: 1.25,
      apply: false,
    });
    expect(screen.getByRole('dialog').textContent).toContain('About 400 kcal under target');
    expect(screen.getByRole('dialog').textContent).toContain('about 2,010 kcal · 120 g protein');

    fireEvent.click(screen.getByTestId('plan-miss-portions'));
    expect(m.mutate).toHaveBeenLastCalledWith({
      planId: 'p1',
      dayOfWeek: 2,
      factor: 1.25,
      apply: true,
    });
    expect(m.invalidate).toHaveBeenCalled();
    expect(onApplied).toHaveBeenCalledWith('Wednesday: portions increased.');
    expect(onClose).toHaveBeenCalled();
  });

  it('offers Add a snack for an under-target day on a non-weight-loss goal', () => {
    const onAddSnack = vi.fn();
    render(<PlanMissSheet {...base} goal="GAIN_MUSCLE" onAddSnack={onAddSnack} />);
    fireEvent.click(screen.getByRole('button', { name: /Add a snack/ }));
    expect(onAddSnack).toHaveBeenCalled();
  });

  it('never offers Add a snack for LOSE_WEIGHT, nor when the goal is unknown', () => {
    const { rerender } = render(
      <PlanMissSheet {...base} goal="LOSE_WEIGHT" onAddSnack={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Add a snack/ })).toBeNull();
    rerender(<PlanMissSheet {...base} goal={undefined} onAddSnack={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Add a snack/ })).toBeNull();
    // Keep it is always there.
    expect(screen.getByRole('button', { name: /Keep it/ })).toBeTruthy();
  });

  it('an over-target day offers Smaller portions and no snack', () => {
    render(<PlanMissSheet {...base} kcal={2600} goal="MAINTAIN" onAddSnack={vi.fn()} />);
    expect(screen.getByRole('dialog').textContent).toContain('About 600 kcal over target');
    expect(screen.getByRole('button', { name: /Smaller portions/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add a snack/ })).toBeNull();
  });

  it('Keep it just closes', () => {
    const onClose = vi.fn();
    render(<PlanMissSheet {...base} goal="MAINTAIN" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('plan-miss-keep'));
    expect(onClose).toHaveBeenCalled();
    expect(m.mutate).not.toHaveBeenCalledWith(expect.objectContaining({ apply: true }));
  });

  // UX-PLAN-08 (WP-07): never "Bigger portions (+503 kcal)" on a weight-loss goal.
  describe('weight-loss goal (UX-PLAN-08)', () => {
    it('caps the portion step at +10 %, and says so', () => {
      render(<PlanMissSheet {...base} kcal={1600} target={2000} goal="LOSE_WEIGHT" />);
      // 1600 → 2000 would be ×1.25; a loss goal gets ×1.1.
      expect(m.mutate).toHaveBeenCalledWith({
        planId: 'p1',
        dayOfWeek: 2,
        factor: 1.1,
        apply: false,
      });
      expect(m.mutate).not.toHaveBeenCalledWith(expect.objectContaining({ factor: 1.25 }));
      expect(screen.getByRole('button', { name: /Slightly bigger portions/ })).toBeTruthy();
      expect(screen.getByRole('dialog').textContent).toContain('Held to +10%');
      fireEvent.click(screen.getByTestId('plan-miss-portions'));
      expect(m.mutate).toHaveBeenLastCalledWith({
        planId: 'p1',
        dayOfWeek: 2,
        factor: 1.1,
        apply: true,
      });
    });

    it('answers a protein gap with a protein snack, offered first', () => {
      const onAddSnack = vi.fn();
      render(
        <PlanMissSheet {...base} goal="LOSE_WEIGHT" proteinGapG={36} onAddSnack={onAddSnack} />,
      );
      const options = Array.from(
        screen.getByTestId('plan-miss-sheet').querySelectorAll('button'),
      ).map((b) => b.textContent);
      expect(options[0]).toContain('Add a protein snack');
      expect(options.findIndex((t) => t.includes('portions'))).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: /Add a protein snack/ }));
      expect(onAddSnack).toHaveBeenCalled();
    });

    it('without a protein gap a loss goal still gets no plain snack', () => {
      render(<PlanMissSheet {...base} goal="LOSE_WEIGHT" onAddSnack={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /snack/i })).toBeNull();
    });

    it('other goals keep the full step', () => {
      render(<PlanMissSheet {...base} goal="MAINTAIN" />);
      expect(m.mutate).toHaveBeenCalledWith(expect.objectContaining({ factor: 1.25 }));
      expect(screen.getByRole('button', { name: /^Bigger portions/ })).toBeTruthy();
    });
  });
});

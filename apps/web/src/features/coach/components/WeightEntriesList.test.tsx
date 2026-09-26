// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeightEntriesList } from './WeightEntriesList';

// Backlog P2-6: weigh-ins are stored in kg but shown and edited in the
// user's unit.
const update = vi.fn();
const unitSystem = vi.hoisted(() => {
  const state: { value: 'METRIC' | 'IMPERIAL' } = { value: 'METRIC' };
  return state;
});
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => unitSystem.value }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { weightHistory: { invalidate: vi.fn() } },
      gym: { stats: { bodyweight: { invalidate: vi.fn() } }, bootstrap: { invalidate: vi.fn() } },
    }),
    tracker: {
      updateWeight: { useMutation: () => ({ mutate: update, isPending: false }) },
      deleteWeight: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

const entries = [{ id: 'w1', weightKg: 72.5, recordedAt: new Date('2026-09-20T08:00:00Z') }];

afterEach(cleanup);
beforeEach(() => update.mockClear());

describe('WeightEntriesList units', () => {
  it('shows kg for metric users', () => {
    unitSystem.value = 'METRIC';
    render(<WeightEntriesList entries={entries} />);
    expect(screen.getByText('72.5 kg')).toBeTruthy();
  });

  it('shows and edits pounds for imperial users, saving kg', () => {
    unitSystem.value = 'IMPERIAL';
    render(<WeightEntriesList entries={entries} />);
    expect(screen.getByText('159.8 lb')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Edit 159.8 lb/ }));
    const input = screen.getByRole('textbox', { name: /in pounds/ });
    expect(input).toHaveProperty('value', '159.8');
    // Saving the untouched value keeps the stored kg exactly.
    fireEvent.submit(input.closest('form')!);
    expect(update).toHaveBeenCalledWith({ id: 'w1', weightKg: 72.5 });
  });
});

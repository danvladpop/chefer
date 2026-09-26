// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeightLogForm } from './WeightLogForm';

const mutate = vi.fn();
const unitSystem = vi.hoisted(() => {
  const state: { value: 'METRIC' | 'IMPERIAL' } = { value: 'METRIC' };
  return state;
});
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => unitSystem.value }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { weightHistory: { invalidate: vi.fn() } },
      gym: { stats: { bodyweight: { invalidate: vi.fn() } }, bootstrap: { invalidate: vi.fn() } },
    }),
    tracker: {
      logWeight: { useMutation: () => ({ mutate, isPending: false }) },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  mutate.mockClear();
  unitSystem.value = 'METRIC';
});

function submit(value: string) {
  render(<WeightLogForm />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
}

describe('WeightLogForm (audit F-DASH-3-1)', () => {
  it('blocks 1000 kg with an inline error instead of saving it', () => {
    submit('1000');
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/between 20 and 400 kg/);
  });

  it('explains a negative value instead of silently ignoring it', () => {
    submit('-5');
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('submits on Enter (form submit) with a comma decimal', () => {
    submit('72,5');
    expect(mutate).toHaveBeenCalledWith({ weightKg: 72.5 });
  });
});

describe('WeightLogForm in pounds (backlog P2-6)', () => {
  beforeEach(() => {
    unitSystem.value = 'IMPERIAL';
  });

  it('labels the field in pounds and sends kg', () => {
    submit('160');
    expect(screen.getByRole('textbox').getAttribute('aria-label')).toMatch(/pounds/);
    expect(mutate).toHaveBeenCalledWith({ weightKg: 72.6 });
  });

  it('explains the range in pounds', () => {
    submit('900');
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/between 44 and 881 lb/);
  });
});

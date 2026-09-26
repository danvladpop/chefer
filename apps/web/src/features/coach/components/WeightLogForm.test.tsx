// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeightLogForm } from './WeightLogForm';

const mutate = vi.fn();
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
beforeEach(() => mutate.mockClear());

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

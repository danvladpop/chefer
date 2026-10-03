// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeightLogForm } from './WeightLogForm';

const mutate = vi.fn();
const deleteWeight = vi.hoisted(() => vi.fn());
type ToastCall = { message: string; action?: { label: string; onClick: () => void } };
const showAppToast = vi.hoisted(() =>
  vi.fn((toast: ToastCall) => {
    void toast;
  }),
);
const invalidate = vi.hoisted(() => vi.fn());
const unitSystem = vi.hoisted(() => {
  const state: { value: 'METRIC' | 'IMPERIAL' } = { value: 'METRIC' };
  return state;
});
// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in privacy/use-health-consent.test.tsx, so here consent is always on record.
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => unitSystem.value }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/app-toast', () => ({ showAppToast }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { weightHistory: { invalidate } },
      gym: { stats: { bodyweight: { invalidate } }, bootstrap: { invalidate } },
      client: { tracker: { deleteWeight: { mutate: deleteWeight } } },
    }),
    tracker: {
      logWeight: {
        // Mirrors react-query: a successful `mutate` runs the hook's onSuccess
        // with (server entry, variables).
        useMutation: (opts: {
          onSuccess?: (entry: { id: string }, vars: { weightKg: number }) => void;
        }) => ({
          mutate: (vars: { weightKg: number }) => {
            mutate(vars);
            opts.onSuccess?.({ id: 'w-new' }, vars);
          },
          isPending: false,
        }),
      },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  mutate.mockClear();
  deleteWeight.mockReset();
  showAppToast.mockClear();
  invalidate.mockClear();
  unitSystem.value = 'METRIC';
});

function submit(value: string, props: Parameters<typeof WeightLogForm>[0] = {}) {
  render(<WeightLogForm {...props} />);
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

// UX-FOOD-08: clear on success + Undo toast, and the same-day duplicate guard.
describe('WeightLogForm — log, undo, dedupe (UX-FOOD-08)', () => {
  const textbox = () => screen.getByRole<HTMLInputElement>('textbox');
  const toastAt = (i: number): ToastCall => {
    const toast = showAppToast.mock.calls[i]?.[0];
    if (!toast) throw new Error(`no toast #${i}`);
    return toast;
  };
  const clickUndo = () => {
    const undo = toastAt(0).action;
    if (!undo) throw new Error('the toast has no action');
    undo.onClick();
  };

  it('clears the field and shows "Logged 79.4 kg" with an Undo action', () => {
    submit('79.4');
    expect(mutate).toHaveBeenCalledWith({ weightKg: 79.4 });
    expect(textbox().value).toBe('');
    expect(showAppToast).toHaveBeenCalledTimes(1);
    expect(toastAt(0).message).toBe('Logged 79.4 kg');
    expect(toastAt(0).action?.label).toBe('Undo');
  });

  it('Undo deletes the new entry through tracker.deleteWeight and refreshes the weight views', async () => {
    deleteWeight.mockResolvedValue({ ok: true });
    submit('79.4');
    invalidate.mockClear();
    clickUndo();
    expect(deleteWeight).toHaveBeenCalledWith({ id: 'w-new' });
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(showAppToast).toHaveBeenCalledTimes(1); // no error toast
  });

  it('a failed Undo says so in plain words', async () => {
    deleteWeight.mockRejectedValue(new Error('network down'));
    submit('79.4');
    clickUndo();
    await vi.waitFor(() => expect(showAppToast).toHaveBeenCalledTimes(2));
    expect(toastAt(1).message).not.toMatch(/\{|zod/i);
  });

  it('ignores the same weight (±0.05 kg) logged earlier today, with "Already logged"', () => {
    submit('79.4', { lastEntry: { weightKg: 79.43, recordedAt: new Date() } });
    expect(mutate).not.toHaveBeenCalled();
    expect(textbox().value).toBe('');
    expect(showAppToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Already logged 79.4 kg today' }),
    );
  });

  it('accepts recordedAt as an ISO string (as it arrives over the wire)', () => {
    submit('79.4', { lastEntry: { weightKg: 79.4, recordedAt: new Date().toISOString() } });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('logs a different value on the same day', () => {
    submit('79.5', { lastEntry: { weightKg: 79.4, recordedAt: new Date() } });
    expect(mutate).toHaveBeenCalledWith({ weightKg: 79.5 });
  });

  it('logs the same value when the newest entry is from another day', () => {
    const yesterday = new Date(Date.now() - 36 * 3_600_000);
    submit('79.4', { lastEntry: { weightKg: 79.4, recordedAt: yesterday } });
    expect(mutate).toHaveBeenCalledWith({ weightKg: 79.4 });
  });

  it('shows pounds in the toast for an imperial user', () => {
    unitSystem.value = 'IMPERIAL';
    submit('160');
    expect(toastAt(0).message).toMatch(/^Logged 160(\.\d)? lb$/);
  });
});

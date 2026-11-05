// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartlyLoggedToggle } from './PartlyLoggedToggle';

// Lane D2: "Partly logged day" — an optimistic switch that saves through
// tracker.setDayIncomplete and says so when the save fails.

type Opts = { onSuccess?: (r: { incomplete: boolean }) => void; onSettled?: () => void };
const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  isError: false,
  opts: undefined as Opts | undefined,
  capture: vi.fn(),
  invalidate: vi.fn(),
  setData: vi.fn<[unknown, (d: object | undefined) => object | undefined], undefined>(),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ tracker: { getDay: { invalidate: m.invalidate, setData: m.setData } } }),
    tracker: {
      setDayIncomplete: {
        useMutation: (opts: Opts) => {
          m.opts = opts;
          return { mutate: m.mutate, isPending: false, isError: m.isError };
        },
      },
    },
  },
}));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));

beforeEach(() => {
  vi.clearAllMocks();
  m.isError = false;
});
afterEach(cleanup);

describe('PartlyLoggedToggle', () => {
  it('is a labelled switch that saves the new value', () => {
    render(<PartlyLoggedToggle date="2026-10-20" incomplete={false} />);
    const toggle = screen.getByRole('switch', { name: /Partly logged day/ });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(m.mutate).toHaveBeenCalledWith({ date: '2026-10-20', incomplete: true });
    // Optimistic until the server answers.
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    m.opts?.onSuccess?.({ incomplete: true });
    expect(m.capture).toHaveBeenCalledWith('day_incomplete_set', { incomplete: true });
    // The cached day takes the answer at once (no flick back while refetching).
    expect(m.setData).toHaveBeenCalledWith({ date: '2026-10-20' }, expect.any(Function));
    const update = m.setData.mock.calls[0]?.[1];
    expect(update?.({ incomplete: false, date: '2026-10-20' })).toEqual({
      incomplete: true,
      date: '2026-10-20',
    });
    expect(m.invalidate).toHaveBeenCalledWith({ date: '2026-10-20' });
  });

  it('says so when the save failed', () => {
    m.isError = true;
    render(<PartlyLoggedToggle date="2026-10-20" incomplete />);
    expect(screen.getByText("Couldn't save that. Try again in a moment.")).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
});

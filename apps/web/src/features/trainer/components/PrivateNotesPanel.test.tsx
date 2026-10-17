// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateNotesPanel } from './PrivateNotesPanel';

const m = vi.hoisted(
  (): {
    note: { isSuccess: boolean; data: { body: string; updatedAt: string } | null };
    save: ReturnType<typeof vi.fn>;
  } => ({
    note: {
      isSuccess: true,
      data: { body: 'Left knee clicks', updatedAt: '2026-10-01T00:00:00.000Z' },
    },
    save: vi.fn(),
  }),
);

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ trainer: { client: { note: { setData: vi.fn() } } } }),
    trainer: {
      client: {
        note: { useQuery: () => m.note },
        saveNote: { useMutation: () => ({ mutate: m.save, isPending: false }) },
      },
    },
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  m.save.mockClear();
  m.note = {
    isSuccess: true,
    data: { body: 'Left knee clicks', updatedAt: '2026-10-01T00:00:00.000Z' },
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PrivateNotesPanel', () => {
  it('loads the saved note under a real label with the privacy hint', () => {
    render(<PrivateNotesPanel clientId="c1" clientName="Maria" />);
    const field = screen.getByLabelText('Private notes');
    expect(field).toHaveValue('Left knee clicks');
    expect(
      screen.getByText('Only you can see this. Chefer doesn’t read it, and Maria never sees it.'),
    ).toBeInTheDocument();
  });

  it('autosaves after a pause, once, with the typed text', () => {
    render(<PrivateNotesPanel clientId="c1" clientName="Maria" />);
    const field = screen.getByLabelText('Private notes');
    fireEvent.change(field, { target: { value: 'Left knee clicks. Goal: wedding in June.' } });
    expect(m.save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(m.save).toHaveBeenCalledWith({
      clientId: 'c1',
      body: 'Left knee clicks. Goal: wedding in June.',
    });
  });

  it('does not save an untouched note and keeps the field disabled until loaded', () => {
    m.note = { isSuccess: false, data: null };
    render(<PrivateNotesPanel clientId="c1" clientName="Maria" />);
    expect(screen.getByLabelText('Private notes')).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(m.save).not.toHaveBeenCalled();
  });
});

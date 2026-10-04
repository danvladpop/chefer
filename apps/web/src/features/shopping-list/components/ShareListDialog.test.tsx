// @vitest-environment jsdom
import { capture } from '@/lib/analytics';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareListDialog, type ShareListDialogProps } from './ShareListDialog';

// T-13.3: Send the list — options and counts, empty list disabled, native share
// vs the Copy list fallback, remembered choice, dinners only when planned.

const m = vi.hoisted((): { plan: unknown } => ({ plan: undefined }));

vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    mealPlan: {
      getForWeek: { useQuery: () => ({ data: m.plan }) },
    },
  },
}));

const item = (key: string, name: string, category = 'produce', extra = {}) => ({
  key,
  ingredientName: name,
  category,
  quantity: '2',
  unit: 'pcs',
  ...extra,
});

const props = (over: Partial<ShareListDialogProps> = {}): ShareListDialogProps => ({
  open: true,
  onClose: vi.fn(),
  items: [item('a', 'Tomatoes'), item('b', 'Rice', 'grains'), item('c', 'Milk', 'dairy')],
  checkedKeys: [],
  weekOffset: 0,
  weekStart: new Date(2026, 8, 28),
  unitSystem: 'METRIC',
  ...over,
});

const setNav = (nav: { share?: unknown; clipboard?: unknown }) => {
  Object.defineProperty(navigator, 'share', { value: nav.share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: nav.clipboard, configurable: true });
};

beforeEach(() => {
  vi.mocked(capture).mockClear();
  m.plan = undefined;
  setNav({});
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ShareListDialog', () => {
  it('nothing ticked: only "Everything · n items"', () => {
    render(<ShareListDialog {...props()} />);
    expect(screen.getByRole('dialog', { name: 'Send the list' })).toBeTruthy();
    expect(screen.getByLabelText('Everything · 3 items')).toBeTruthy();
    expect(screen.queryByLabelText(/What’s left to buy/)).toBeNull();
  });

  it('with ticks: What’s left first, both with counts', () => {
    render(<ShareListDialog {...props({ checkedKeys: ['a'] })} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.parentElement?.textContent)).toEqual([
      'What’s left to buy · 2 items',
      'Everything · 3 items',
    ]);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
  });

  it('dinners are offered only when the week has planned dinners', () => {
    const { rerender } = render(<ShareListDialog {...props()} />);
    expect(screen.queryByLabelText('Add this week’s dinners')).toBeNull();
    m.plan = {
      days: [
        { dayOfWeek: 0, meals: [{ type: 'dinner', recipe: { name: 'Chicken Stir-fry' } }] },
        { dayOfWeek: 1, meals: [{ type: 'lunch', recipe: { name: 'Soup' } }] },
      ],
    };
    rerender(<ShareListDialog {...props()} />);
    expect(screen.getByLabelText('Add this week’s dinners')).toBeTruthy();
  });

  it('remembers the choice on this device', () => {
    const { unmount } = render(<ShareListDialog {...props({ checkedKeys: ['a'] })} />);
    fireEvent.click(screen.getByLabelText('Everything · 3 items'));
    fireEvent.click(screen.getByLabelText('Include amounts'));
    unmount();
    render(<ShareListDialog {...props({ checkedKeys: ['a'] })} />);
    expect(screen.getByLabelText<HTMLInputElement>('Everything · 3 items').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Include amounts').checked).toBe(false);
  });

  it('an empty list disables the button', () => {
    render(<ShareListDialog {...props({ items: [] })} />);
    expect(screen.getByTestId<HTMLButtonElement>('share-list-send').disabled).toBe(true);
  });

  it('without navigator.share the button copies: "Copy list" → "List copied."', async () => {
    const writeText = vi.fn<[string], Promise<void>>().mockResolvedValue(undefined);
    setNav({ clipboard: { writeText } });
    render(<ShareListDialog {...props()} />);
    const button = screen.getByRole('button', { name: 'Copy list' });
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const text = String(writeText.mock.calls[0]?.[0]);
    expect(text).toContain('Shopping list · 28 Sep – 4 Oct');
    expect(text).toContain('PRODUCE\n- Tomatoes, 2 pcs');
    expect(text).toMatch(/Made with Chefer · http/);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('List copied.'));
  });

  it('with navigator.share the button says Share… and shares the text', async () => {
    const share = vi.fn<[{ text: string }], Promise<void>>().mockResolvedValue(undefined);
    const onClose = vi.fn();
    setNav({ share });
    render(<ShareListDialog {...props({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0]?.[0].text).toContain('Rice, 2 pcs');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

// UX-PO-02: `list_shared` counts a list that left the app, with the scope sent.
describe('ShareListDialog analytics (UX-PO-02)', () => {
  it('fires list_shared with the scope after a native share', async () => {
    const share = vi.fn<[{ text: string }], Promise<void>>().mockResolvedValue(undefined);
    setNav({ share });
    render(<ShareListDialog {...props({ checkedKeys: ['a'] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('list_shared', { scope: 'whatsLeft' }),
    );
  });

  it('fires list_shared after a copy, with "everything" when nothing is ticked', async () => {
    setNav({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ShareListDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy list' }));
    await waitFor(() =>
      expect(capture).toHaveBeenCalledWith('list_shared', { scope: 'everything' }),
    );
  });

  it('does not fire when the share sheet is dismissed or the copy fails', async () => {
    const share = vi
      .fn<[{ text: string }], Promise<void>>()
      .mockRejectedValue(new DOMException('dismissed', 'AbortError'));
    setNav({ share });
    const { unmount } = render(<ShareListDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    unmount();

    setNav({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<ShareListDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy list' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Couldn’t share/));
    expect(capture).not.toHaveBeenCalled();
  });
});

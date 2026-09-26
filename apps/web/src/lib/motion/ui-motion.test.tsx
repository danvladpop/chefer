// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { duration, elevation } from '@chefer/tokens';
import {
  buttonVariants,
  CountUp,
  Drawer,
  isOverTarget,
  mainFill,
  overflowFill,
  progressOf,
  ProgressRing,
  Sheet,
} from '@chefer/ui';

// Motion primitives from @chefer/ui (motion-system.md MO-01 / MO-02 / MO-06).
// packages/ui has no test runner of its own; its component tests live here,
// next to the jsdom + Testing Library setup the web app already has.

const SLACK = 50; // usePresence's setTimeout fallback slack

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  mockReducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MO-01 press feedback', () => {
  it('bakes an instant, standard-eased 0.97 press scale into every button variant', () => {
    for (const variant of ['default', 'outline', 'ghost', 'secondary'] as const) {
      const cls = buttonVariants({ variant });
      expect(cls).toContain('active:scale-[0.97]');
      expect(cls).toContain('duration-instant');
      expect(cls).toContain('ease-standard');
    }
    expect(buttonVariants()).not.toContain('transition-all');
  });
});

function SheetHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Swap meal"
      >
        <button type="button">Inside</button>
      </Sheet>
    </>
  );
}

describe('MO-02 Sheet exit', () => {
  it('keeps the closing sheet mounted (inert, data-state=closed) until the exit ends', () => {
    vi.useFakeTimers();
    render(<SheetHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Swap meal' })).toHaveAttribute('data-state', 'open');

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    // Gone for assistive tech and focus at once…
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    // …but still painted while the exit runs.
    const closing = document.querySelector('[role="dialog"][data-state="closed"]');
    expect(closing).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(duration.base + SLACK);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('unmounts as soon as the panel fires animationend', () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const panel = document.querySelector('[role="dialog"]');
    if (!panel) throw new Error('expected the closing panel to stay mounted');
    fireEvent.animationEnd(panel);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ignores animationend bubbling up from children', () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.animationEnd(screen.getByText('Inside', { ignore: false }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('re-opening mid-exit brings the same sheet straight back', () => {
    vi.useFakeTimers();
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    act(() => {
      vi.advanceTimersByTime(duration.base + SLACK);
    });
    expect(screen.getByRole('dialog', { name: 'Swap meal' })).toHaveAttribute('data-state', 'open');
  });

  it('slides + fades normally, and crossfades in 150 ms under reduced motion', () => {
    vi.useFakeTimers();
    const { unmount } = render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog').className).toContain('slide-in-from-bottom-full');
    unmount();

    mockReducedMotion(true);
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).not.toContain('slide-in');
    expect(dialog.className).toContain('fade-in-0');
    expect(dialog).toHaveAttribute('data-motion-safe');

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(duration.fast + SLACK);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('MO-02 Drawer exit', () => {
  it('slides out from its side and unmounts after the exit', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Drawer open onClose={() => undefined} label="More navigation" side="right">
        <a href="/x">Link</a>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').className).toContain('slide-in-from-right-full');
    rerender(
      <Drawer open={false} onClose={() => undefined} label="More navigation" side="right">
        <a href="/x">Link</a>
      </Drawer>,
    );
    const closing = document.querySelector('[role="dialog"]');
    expect(closing?.className).toContain('slide-out-to-right-full');
    act(() => {
      vi.advanceTimersByTime(duration.base + SLACK);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('MO-06 progress maths', () => {
  it('flags only strictly-over values and splits the overflow lap', () => {
    expect(isOverTarget(progressOf(2728, 2728))).toBe(false);
    expect(isOverTarget(progressOf(2810, 2728))).toBe(true);
    expect(mainFill(1.25)).toBe(1);
    expect(overflowFill(1.25)).toBeCloseTo(0.25);
    expect(progressOf(5, 0)).toBe(2); // 0 target counts as 1, capped at 200%
    expect(progressOf(Number.NaN, 10)).toBe(0);
  });
});

describe('MO-06 ProgressRing + CountUp', () => {
  it('counts up from 0 to the value over `deliberate`', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<CountUp value={1240} data-testid="n" />);
    expect(screen.getByTestId('n')).toHaveTextContent('0');
    act(() => {
      vi.advanceTimersByTime(duration.deliberate / 2);
    });
    const mid = Number(screen.getByTestId('n').textContent.replace(/\D/g, ''));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1240);
    act(() => {
      vi.advanceTimersByTime(duration.deliberate);
    });
    expect(screen.getByTestId('n')).toHaveTextContent('1,240');
    expect(screen.getByTestId('n')).toHaveClass('tabular-nums');
  });

  it('shows the final value at once under reduced motion', () => {
    mockReducedMotion(true);
    render(<CountUp value={1240} data-testid="n" />);
    expect(screen.getByTestId('n')).toHaveTextContent('1,240');
  });

  it('turns the over colour and draws an overflow lap past 100%', () => {
    mockReducedMotion(true);
    render(
      <ProgressRing
        label="2,810 of 2,728 kcal eaten today"
        progress={progressOf(2810, 2728)}
        overColor="#d97706"
      />,
    );
    const ring = screen.getByRole('progressbar', { name: '2,810 of 2,728 kcal eaten today' });
    expect(ring).toHaveAttribute('data-over', 'true');
    expect(ring).toHaveAttribute('aria-valuenow', '100');
    expect(ring.querySelector('[data-part="fill"]')).toHaveAttribute('stroke', '#d97706');
    expect(ring.querySelector('[data-part="overflow"]')).not.toBeNull();
  });

  it('has no lap and the base colour at or under target', () => {
    mockReducedMotion(true);
    render(<ProgressRing label="ring" progress={0.5} overColor="#d97706" color="#944a00" />);
    const ring = screen.getByRole('progressbar', { name: 'ring' });
    expect(ring).not.toHaveAttribute('data-over');
    expect(ring.querySelector('[data-part="fill"]')).toHaveAttribute('stroke', '#944a00');
    expect(ring.querySelector('[data-part="overflow"]')).toBeNull();
  });
});

describe('elevation tokens', () => {
  it('globals.css --elevation-* match @chefer/tokens', () => {
    const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
    const root = css.slice(css.indexOf(':root'), css.indexOf('.dark'));
    // Normalise number formatting (".10" vs "0.1") and whitespace.
    const norm = (v: string) =>
      v.replace(/-?\d*\.?\d+/g, (n) => String(Number.parseFloat(n))).replace(/\s+/g, '');
    const read = (name: string) => {
      const m = new RegExp(`--${name}:([^;]+);`).exec(root);
      return m?.[1] ? norm(m[1]) : undefined;
    };
    expect(read('elevation-1')).toBe(norm(elevation.e1));
    expect(read('elevation-2')).toBe(norm(elevation.e2));
    expect(read('elevation-3')).toBe(norm(elevation.e3));
    expect(read('elevation-4')).toBe(norm(elevation.e4));
    expect(read('elevation-4-up')).toBe(norm(elevation.e4Up));
  });
});

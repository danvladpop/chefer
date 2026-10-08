// @vitest-environment jsdom
import { capture } from '@/lib/analytics';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanMealButton } from './ScanMealButton';

// UX-FOOD-26 — the Snap result: the photo, and a confirmation that can be undone.

const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  onSuccess: undefined as undefined | ((data: unknown, vars: unknown) => void),
  scan: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    'data-testid': testId,
  }: {
    alt: string;
    src: string;
    'data-testid'?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test double for next/image
    <img alt={alt} src={src} data-testid={testId} />
  ),
}));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => (_kind: string, run: () => void) => run(),
}));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('../lib/rebalance-storage', () => ({
  handleRebalanceOutcome: vi.fn(),
  REBALANCE_PREVIEW: { rebalanceMode: 'preview' },
}));
vi.mock('../lib/scan-client', () => ({
  scanMealPhoto: (...args: unknown[]): unknown => m.scan(...args),
  ScanUpgradeRequiredError: class ScanUpgradeRequiredError extends Error {},
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    tracker: {
      logCustomMeal: {
        useMutation: (opts: { onSuccess: (data: unknown, vars: unknown) => void }) => {
          m.onSuccess = opts.onSuccess;
          return { mutate: m.mutate, isPending: false, isError: false, error: null };
        },
      },
    },
  },
}));

const ESTIMATE = {
  dishName: 'Grilled chicken with rice',
  confidence: 'med' as const,
  kcal: 520,
  protein: 38,
  carbs: 55,
  fat: 14,
  portionNote: 'about 400 g',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.scan.mockResolvedValue(ESTIMATE);
  URL.createObjectURL = vi.fn(() => 'blob:meal-photo');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

async function scanOnePhoto(onLoggedEntry?: (e: { entryId: string; name: string }) => void) {
  const { container } = render(
    <ScanMealButton
      date="2026-09-26"
      isPremium
      onLogged={vi.fn()}
      {...(onLoggedEntry && { onLoggedEntry })}
    />,
  );
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('expected the hidden file input');
  const file = new File([new Uint8Array(4)], 'meal.jpg', { type: 'image/jpeg' });
  act(() => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await waitFor(() => expect(screen.getByText('Log this meal?')).toBeTruthy());
}

describe('ScanMealButton analytics (UX-PO-02)', () => {
  it('a confirmed scan fires meal_logged as snap, with the meal type', async () => {
    await scanOnePhoto();
    act(() => m.onSuccess?.({ rebalance: null }, { name: 'Grilled chicken', mealType: 'lunch' }));
    expect(capture).toHaveBeenCalledWith('meal_logged', { source: 'snap', mealType: 'lunch' });
  });
});

describe('ScanMealButton result sheet (UX-FOOD-26)', () => {
  it('shows the photo that was scanned', async () => {
    await scanOnePhoto();
    const photo = screen.getByTestId('scan-photo');
    expect(photo.getAttribute('src')).toBe('blob:meal-photo');
    expect(photo.getAttribute('alt')).toBe('The photo you scanned');
  });

  it('hands the new entry id to the page so it can offer Undo', async () => {
    const onLoggedEntry = vi.fn();
    await scanOnePhoto(onLoggedEntry);
    act(() => m.onSuccess?.({ rebalance: null, entryId: 'e-42' }, { name: 'Grilled chicken' }));
    expect(onLoggedEntry).toHaveBeenCalledWith({ entryId: 'e-42', name: 'Grilled chicken' });
  });

  it('stays quiet when an older server answers without an entry id', async () => {
    const onLoggedEntry = vi.fn();
    await scanOnePhoto(onLoggedEntry);
    act(() => m.onSuccess?.({ rebalance: null }, { name: 'Grilled chicken' }));
    expect(onLoggedEntry).not.toHaveBeenCalled();
  });
});

// WP-06: "Ate something else" → Snap a photo, pre-targeted at a plan slot.
describe('ScanMealButton for a plan slot (WP-06)', () => {
  it("logs the scan against the slot, in the slot's meal, without a meal picker", async () => {
    const { container } = render(
      <ScanMealButton
        date="2026-09-26"
        isPremium
        onLogged={vi.fn()}
        replacesSlot={{ mealType: 'dinner', slotIndex: 2 }}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('expected the hidden file input');
    const file = new File([new Uint8Array(4)], 'meal.jpg', { type: 'image/jpeg' });
    act(() => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() => expect(screen.getByText('Log this meal?')).toBeTruthy());
    expect(screen.queryByRole('group', { name: 'Meal type' })).toBeNull();
    fireEvent.click(screen.getByText('Log 520 kcal'));
    expect(m.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedBy: 'vision',
        mealType: 'dinner',
        replacesSlot: { mealType: 'dinner', slotIndex: 2 },
        rebalanceMode: 'preview', // WP-07: offer first, never a silent rebalance
      }),
    );
  });

  it('can be driven from outside: hideButton and an opener on openRef', () => {
    const openRef: { current: (() => void) | null } = { current: null };
    render(
      <ScanMealButton
        date="2026-09-26"
        isPremium
        onLogged={vi.fn()}
        hideButton
        openRef={openRef}
        replacesSlot={{ mealType: 'dinner', slotIndex: 2 }}
      />,
    );
    expect(screen.queryByText('Scan a meal')).toBeNull();
    expect(openRef.current).toBeTypeOf('function');
  });
});

// WP-07: the week rebalance is free for everyone, so the premium photo-scan
// pitch must not sell it ("quietly rebalances the rest of your week").
describe('ScanMealButton — free-tier demo copy (WP-07)', () => {
  it('sells the photo scan only, with no rebalance or training-day promise', () => {
    render(<ScanMealButton date="2026-09-26" isPremium={false} onLogged={vi.fn()} />);
    fireEvent.click(screen.getByText('Scan a meal'));
    const text = document.body.textContent;
    expect(text).toContain('estimates the dish and macros');
    expect(text).not.toMatch(/rebalanc|rest of your week|training/i);
  });
});

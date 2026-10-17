import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { RebalancePreviewLike } from '@chefer/utils';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { RebalanceBanner } from '../../src/features/tracker/rebalance-banner';
import { RebalanceMyWeek, RebalanceOffer } from '../../src/features/tracker/rebalance-offer';
import {
  REBALANCE_PREVIEW,
  recordRebalanceOutcome,
  resetRebalanceOfferForTests,
  setRebalanceOffer,
} from '../../src/features/tracker/rebalance-offer-store';
import { resetRebalanceStoreForTests } from '../../src/features/tracker/rebalance-store';

// WP-07 (UX-PLAN-09, B-11): a log OFFERS the week rebalance instead of
// rewriting meals — Preview · Apply · Not now — and Plan can ask for one.

const mockApply = jest.fn();
const mockFetchPreview = jest.fn();
const mockInvalidate = jest.fn();
const mockReplace = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: {
        getForWeek: { invalidate: mockInvalidate },
        previewRebalance: { fetch: mockFetchPreview },
      },
      dashboard: { summary: { invalidate: mockInvalidate } },
      tracker: { invalidate: mockInvalidate },
      shoppingList: { invalidate: mockInvalidate },
    }),
    mealPlan: {
      applyRebalance: { useMutation: () => ({ mutateAsync: mockApply, isPending: false }) },
      replaceRecipe: { useMutation: () => ({ mutateAsync: mockReplace }) },
    },
  },
}));

const preview = (over: Partial<RebalancePreviewLike> = {}): RebalancePreviewLike => ({
  planId: 'plan-1',
  headline: "You're 36 g short on protein this week.",
  swaps: [
    {
      dayOfWeek: 6,
      mealType: 'dinner',
      previousRecipeId: 'old-dinner',
      newRecipeId: 'new-dinner',
      previousRecipeName: 'Lentil soup',
      newRecipeName: 'Chicken bowl',
      previousKcal: 520,
      newKcal: 460,
      previousProteinG: 14,
      newProteinG: 42,
      reason: 'protein',
    },
  ],
  snacks: [],
  ...over,
});

const applied = {
  rebalanced: true,
  swaps: preview().swaps,
  projectedDeviation: 0.04,
  planId: 'plan-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetRebalanceStoreForTests();
  resetRebalanceOfferForTests();
  mockApply.mockResolvedValue(applied);
  mockReplace.mockResolvedValue({});
});

describe('RebalanceOffer', () => {
  it('renders nothing without an offer', async () => {
    await render(<RebalanceOffer />);
    expect(screen.queryByTestId('rebalance-offer')).not.toBeOnTheScreen();
  });

  it('shows the headline and each swap as one explained line, with Apply · Preview · Not now', async () => {
    await render(<RebalanceOffer />);
    await act(() => {
      setRebalanceOffer(preview());
    });
    expect(screen.getByTestId('rebalance-offer-headline')).toHaveTextContent(
      "You're 36 g short on protein this week.",
    );
    expect(screen.getByTestId('rebalance-offer-text')).toHaveTextContent(
      'I can rebalance the rest of your week: Sunday dinner → Chicken bowl (+28 g protein, −60 kcal).',
    );
    expect(screen.getByTestId('rebalance-offer-apply')).toBeOnTheScreen();
    expect(screen.getByTestId('rebalance-offer-preview')).toBeOnTheScreen();
    expect(screen.getByTestId('rebalance-offer-dismiss')).toBeOnTheScreen();
    // Nothing was written just by showing the offer.
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('Preview expands what each swap replaces', async () => {
    const user = userEvent.setup();
    await render(<RebalanceOffer />);
    await act(() => {
      setRebalanceOffer(preview());
    });
    expect(screen.queryByTestId('rebalance-offer-detail-0')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('rebalance-offer-preview'));
    expect(screen.getByTestId('rebalance-offer-detail-0')).toHaveTextContent(
      'Replaces Lentil soup (520 kcal · 14 g protein) with Chicken bowl (460 kcal · 42 g protein)',
    );
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('lists protein snacks, and with no swap offers only Not now', async () => {
    await render(<RebalanceOffer />);
    await act(() => {
      setRebalanceOffer(
        preview({
          swaps: [],
          snacks: [{ id: 's1', name: 'Greek yogurt with honey', proteinG: 17, kcal: 150 }],
        }),
      );
    });
    expect(screen.getByTestId('rebalance-offer-snacks')).toHaveTextContent(
      /Greek yogurt with honey \(\+17 g protein, 150 kcal\)/,
    );
    expect(screen.queryByTestId('rebalance-offer-apply')).not.toBeOnTheScreen();
    expect(screen.getByTestId('rebalance-offer-dismiss')).toBeOnTheScreen();
  });

  it('Apply calls applyRebalance with the offered swaps, then offers Undo', async () => {
    const user = userEvent.setup();
    const onApplied = jest.fn();
    await render(
      <>
        <RebalanceOffer onApplied={onApplied} />
        <RebalanceBanner />
      </>,
    );
    await act(() => {
      setRebalanceOffer(preview());
    });
    await user.press(screen.getByTestId('rebalance-offer-apply'));
    expect(mockApply).toHaveBeenCalledWith({
      planId: 'plan-1',
      swaps: [
        {
          dayOfWeek: 6,
          mealType: 'dinner',
          previousRecipeId: 'old-dinner',
          newRecipeId: 'new-dinner',
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers are typed any
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(screen.queryByTestId('rebalance-offer')).not.toBeOnTheScreen();
    expect(onApplied).toHaveBeenCalled();
    expect(screen.getByTestId('rebalance-banner-text')).toHaveTextContent(
      'I adjusted Sunday dinner to keep your week on track.',
    );
    // Undo puts the old dinner back, unpinned (a pinned slot is never rebalanced).
    await user.press(screen.getByTestId('rebalance-undo'));
    expect(mockReplace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 6,
      mealType: 'dinner',
      recipeId: 'old-dinner',
      pinned: false,
    });
  });

  it('Apply keeps the offer and says so when it fails', async () => {
    mockApply.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    await render(<RebalanceOffer />);
    await act(() => {
      setRebalanceOffer(preview());
    });
    await user.press(screen.getByTestId('rebalance-offer-apply'));
    expect(screen.getByTestId('rebalance-offer-error')).toBeOnTheScreen();
    expect(screen.getByTestId('rebalance-offer')).toBeOnTheScreen();
  });

  it('Not now dismisses without changing the plan', async () => {
    const user = userEvent.setup();
    await render(<RebalanceOffer />);
    await act(() => {
      setRebalanceOffer(preview());
    });
    await user.press(screen.getByTestId('rebalance-offer-dismiss'));
    expect(screen.queryByTestId('rebalance-offer')).not.toBeOnTheScreen();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(kv.getJSON('chefer.rebalance.pending')).toBeNull();
  });

  it('on the Plan tab only shows an offer for the displayed plan', async () => {
    await render(<RebalanceOffer planId="plan-2" />);
    await act(() => {
      setRebalanceOffer(preview());
    });
    expect(screen.queryByTestId('rebalance-offer')).not.toBeOnTheScreen();
  });
});

describe('recordRebalanceOutcome', () => {
  it('a preview becomes the offer and an auto-applied rebalance still feeds Undo', () => {
    recordRebalanceOutcome({ rebalance: null, rebalancePreview: preview() });
    recordRebalanceOutcome({ rebalance: applied });
    expect(kv.getJSON('chefer.rebalance.pending')).toMatchObject({ planId: 'plan-1' });
  });

  it('a log whose preview is null clears an older offer; an older API leaves it alone', async () => {
    await render(<RebalanceOffer />);
    await act(() => {
      recordRebalanceOutcome({ rebalance: null, rebalancePreview: preview() });
    });
    expect(screen.getByTestId('rebalance-offer')).toBeOnTheScreen();
    await act(() => {
      recordRebalanceOutcome({ rebalance: null }); // no preview field (older API)
    });
    expect(screen.getByTestId('rebalance-offer')).toBeOnTheScreen();
    await act(() => {
      recordRebalanceOutcome({ rebalance: null, rebalancePreview: null });
    });
    expect(screen.queryByTestId('rebalance-offer')).not.toBeOnTheScreen();
  });
});

describe('RebalanceMyWeek (Plan entry)', () => {
  it('asks for a preview of this plan and shows the same offer card', async () => {
    mockFetchPreview.mockResolvedValue(preview());
    const user = userEvent.setup();
    await render(
      <>
        <RebalanceMyWeek planId="plan-1" />
        <RebalanceOffer planId="plan-1" />
      </>,
    );
    await user.press(screen.getByTestId('rebalance-my-week'));
    expect(mockFetchPreview).toHaveBeenCalledWith(
      {
        planId: 'plan-1',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers are typed any
        localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
      { staleTime: 0 },
    );
    expect(await screen.findByTestId('rebalance-offer')).toBeOnTheScreen();
    expect(screen.queryByTestId('rebalance-on-track')).not.toBeOnTheScreen();
  });

  it('says "Your week is on track" when there is nothing to offer', async () => {
    mockFetchPreview.mockResolvedValue(null);
    const user = userEvent.setup();
    await render(<RebalanceMyWeek planId="plan-1" />);
    await user.press(screen.getByTestId('rebalance-my-week'));
    expect(await screen.findByTestId('rebalance-on-track')).toHaveTextContent(
      'Your week is on track',
    );
  });

  it('a failed check says so and can be retried', async () => {
    mockFetchPreview.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    await render(<RebalanceMyWeek planId="plan-1" />);
    await user.press(screen.getByTestId('rebalance-my-week'));
    expect(await screen.findByTestId('rebalance-my-week-error')).toBeOnTheScreen();
    expect(screen.getByTestId('rebalance-my-week')).toBeOnTheScreen();
  });
});

// Every log write must opt in to the preview, or a log silently rewrites meals.
describe('log writes ask for a preview', () => {
  it('sends rebalanceMode: preview', () => {
    expect(REBALANCE_PREVIEW).toEqual({ rebalanceMode: 'preview' });
  });

  const ROOT = join(__dirname, '..', '..');
  const files = (path: string): string[] => {
    const abs = join(ROOT, path);
    if (statSync(abs).isFile()) return [abs];
    return readdirSync(abs).flatMap((name) => files(join(path, name)));
  };
  const sources = ['app', 'src']
    .flatMap(files)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({ file: relative(ROOT, f), source: readFileSync(f, 'utf8') }));

  it('every file that creates a rebalancing log mutation spreads REBALANCE_PREVIEW into its writes', () => {
    const WRITES = /trpc\.tracker\.(logRecipe|logCustomMeal|skipSlot|copyDay)\.useMutation/;
    const writers = sources.filter((s) => WRITES.test(s.source));
    expect(writers.length).toBeGreaterThanOrEqual(7);
    // The hook that wraps the tracker's own logRecipe is fed by the screen.
    const missing = writers.filter((s) => !s.source.includes('REBALANCE_PREVIEW'));
    expect(missing.map((s) => s.file)).toEqual(['src/features/tracker/use-tracker-writes.ts']);
    // The tracker's writes live in its shared hook (legacy Tracker + the new shell's Your day).
    expect(
      sources
        .find((s) => s.file === 'src/features/tracker/use-tracker-day.ts')
        ?.source.match(/\.\.\.REBALANCE_PREVIEW/g)?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('no log result is handed to the Undo store alone (the offer would be dropped)', () => {
    const bare = sources.filter(
      (s) =>
        s.file !== 'src/features/tracker/rebalance-offer-store.ts' &&
        /recordRebalance\([a-z]+\.rebalance\)/.test(s.source),
    );
    expect(bare.map((s) => s.file)).toEqual([]);
  });
});

describe('no premium copy for the free rebalance features', () => {
  it('the mobile source never sells week rebalance or training-day targets as Premium', () => {
    const ROOT2 = join(__dirname, '..', '..');
    const walk = (path: string): string[] => {
      const abs = join(ROOT2, path);
      if (statSync(abs).isFile()) return [abs];
      return readdirSync(abs).flatMap((name) => walk(join(path, name)));
    };
    const hits = ['app', 'src']
      .flatMap(walk)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        return (
          text.includes('Premium adds this to') ||
          /openPremium\(\s*['"]training-day['"]/.test(text) ||
          /premium[^\n]{0,60}rebalanc|rebalanc[^\n]{0,60}premium/i.test(
            text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''),
          )
        );
      })
      .map((f) => relative(ROOT2, f));
    expect(hits).toEqual([]);
  });
});

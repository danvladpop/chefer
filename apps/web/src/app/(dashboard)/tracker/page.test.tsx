// @vitest-environment jsdom
import { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackerPage from './page';

// T-19.1–T-19.4 (UX-19): the search-first Log sheet, edit/undo and the
// one-save model. Two identical snacks used to share one row key
// (recipeId:mealType), so ticking one ticked both — rows are keyed by plan
// slot now. UX-FOOD-01/06: ticks follow the server and failed writes revert.

type Entry = {
  entryId?: string;
  recipeId?: string;
  mealType?: string;
  slotIndex?: number;
  [key: string]: unknown;
};
type Planned = { recipeId?: string; kcal?: number; protein?: number; carbs?: number; fat?: number };
type Day = {
  plannedMeals: Planned[];
  offPlanLogged: { entryId?: string; [key: string]: unknown }[];
  log: { loggedMeals: Entry[] } | null;
  [key: string]: unknown;
};
type LogVars = {
  recipeId: string;
  mealType: string;
  slotIndex?: number;
  portionMultiplier?: number;
};
type Cb = ((...args: unknown[]) => unknown) | undefined;
type MutationOpts = { onMutate?: Cb; onSuccess?: Cb; onError?: Cb; onSettled?: Cb };

const m = vi.hoisted(() => {
  // `server` is the database; `cache` is what `tracker.getDay` returns.
  // Optimistic edits (`setData`) change only the cache; `invalidate` re-reads
  // the server — the shape the page relies on.
  const state: {
    day: unknown;
    server: unknown;
    cache: unknown;
    failWrites: boolean;
    listeners: Set<() => void>;
    seq: number;
    copiedIds: string[];
  } = {
    day: undefined,
    server: undefined,
    cache: undefined,
    failWrites: false,
    listeners: new Set(),
    seq: 0,
    copiedIds: ['c1', 'c2'],
  };
  return {
    logRecipe: vi.fn(),
    unlogRecipe: vi.fn(),
    copyDay: vi.fn(),
    deleteEntries: vi.fn(),
    deleteCustom: vi.fn(),
    restoreCustom: vi.fn(),
    updateRecipeEntry: vi.fn(),
    state,
  };
});

const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

const setCache = (next: Day) => {
  m.state.cache = next;
  m.state.listeners.forEach((l) => l());
};
const store = (loggedMeals: Entry[]) => {
  const server = m.state.server as Day;
  const sum = (k: string) => loggedMeals.reduce((t, e) => t + Number(e[k] ?? 0), 0);
  m.state.server = {
    ...server,
    log: loggedMeals.length
      ? {
          loggedMeals,
          totalKcal: sum('kcal'),
          totalProtein: sum('protein'),
          totalCarbs: sum('carbs'),
          totalFat: sum('fat'),
        }
      : null,
  };
};
const serverLog = () => (m.state.server as Day).log?.loggedMeals ?? [];

/** A mutation hook that behaves like react-query's: onMutate → server → onSuccess/onError → onSettled. */
function mutation(serverWrite: (vars: never) => unknown) {
  return (opts: MutationOpts = {}) => ({
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    mutate: (vars: never, callbacks: { onSuccess?: Cb; onError?: Cb } = {}) => {
      void (async () => {
        const context = await opts.onMutate?.(vars);
        try {
          if (m.state.failWrites) throw new Error('Failed to fetch');
          const result = serverWrite(vars);
          opts.onSuccess?.(result, vars, context);
          callbacks.onSuccess?.(result, vars, context);
        } catch (error) {
          opts.onError?.(error, vars, context);
          callbacks.onError?.(error, vars, context);
        } finally {
          opts.onSettled?.(undefined, null, vars, context);
        }
      })();
    },
  });
}

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('@/features/dashboard/components/training-day-note', () => ({
  TrainingDayNote: () => null,
}));
vi.mock('@/features/meal-plan/components/RebalanceBanner', () => ({ RebalanceBanner: () => null }));
vi.mock('@/features/nutrition/components/ChangeNoticeCard', () => ({
  ChangeNoticeCard: () => null,
}));
vi.mock('@/features/nutrition/components/TargetExplainSheet', () => ({
  TargetExplainSheet: () => null,
}));
vi.mock('@/features/tracker/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
vi.mock('@/features/tracker/components/ScanMealButton', () => ({ ScanMealButton: () => null }));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/lib/recipe-image', () => ({ getRecipeImageProps: () => ({ src: '/x.jpg' }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { invalidate: vi.fn() },
      tracker: {
        getDay: {
          cancel: () => Promise.resolve(),
          getData: () => m.state.cache,
          setData: (_input: unknown, next: Day | ((prev: Day) => Day)) =>
            setCache(typeof next === 'function' ? next(m.state.cache as Day) : next),
          // A refetch: the cache catches up with the server.
          invalidate: () => {
            setCache(m.state.server as Day);
            return Promise.resolve();
          },
        },
        weeklySummary: { invalidate: vi.fn() },
        monthlySummary: { invalidate: vi.fn() },
        recents: { invalidate: vi.fn() },
      },
      dashboard: { summary: { invalidate: vi.fn() } },
    }),
    tracker: {
      getDay: {
        useQuery: () => ({
          data: useSyncExternalStore(
            (l) => {
              m.state.listeners.add(l);
              return () => {
                m.state.listeners.delete(l);
              };
            },
            () => m.state.cache,
          ),
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: vi.fn(),
        }),
      },
      logRecipe: {
        useMutation: mutation((vars: LogVars) => {
          m.logRecipe(vars);
          const server = m.state.server as Day;
          const planned = server.plannedMeals.find((p) => p.recipeId === vars.recipeId);
          const p = vars.portionMultiplier ?? 1;
          const rest = serverLog().filter(
            (e) =>
              !(
                e.recipeId === vars.recipeId &&
                (vars.slotIndex !== undefined
                  ? e.slotIndex === vars.slotIndex
                  : e.mealType === vars.mealType)
              ),
          );
          store([
            ...rest,
            {
              entryId: `srv-${(m.state.seq += 1)}`,
              recipeId: vars.recipeId,
              mealType: vars.mealType,
              ...(vars.slotIndex !== undefined && { slotIndex: vars.slotIndex }),
              portionMultiplier: p,
              kcal: Math.round((planned?.kcal ?? 0) * p),
              protein: (planned?.protein ?? 0) * p,
              carbs: (planned?.carbs ?? 0) * p,
              fat: (planned?.fat ?? 0) * p,
            },
          ]);
          return { log: {}, rebalance };
        }),
      },
      unlogRecipe: {
        useMutation: mutation((vars: LogVars) => {
          m.unlogRecipe(vars);
          store(
            serverLog().filter(
              (e) =>
                !(
                  e.recipeId === vars.recipeId &&
                  (vars.slotIndex !== undefined
                    ? e.slotIndex === vars.slotIndex
                    : e.mealType === vars.mealType)
                ),
            ),
          );
          return {};
        }),
      },
      copyDay: {
        useMutation: () => ({
          mutate: (vars: unknown, callbacks?: { onSuccess?: (data: unknown) => void }) => {
            m.copyDay(vars);
            callbacks?.onSuccess?.({ log: {}, copiedEntryIds: m.state.copiedIds, rebalance });
          },
          isPending: false,
        }),
      },
      deleteEntries: {
        useMutation: mutation((vars: { entryIds: string[] }) => {
          m.deleteEntries(vars);
          store(serverLog().filter((e) => !e.entryId || !vars.entryIds.includes(e.entryId)));
          const server = m.state.server as Day;
          m.state.server = {
            ...server,
            offPlanLogged: server.offPlanLogged.filter((o) => !vars.entryIds.includes(o.entryId!)),
          };
          return {};
        }),
      },
      deleteCustomMeal: {
        useMutation: mutation((vars: { entryId?: string; entryIndex?: number }) => {
          m.deleteCustom(vars);
          store(
            serverLog().filter((e, i) =>
              vars.entryId ? e.entryId !== vars.entryId : i !== vars.entryIndex,
            ),
          );
          return {};
        }),
      },
      restoreCustomMeal: {
        useMutation: mutation((vars: { entry: Entry }) => {
          m.restoreCustom(vars);
          store([...serverLog(), vars.entry]);
          return {};
        }),
      },
      updateRecipeEntry: {
        useMutation: mutation((vars: { entryId: string }) => {
          m.updateRecipeEntry(vars);
          return {};
        }),
      },
      updateCustomMeal: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
      },
    },
    // §2.11 — TargetExplainSheet's query (mocked away above; still called by
    // the page directly).
    targets: {
      get: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

const snack = (slotIndex: number) => ({
  recipeId: 'yogurt',
  mealType: 'snack',
  recipeName: 'Greek Yogurt',
  imageUrl: null,
  kcal: 150,
  protein: 15,
  carbs: 10,
  fat: 5,
  slotIndex,
});

const logged = (slotIndex?: number) => ({
  recipeId: 'yogurt',
  mealType: 'snack',
  ...(slotIndex !== undefined && { slotIndex }),
  portionMultiplier: 1,
  kcal: 150,
  protein: 15,
  carbs: 10,
  fat: 5,
});

function day(loggedMeals: unknown[] | null, extra: Record<string, unknown> = {}) {
  m.state.day =
    m.state.server =
    m.state.cache =
      {
        date: '2026-09-26',
        plannedMeals: [snack(1), snack(3)],
        offPlanLogged: [],
        log: loggedMeals
          ? { loggedMeals, totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
          : null,
        targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
        ...extra,
      };
}

const checks = () => screen.getAllByRole('button', { name: /check Greek Yogurt/i });

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.state.failWrites = false;
  m.state.listeners.clear();
});

describe('Tracker — one-save model (bug B-23, T-19.4)', () => {
  it('there is no Save Day / Log meals button', () => {
    day(null);
    render(<TrackerPage />);
    expect(screen.queryByText(/Log \d+ meals?/)).toBeNull();
    expect(screen.queryByText('Clear logged meals')).toBeNull();
  });

  it('bug B-23: ticking a planned meal saves it immediately, through logRecipe', async () => {
    day(null);
    render(<TrackerPage />);
    const [firstSnack] = checks();
    if (!firstSnack) throw new Error('expected a snack row');
    fireEvent.click(firstSnack);
    await waitFor(() =>
      expect(m.logRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ recipeId: 'yogurt', mealType: 'snack', slotIndex: 1 }),
      ),
    );
  });

  it('bug B-23: unticking a logged meal removes it immediately, through unlogRecipe', async () => {
    day([logged(1)]);
    render(<TrackerPage />);
    const [firstSnack] = checks();
    if (!firstSnack) throw new Error('expected a snack row');
    fireEvent.click(firstSnack);
    await waitFor(() =>
      expect(m.unlogRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ recipeId: 'yogurt', mealType: 'snack', slotIndex: 1 }),
      ),
    );
  });
});

describe('Tracker — copy a day (T-19.3)', () => {
  afterEach(() => {
    m.state.copiedIds = ['c1', 'c2'];
  });

  // UX-FOOD-25: "Copied 1 entries" / "Copied 0 entries".
  it('UX-FOOD-25: pluralises the confirmation and never says "Copied 0 entries"', () => {
    day(null);
    m.state.copiedIds = ['c1'];
    render(<TrackerPage />);
    fireEvent.click(screen.getByTestId('tracker-copy-day'));
    fireEvent.click(screen.getByTestId('tracker-copy-day-confirm'));
    expect(screen.getByText('Copied 1 entry')).toBeTruthy();
    cleanup();

    m.state.copiedIds = [];
    render(<TrackerPage />);
    fireEvent.click(screen.getByTestId('tracker-copy-day'));
    fireEvent.click(screen.getByTestId('tracker-copy-day-confirm'));
    expect(screen.getByText(/Nothing to copy from/)).toBeTruthy();
    expect(screen.queryByText(/Copied 0/)).toBeNull();
  });

  it('confirms, then copies the previous day onto this one', async () => {
    day(null);
    render(<TrackerPage />);
    fireEvent.click(screen.getByTestId('tracker-copy-day'));
    fireEvent.click(screen.getByTestId('tracker-copy-day-confirm'));
    expect(m.copyDay).toHaveBeenCalledWith(
      expect.objectContaining({ toDate: expect.any(String) as string }),
    );
    expect(screen.getByText('Copied 2 entries')).toBeTruthy();
    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() =>
      expect(m.deleteEntries).toHaveBeenCalledWith(
        expect.objectContaining({ entryIds: ['c1', 'c2'] }),
      ),
    );
  });
});

// UX-FOOD-25: off-plan recipes and custom entries were two stacked "Also eaten"
// sections that lost the meal slot.
describe('Tracker — one "Also eaten" list grouped by meal (UX-FOOD-25)', () => {
  const offPlan = {
    entryId: 'o1',
    recipeId: 'pad-thai',
    mealType: 'dinner',
    portionMultiplier: 1,
    kcal: 603,
    protein: 20,
    carbs: 80,
    fat: 20,
  };
  const shake = {
    entryId: 'e1',
    custom: { name: 'Protein shake', estimatedBy: 'manual' },
    mealType: 'snack',
    portionMultiplier: 1,
    kcal: 180,
    protein: 30,
    carbs: 5,
    fat: 2,
  };
  const toast = {
    entryId: 'e2',
    custom: { name: 'Toast', estimatedBy: 'manual' },
    mealType: 'breakfast',
    portionMultiplier: 1,
    kcal: 150,
    protein: 5,
    carbs: 25,
    fat: 3,
  };

  it('renders a single header with a group per meal, in day order', () => {
    day([offPlan, shake, toast], {
      plannedMeals: [],
      hasActivePlan: true,
      offPlanLogged: [{ ...offPlan, recipeName: 'Tofu Pad Thai' }],
    });
    render(<TrackerPage />);
    expect(screen.getAllByText('Also eaten')).toHaveLength(1);
    const groups = screen
      .getAllByTestId(/^tracker-also-eaten-/)
      .map((el) => el.getAttribute('data-testid'));
    expect(groups).toEqual([
      'tracker-also-eaten-breakfast',
      'tracker-also-eaten-dinner',
      'tracker-also-eaten-snack',
    ]);
  });
});

describe('Tracker — edit/undo a custom entry (bug B-34, T-19.2)', () => {
  const customEntry = {
    entryId: 'e1',
    custom: { name: 'Protein shake', estimatedBy: 'manual' },
    mealType: 'snack',
    portionMultiplier: 1,
    kcal: 180,
    protein: 30,
    carbs: 5,
    fat: 2,
  };

  it('tapping a custom entry opens Edit entry', () => {
    day([customEntry], { plannedMeals: [], hasActivePlan: true });
    render(<TrackerPage />);
    fireEvent.click(screen.getByTestId('tracker-custom-0'));
    expect(screen.getByTestId('edit-entry-name')).toHaveProperty('value', 'Protein shake');
  });

  it('the bin deletes immediately by entryId and offers Undo that restores it exactly (AC2)', async () => {
    day([customEntry], { plannedMeals: [], hasActivePlan: true });
    render(<TrackerPage />);
    fireEvent.click(screen.getByLabelText('Delete Protein shake'));
    // UX-FOOD-17: the stable id is sent, with the index only as the old fallback.
    await waitFor(() =>
      expect(m.deleteCustom).toHaveBeenCalledWith({
        date: expect.any(String) as string,
        entryId: 'e1',
        entryIndex: 0,
      }),
    );
    await waitFor(() => expect(screen.getByText('Deleted Protein shake')).toBeTruthy());
    expect(screen.queryByTestId('tracker-custom-0')).toBeNull();
    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() =>
      expect(m.restoreCustom).toHaveBeenCalledWith({
        date: expect.any(String) as string,
        entry: {
          entryId: 'e1',
          custom: { name: 'Protein shake', estimatedBy: 'manual' },
          mealType: 'snack',
          portionMultiplier: 1,
          kcal: 180,
          protein: 30,
          carbs: 5,
          fat: 2,
        },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('tracker-custom-0')).toBeTruthy());
  });

  it('a failed delete puts the entry back and says why (UX-FOOD-06)', async () => {
    day([customEntry], { plannedMeals: [], hasActivePlan: true });
    m.state.failWrites = true;
    render(<TrackerPage />);
    fireEvent.click(screen.getByLabelText('Delete Protein shake'));
    await waitFor(() => expect(screen.getByText(/Couldn't delete that entry\./)).toBeTruthy());
    expect(screen.getByTestId('tracker-custom-0')).toBeTruthy();
    expect(screen.queryByText('Deleted Protein shake')).toBeNull();
  });
});

describe('Tracker — two identical snacks', () => {
  it('ticking one snack leaves the other unticked and saves only its slot', async () => {
    day(null);
    render(<TrackerPage />);
    const [, secondSnack] = checks();
    if (!secondSnack) throw new Error('expected two snack rows');
    fireEvent.click(secondSnack);
    await waitFor(() =>
      expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']),
    );
    await waitFor(() =>
      expect(m.logRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ recipeId: 'yogurt', slotIndex: 3 }),
      ),
    );
  });

  it('a logged entry with a slotIndex ticks only its own row', () => {
    day([logged(3)]);
    render(<TrackerPage />);
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('a legacy entry without a slotIndex ticks the first matching row only', () => {
    day([logged()]);
    render(<TrackerPage />);
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });
});

// T-19.6: a Track-only user may never generate a plan — the empty state
// reads as an invitation to log, not a missing-plan error.
describe('Tracker — no-plan empty state (T-19.6)', () => {
  it('reads as an invitation to log when there is no active plan', () => {
    m.state.day =
      m.state.server =
      m.state.cache =
        {
          date: '2026-09-26',
          plannedMeals: [],
          hasActivePlan: false,
          offPlanLogged: [],
          log: null,
          targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
        };
    render(<TrackerPage />);
    expect(screen.getByTestId('tracker-empty-plan').textContent).toContain(
      'No plan today — log from Recent or search below.',
    );
    expect(screen.queryByText('Go to Meal Planner →')).toBeNull();
  });

  it('keeps the "Go to Meal Planner" copy when a plan exists but today is empty', () => {
    m.state.day =
      m.state.server =
      m.state.cache =
        {
          date: '2026-09-26',
          plannedMeals: [],
          hasActivePlan: true,
          offPlanLogged: [],
          log: null,
          targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
        };
    render(<TrackerPage />);
    expect(screen.getByText('Go to Meal Planner →')).toBeTruthy();
  });
});

// ─── UX-FOOD-01 / UX-FOOD-06: ticks follow the server, failures revert ─────────

describe('Tracker — ticks follow the server (UX-FOOD-01)', () => {
  const pressed = () => checks().map((b) => b.getAttribute('aria-pressed'));

  it('Undo unticks the row and takes the meal out of the totals', async () => {
    day(null);
    render(<TrackerPage />);
    const [first] = checks();
    if (!first) throw new Error('expected a snack row');
    fireEvent.click(first);
    await waitFor(() => expect(screen.getByText('Logged snack')).toBeTruthy());
    expect(pressed()).toEqual(['true', 'false']);
    expect(screen.getByText(/150 \/ 2,000 kcal/)).toBeTruthy();

    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() => expect(pressed()).toEqual(['false', 'false']));
    expect(screen.getByText(/0 \/ 2,000 kcal/)).toBeTruthy();
    expect(m.unlogRecipe).toHaveBeenCalled();
  });

  it('"Removed … Undo" ticks the row again', async () => {
    day([logged(1)]);
    render(<TrackerPage />);
    expect(pressed()).toEqual(['true', 'false']);
    const [first] = checks();
    if (!first) throw new Error('expected a snack row');
    fireEvent.click(first);
    await waitFor(() => expect(screen.getByText('Removed snack')).toBeTruthy());
    expect(pressed()).toEqual(['false', 'false']);
    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() => expect(pressed()).toEqual(['true', 'false']));
  });

  it('a meal logged elsewhere (Today, the Log sheet) shows ticked without a reload', () => {
    day(null);
    render(<TrackerPage />);
    expect(pressed()).toEqual(['false', 'false']);
    act(() => {
      setCache({
        ...(m.state.cache as Day),
        log: { loggedMeals: [{ ...logged(3), entryId: 'other' }] },
      });
    });
    expect(pressed()).toEqual(['false', 'true']);
  });
});

describe('Tracker — failed writes revert and say so (UX-FOOD-06)', () => {
  it('a failed tick unticks the row, shows the reason, and never shows "Logged"', async () => {
    day(null);
    m.state.failWrites = true;
    render(<TrackerPage />);
    const [first] = checks();
    if (!first) throw new Error('expected a snack row');
    fireEvent.click(first);
    await waitFor(() =>
      expect(
        screen.getByText(
          "Couldn't log snack. Can't reach Chefer right now. Check your connection and try again.",
        ),
      ).toBeTruthy(),
    );
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect(screen.queryByText('Logged snack')).toBeNull();
  });

  it('a failed untick keeps the row ticked', async () => {
    day([logged(1)]);
    m.state.failWrites = true;
    render(<TrackerPage />);
    const [first] = checks();
    if (!first) throw new Error('expected a snack row');
    fireEvent.click(first);
    await waitFor(() => expect(screen.getByText(/Couldn't remove snack\./)).toBeTruthy());
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(screen.queryByText('Removed snack')).toBeNull();
  });
});

// ─── UX-FOOD-03: off-plan rows are editable and removable ──────────────────────

describe('Tracker — "Also eaten" recipe rows (UX-FOOD-03)', () => {
  const offPlanEntry = {
    entryId: 'o1',
    recipeId: 'pad-thai',
    mealType: 'dinner',
    portionMultiplier: 1,
    kcal: 603,
    protein: 20,
    carbs: 80,
    fat: 20,
  };
  const withOffPlan = () =>
    day([offPlanEntry], {
      plannedMeals: [],
      hasActivePlan: true,
      offPlanLogged: [{ ...offPlanEntry, recipeName: 'Tofu Pad Thai' }],
    });

  it('tapping the row opens an editor, and Save sends the new portion by entryId', async () => {
    withOffPlan();
    render(<TrackerPage />);
    fireEvent.click(screen.getByTestId('tracker-off-plan-o1'));
    fireEvent.click(screen.getByTestId('edit-recipe-entry-portion-2'));
    fireEvent.click(screen.getByTestId('edit-recipe-entry-save'));
    await waitFor(() =>
      expect(m.updateRecipeEntry).toHaveBeenCalledWith({
        date: expect.any(String) as string,
        entryId: 'o1',
        portionMultiplier: 2,
        mealType: 'dinner',
      }),
    );
  });

  it('the bin removes it with Undo, and the totals follow', async () => {
    withOffPlan();
    render(<TrackerPage />);
    expect(screen.getByText(/603 \/ 2,000 kcal/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Delete Tofu Pad Thai'));
    await waitFor(() =>
      expect(m.deleteEntries).toHaveBeenCalledWith({
        date: expect.any(String) as string,
        entryIds: ['o1'],
      }),
    );
    await waitFor(() => expect(screen.getByText('Deleted Tofu Pad Thai')).toBeTruthy());
    expect(screen.queryByTestId('tracker-off-plan-o1')).toBeNull();
    expect(screen.getByText(/0 \/ 2,000 kcal/)).toBeTruthy();

    fireEvent.click(screen.getByText('Undo'));
    // Undo re-logs the same recipe, meal and portion.
    await waitFor(() =>
      expect(m.logRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          recipeId: 'pad-thai',
          mealType: 'dinner',
          portionMultiplier: 1,
        }),
      ),
    );
  });
});

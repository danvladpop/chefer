// @vitest-environment jsdom
import { capture } from '@/lib/analytics';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookMode } from './cook-mode';

// Audit F-REC-6-5: cook mode is keyboard-drivable on desktop.

const RECIPE = {
  id: 'r1',
  name: 'Tomato Soup',
  servings: 2,
  allergenWarnings: [],
  ingredients: [{ name: 'tomato', quantity: 4, unit: 'piece' }],
  instructions: ['Chop the tomatoes.', 'Simmer for 5 minutes.', 'Blend and serve.'],
};

let mockSearch = '';
let mockQuery: Record<string, unknown> = {};
const mockRefetch = vi.fn();
let mockMembers: { name: string; portionFactor: number }[] | null = null;
let mockCookingFor: number | null = null;
const mockLogRecipe = vi.fn();
const mockUnlogRecipe = vi.fn();
let mockLogSucceeds = false;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@chefer/ui', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  ErrorState: ({ title, onRetry }: { title?: string; onRetry?: () => void }) => (
    <div role="alert">
      <p>{title}</p>
      <button onClick={onRetry}>Try again</button>
    </div>
  ),
}));
vi.mock('@/features/recipe/components/StarRatingWidget', () => ({
  StarRatingWidget: () => null,
}));
vi.mock('@/features/meal-plan/components/RebalanceBanner', () => ({ RebalanceBanner: () => null }));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ scaledMembers: mockMembers }) }));
vi.mock('@/hooks/useCookingFor', () => ({ useCookingFor: () => mockCookingFor }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'metric' }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { getDay: { invalidate: vi.fn() }, weeklySummary: { invalidate: vi.fn() } },
      dashboard: { summary: { invalidate: vi.fn() } },
    }),
    mealPlan: {
      getRecipe: {
        useQuery: () => ({ data: RECIPE, isLoading: false, refetch: mockRefetch, ...mockQuery }),
      },
    },
    tracker: {
      logRecipe: {
        useMutation: (opts: { onSuccess?: (r: unknown, v: unknown) => void }) => ({
          mutate: (input: unknown) => {
            mockLogRecipe(input);
            if (mockLogSucceeds) opts.onSuccess?.({ rebalance: null }, input);
          },
          isPending: false,
          isError: false,
        }),
      },
      unlogRecipe: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            mockUnlogRecipe(input);
            opts.onSuccess?.();
          },
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.mocked(capture).mockClear();
  mockSearch = '';
  mockQuery = {};
  mockMembers = null;
  mockCookingFor = null;
  mockLogRecipe.mockReset();
  mockUnlogRecipe.mockReset();
  mockLogSucceeds = false;
  vi.useRealTimers();
});

const key = (k: string, init: KeyboardEventInit = {}, target: Element | Document = document) =>
  fireEvent.keyDown(target, { key: k, ...init });

describe('CookMode keyboard control (F-REC-6-5)', () => {
  it('ArrowRight / ArrowLeft move between steps, announced via a polite live region', () => {
    render(<CookMode recipeId="r1" />);
    const label = screen.getByText('Step 1 of 3');
    expect(label.closest('[aria-live="polite"]')).toBeTruthy();

    key('ArrowRight');
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    expect(screen.getByText('Simmer for 5 minutes.')).toBeTruthy();

    key('ArrowLeft');
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    key('ArrowLeft'); // clamps at the first step
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('ArrowRight on the last step opens the finish screen, like the Finish button', () => {
    render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    key('ArrowRight');
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    key('ArrowRight');
    expect(screen.getByText(/enjoy your tomato soup/i)).toBeTruthy();
  });

  it('ignores arrows with a modifier held or while typing in a field', () => {
    render(<CookMode recipeId="r1" />);
    key('ArrowRight', { altKey: true });
    key('ArrowRight', { metaKey: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    key('ArrowRight', {}, input);
    input.remove();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('Space starts and pauses the step timer, but not while a button has focus', () => {
    render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    const start = screen.getByRole('button', { name: 'Start timer' });

    // Focus on a button: Space belongs to that button (native activation).
    key(' ', {}, start);
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeTruthy();

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(spaceEvent);
    });
    expect(spaceEvent.defaultPrevented).toBe(true); // no page scroll
    expect(screen.getByRole('button', { name: 'Pause timer' })).toBeTruthy();

    key(' ');
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeTruthy();
  });

  it('leaves Space alone on a step without a timer', () => {
    render(<CookMode recipeId="r1" />);
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.body.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(false);
  });

  it('shows the desktop keyboard hint, with the timer shortcut only on timer steps', () => {
    render(<CookMode recipeId="r1" />);
    const hint = () => screen.getByText('steps').parentElement;
    expect(hint()?.className).toMatch(/hidden/);
    expect(hint()?.className).toMatch(/lg:flex/);
    expect(hint()?.textContent).not.toMatch(/Space/);
    key('ArrowRight');
    expect(hint()?.textContent).toMatch(/Space/);
  });
});

describe('CookMode — plan portion (audit P1-1)', () => {
  it('starts at the plan portion and logs it on "Made it!"', () => {
    mockSearch = 'meal=dinner&portion=1.5';
    render(<CookMode recipeId="r1" />);
    // A 2-serving recipe at a 1.5× slot: 3 servings, like the shopping list.
    expect(screen.getByText('3')).toBeTruthy();
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    expect(mockLogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1', mealType: 'dinner', portionMultiplier: 1.5 }),
    );
  });

  it('logs one serving without a plan portion', () => {
    mockSearch = 'meal=lunch';
    render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    expect(mockLogRecipe).toHaveBeenCalledWith(expect.objectContaining({ portionMultiplier: 1 }));
  });
});

describe('CookMode — table servings (UX-REC-02, UX-PLAN-02)', () => {
  it('owner 2x + Mia 1/2 + Noah 1 = 3½ servings, not the portion multiplied across the table', () => {
    mockSearch = 'meal=dinner&portion=2';
    mockMembers = [
      { name: 'Mia', portionFactor: 0.5 },
      { name: 'Noah', portionFactor: 1 },
    ];
    render(<CookMode recipeId="r1" />);
    expect(screen.getByText('3½')).toBeTruthy();
    // …and "Made it!" still logs the USER's portion only.
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    expect(mockLogRecipe).toHaveBeenCalledWith(expect.objectContaining({ portionMultiplier: 2 }));
  });

  it('"two of us" cooks for two while logging one portion', () => {
    mockSearch = 'meal=dinner';
    mockCookingFor = 2;
    render(<CookMode recipeId="r1" />);
    // the 2-serving recipe already feeds two
    expect(screen.getByText('2')).toBeTruthy();
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    expect(mockLogRecipe).toHaveBeenCalledWith(expect.objectContaining({ portionMultiplier: 1 }));
  });
});

// UX-COOK-03: a failed load is not a spinner forever; a recipe without steps is not "Step 1 of 0".
describe('CookMode load states (UX-COOK-03)', () => {
  it('a failed load shows an error with Try again and a Close link, not a spinner', () => {
    mockQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { httpStatus: 500 } },
    };
    render(<CookMode recipeId="r1" />);
    expect(screen.getByTestId('cook-load-error')).toBeTruthy();
    expect(screen.getByTestId('cook-error-close').getAttribute('href')).toBe('/recipes');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('a real NOT_FOUND keeps its copy', () => {
    mockQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { code: 'NOT_FOUND', httpStatus: 404 } },
    };
    render(<CookMode recipeId="r1" />);
    expect(screen.getByTestId('cook-not-found')).toBeTruthy();
    expect(screen.queryByTestId('cook-load-error')).toBeNull();
  });

  it('a recipe with no steps says so instead of "Step 1 of 0"', () => {
    mockQuery = { data: { ...RECIPE, instructions: [] } };
    render(<CookMode recipeId="r1" />);
    expect(screen.getByTestId('cook-no-steps')).toBeTruthy();
    expect(screen.queryByText(/Step \d+ of 0/)).toBeNull();
    expect(screen.getByRole('button', { name: /Finish/ })).toBeTruthy();
  });
});

// UX-COOK-01 / 04 / 05 (WP-11, web parity with the mobile cook screen).
describe('CookMode step timers (UX-COOK-01)', () => {
  const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

  it('a running timer survives a step change and shows in the header', () => {
    vi.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });
    render(<CookMode recipeId="r1" />);
    key('ArrowRight'); // step 2 has the 5 minute timer
    press('Start timer');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('4:30')).toBeTruthy();

    key('ArrowRight'); // step 3: no timer here, but it keeps running in the header
    expect(screen.queryByRole('button', { name: 'Pause timer' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('cook-timer-chip-1').textContent).toMatch(/Step 2 · 4:00/);

    fireEvent.click(screen.getByTestId('cook-timer-chip-1'));
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    expect(screen.getByText('4:00')).toBeTruthy();
  });

  it('vibrates once at zero and reads Done!', () => {
    vi.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    press('Start timer');
    act(() => {
      vi.advanceTimersByTime(300_000 + 1000);
    });
    expect(screen.getByText('Done!')).toBeTruthy();
    expect(vibrate).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('pausing keeps what is left and Reset restores the full time', () => {
    vi.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });
    render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    press('Start timer');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    press('Pause timer');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('4:00')).toBeTruthy();
    press('Reset timer');
    expect(screen.getByText('5:00')).toBeTruthy();
  });
});

describe('CookMode step amounts and servings (UX-COOK-04, UX-COOK-05)', () => {
  it("lists the step's ingredients with scaled amounts", () => {
    render(<CookMode recipeId="r1" />);
    const card = screen.getByTestId('cook-step-amounts');
    expect(card.textContent).toMatch(/For 2 servings/);
    expect(card.textContent).toMatch(/4 piece/);
    expect(card.textContent).toMatch(/tomato/);
  });

  it('starts at the servings the recipe page passed, and rescales the amounts', () => {
    mockSearch = 'servings=6';
    render(<CookMode recipeId="r1" />);
    const card = screen.getByTestId('cook-step-amounts');
    expect(card.textContent).toMatch(/For 6 servings/);
    expect(card.textContent).toMatch(/12 piece/);
  });

  it('caps the stepper at 20, the same as the recipe page, with 44 px buttons', () => {
    mockSearch = 'servings=20';
    render(<CookMode recipeId="r1" />);
    const more = screen.getByRole('button', { name: 'More servings' });
    expect(more.className).toMatch(/\bh-11\b/);
    expect(more.className).toMatch(/\bw-11\b/);
    fireEvent.click(more);
    expect(screen.getAllByText('20').length).toBeGreaterThan(0);
    expect(screen.queryByText('21')).toBeNull();
  });

  it('ignores a junk servings param', () => {
    mockSearch = 'servings=lots';
    render(<CookMode recipeId="r1" />);
    expect(screen.getByTestId('cook-step-amounts').textContent).toMatch(/For 2 servings/);
  });
});

describe('CookMode log slot chooser and Undo (UX-COOK-04)', () => {
  const toFinish = () => {
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
  };

  it('logs under the slot you pick, not the clock', () => {
    mockSearch = 'meal=dinner';
    render(<CookMode recipeId="r1" />);
    toFinish();
    fireEvent.click(screen.getByRole('button', { name: 'Snack' }));
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    expect(mockLogRecipe).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'snack' }));
  });

  it('Undo takes the log back and brings the chooser back', () => {
    mockSearch = 'meal=lunch';
    mockLogSucceeds = true;
    render(<CookMode recipeId="r1" />);
    toFinish();
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    expect(screen.getByText(/Logged to today's tracker as lunch/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('cook-log-undo'));
    expect(mockUnlogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1', mealType: 'lunch' }),
    );
    expect(screen.getByTestId('cook-slot')).toBeTruthy();
  });
});

// UX-PO-02: the beta funnel — a finished cook and the source of the logged meal.
describe('CookMode analytics (UX-PO-02)', () => {
  it('fires cook_finished once when the finish screen is reached, however it is reached', () => {
    render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    key('ArrowRight');
    expect(capture).not.toHaveBeenCalledWith('cook_finished', expect.anything());
    key('ArrowRight');
    expect(capture).toHaveBeenCalledWith('cook_finished', {});
    // Back to the steps and finish again: still one finished cook.
    fireEvent.click(screen.getByRole('button', { name: /back to the steps|steps/i }));
    key('ArrowRight');
    const finished = vi.mocked(capture).mock.calls.filter(([event]) => event === 'cook_finished');
    expect(finished).toHaveLength(1);
  });

  it('logs the meal as planned when opened from a plan slot, quick otherwise', () => {
    mockSearch = 'meal=lunch';
    mockLogSucceeds = true;
    const { unmount } = render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    expect(capture).toHaveBeenCalledWith('meal_logged', { source: 'planned', mealType: 'lunch' });
    unmount();

    vi.mocked(capture).mockClear();
    mockSearch = '';
    render(<CookMode recipeId="r1" />);
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowRight');
    fireEvent.click(screen.getByText('Made it! Log this meal'));
    const logged = vi.mocked(capture).mock.calls.find(([event]) => event === 'meal_logged');
    expect(logged?.[1]).toMatchObject({ source: 'quick' });
  });
});

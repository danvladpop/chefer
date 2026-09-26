// @vitest-environment jsdom
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
const mockLogRecipe = vi.fn();
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
}));
vi.mock('@/features/recipe/components/StarRatingWidget', () => ({
  StarRatingWidget: () => null,
}));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ portionSum: null }) }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'metric' }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    mealPlan: {
      getRecipe: { useQuery: () => ({ data: RECIPE, isLoading: false }) },
    },
    tracker: {
      logRecipe: {
        useMutation: () => ({ mutate: mockLogRecipe, isPending: false, isError: false }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  mockSearch = '';
  mockLogRecipe.mockReset();
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

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDay } from '@chefer/utils';
import { AddToWeekSheet } from './AddToWeekSheet';

// UX-REC-08 (web twin of the phone's Add to my week): a day + meal picker that
// adds through `recipe.addToWeek`, confirms a Replace, shows the table-safety
// conflict with "Use anyway", and offers "Make a plan" when there is no plan.

interface Shared {
  plan: unknown;
  planLoading: boolean;
  addMutateAsync: ReturnType<typeof vi.fn>;
}
const m = vi.hoisted((): Shared => ({ plan: null, planLoading: false, addMutateAsync: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { getForWeek: { invalidate: vi.fn() } },
      recipe: { list: { invalidate: vi.fn() } },
      dashboard: { summary: { invalidate: vi.fn() } },
    }),
    mealPlan: {
      getForWeek: {
        useQuery: () => ({
          data: m.plan,
          isLoading: m.planLoading,
          isError: false,
        }),
      },
      getShape: { useQuery: () => ({ data: { slots: ['breakfast', 'lunch', 'dinner'] } }) },
    },
    recipe: {
      addToWeek: { useMutation: () => ({ mutateAsync: m.addMutateAsync, isPending: false }) },
    },
  },
}));

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);

const RECIPE = { id: 'r1', name: 'Lentil soup', kcal: 300.4 };
const TODAY = defaultDay(0);
// Today's slot rows come from the plan's day matching today's weekday.
const PLAN = {
  planId: 'p1',
  days: [
    {
      dayOfWeek: TODAY,
      meals: [{ type: 'lunch', recipe: { name: 'Chicken wrap' } }],
    },
  ],
};

const RESULT = {
  planId: 'p1',
  dayOfWeek: TODAY,
  mealType: 'breakfast',
  slotIndex: 0,
  addedRecipeId: 'r1',
};

function renderSheet() {
  const onAdded = vi.fn();
  const onClose = vi.fn();
  render(<AddToWeekSheet open onClose={onClose} recipe={RECIPE} onAdded={onAdded} />);
  return { onAdded, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.plan = PLAN;
  m.planLoading = false;
});

describe('AddToWeekSheet', () => {
  it('shows the recipe, defaults to today and lists a row per planned meal', () => {
    renderSheet();
    expect(screen.getByText('Lentil soup · 300 kcal')).toBeInTheDocument();
    expect(screen.getByTestId(`add-to-week-day-${TODAY}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('add-to-week-slot-breakfast-add')).toHaveTextContent('Add here');
    expect(screen.getByTestId('add-to-week-slot-lunch-0')).toHaveTextContent('Chicken wrap');
    expect(screen.getByTestId('add-to-week-slot-lunch-0')).toHaveTextContent('Replace');
    expect(screen.getByTestId('add-to-week-cta')).toBeDisabled();
  });

  it('adds straight into an empty slot and reports the result', async () => {
    m.addMutateAsync.mockResolvedValue(RESULT);
    const { onAdded, onClose } = renderSheet();
    fireEvent.click(screen.getByTestId('add-to-week-slot-breakfast-add'));
    fireEvent.click(screen.getByTestId('add-to-week-cta'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(m.addMutateAsync).toHaveBeenCalledWith({
      recipeId: 'r1',
      weekOffset: 0,
      dayOfWeek: TODAY,
      mealType: 'breakfast',
      mode: 'add',
    });
    expect(onAdded).toHaveBeenCalledWith(RESULT);
    expect(onClose).toHaveBeenCalled();
  });

  it('asks before replacing a filled slot, and sends its index', async () => {
    m.addMutateAsync.mockResolvedValue({ ...RESULT, mealType: 'lunch', previousRecipeId: 'x' });
    const { onAdded } = renderSheet();
    fireEvent.click(screen.getByTestId('add-to-week-slot-lunch-0'));
    fireEvent.click(screen.getByTestId('add-to-week-cta'));
    expect(m.addMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-to-week-confirm')).toHaveTextContent('Replace Chicken wrap?');
    fireEvent.click(screen.getByTestId('add-to-week-replace'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(m.addMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'lunch', mode: 'replace', slotIndex: 0 }),
    );
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('shows a table-safety conflict and retries with "Use anyway"', async () => {
    m.addMutateAsync.mockRejectedValueOnce({
      message: 'UNSAFE_FOR_TABLE: contains peanuts',
      data: { unsafeForTable: { issues: ['peanuts'] } },
    });
    m.addMutateAsync.mockResolvedValueOnce(RESULT);
    const { onAdded } = renderSheet();
    fireEvent.click(screen.getByTestId('add-to-week-slot-breakfast-add'));
    fireEvent.click(screen.getByTestId('add-to-week-cta'));
    expect(await screen.findByTestId('add-to-week-conflict')).toHaveTextContent('contains peanuts');
    expect(onAdded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('add-to-week-use-anyway'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(m.addMutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ acknowledgeConflict: true }),
    );
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('with no plan for the week it offers "Make a plan" instead of slots', () => {
    m.plan = null;
    renderSheet();
    expect(screen.getByTestId('add-to-week-no-plan')).toHaveTextContent('Make a plan');
    expect(screen.getByRole('link', { name: 'Make a plan' })).toHaveAttribute('href', '/meal-plan');
    expect(screen.queryByTestId('add-to-week-cta')).toBeNull();
  });
});

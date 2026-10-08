// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanDayMeals, type PlanMealSlot } from './PlanDayMeals';

// FB7-11 + FB7-04: the compact action column (swap + "…" menu), the pinned
// bookmark on the photo, the meta and macro lines, and the meal group.

vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));

afterEach(cleanup);

const recipe = (id: string, name: string, calories: number, extra: object = {}) => ({
  id,
  name,
  description: '',
  cuisineType: 'any',
  prepTimeMins: 10,
  cookTimeMins: 20,
  nutritionInfo: { calories, protein: 32, carbs: 60, fat: 18, fiber: 4 },
  ...extra,
});

const MEALS: PlanMealSlot[] = [
  { type: 'breakfast', recipe: recipe('oats', 'Oats', 350) },
  { type: 'lunch', recipe: recipe('chicken', 'Grilled Chicken', 500), pinned: true },
  { type: 'dinner', recipe: recipe('curry', 'Chicken Curry', 700) },
  // A side dish of lunch, added last: its slot index is 3, but it displays under the lunch.
  { type: 'lunch', recipe: recipe('rice', 'Herbed Rice', 250, { aiGenerated: true }) },
];

function renderDay(over: Partial<React.ComponentProps<typeof PlanDayMeals>> = {}) {
  const handlers = {
    onReplaceMeal: vi.fn(),
    onTogglePin: vi.fn(),
    onAddSide: vi.fn(),
    onRemoveSide: vi.fn(),
  };
  render(
    <PlanDayMeals meals={MEALS} planId="p1" dayOfWeek={2} variant="row" {...handlers} {...over} />,
  );
  return handlers;
}

describe('plan meal card (FB7-11)', () => {
  it('shows a meta line and a macro line, with the AI mark as a small labelled icon', () => {
    renderDay();
    expect(screen.getByTestId('plan-meal-dinner-meta').textContent).toBe('30 min · 700 kcal');
    expect(screen.getByTestId('plan-meal-dinner-macros').textContent).toBe(
      'P 32 g · C 60 g · F 18 g',
    );
    const ai = screen.getByTestId('ai-generated-chip');
    expect(ai.getAttribute('aria-label')).toBeTruthy();
    expect(ai.textContent).toBe('');
  });

  it('a pinned meal shows a bookmark on its photo, not an always-visible pin button', () => {
    renderDay();
    expect(screen.getByTestId('plan-meal-lunch-pinned').getAttribute('aria-label')).toBe(
      'Your pick',
    );
    expect(screen.queryByTestId('plan-meal-pin-lunch')).toBeNull();
    expect(screen.queryByRole('button', { name: /Keep |Stop keeping/ })).toBeNull();
  });

  it('swap is one click on the card, and carries the slot', () => {
    const { onReplaceMeal } = renderDay();
    fireEvent.click(screen.getByRole('button', { name: 'Replace Chicken Curry' }));
    expect(onReplaceMeal).toHaveBeenCalledWith('dinner', 'Chicken Curry', 2, 'curry');
  });

  it('the "…" menu: pin toggle, add a side dish, and no Remove on a main dish', () => {
    const { onTogglePin, onAddSide } = renderDay();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Chicken Curry' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Keep in next plans' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Remove from plan' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add a side dish' }));
    expect(onAddSide).toHaveBeenCalledWith('dinner', 'Chicken Curry', 2, 'curry');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Grilled Chicken' }));
    // Already pinned: the item says how to undo it.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop keeping in next plans' }));
    expect(onTogglePin).toHaveBeenCalledWith('lunch', 1, false);
  });

  it('Remove from plan is on side dishes only, and addresses the side by its own slot', () => {
    const { onRemoveSide } = renderDay();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Herbed Rice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from plan' }));
    expect(onRemoveSide).toHaveBeenCalledWith('lunch', 3, { id: 'rice', name: 'Herbed Rice' });
  });

  it('Escape closes the menu and returns focus to the trigger', () => {
    renderDay();
    const trigger = screen.getByRole('button', { name: 'More actions for Chicken Curry' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('the log actions (Ate something else / Skipped it) live in the same menu', () => {
    const onAteElse = vi.fn();
    const onSkip = vi.fn();
    const flow = {
      openAteElse: onAteElse,
      skip: onSkip,
    } as never;
    renderDay({ slotUi: { flow, loggedMeals: [], skippedSlots: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Oats' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Skipped it' }));
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'breakfast' }));
  });

  it('a read-only (past) week has no actions at all', () => {
    renderDay({ readOnly: true });
    expect(screen.queryByRole('button', { name: /More actions|Replace/ })).toBeNull();
  });

  it('protein-only mode keeps the meta line and drops the macro line', async () => {
    const { NumbersModeProvider } = await import('@/features/numbers-mode/numbers-mode');
    render(
      <NumbersModeProvider mode="PROTEIN_ONLY">
        <PlanDayMeals meals={MEALS} planId="p1" dayOfWeek={2} variant="row" />
      </NumbersModeProvider>,
    );
    expect(screen.getByTestId('plan-meal-dinner-meta').textContent).toBe('30 min · 32 g protein');
    expect(screen.queryByTestId('plan-meal-dinner-macros')).toBeNull();
  });
});

describe('meal group (FB7-04)', () => {
  it('two lunches render as one group: count, main, a +side card, and the total', () => {
    renderDay();
    const group = screen.getByTestId('plan-meal-group-lunch');
    expect(group.textContent).toContain('2 dishes');
    // The side keeps its original slot in its links.
    const links = group.querySelectorAll('a');
    expect(links[0]?.getAttribute('href')).toContain('/recipes/chicken?');
    expect(links[1]?.getAttribute('href')).toContain('slot=3');
    expect(screen.getByTestId('plan-meal-lunch-3-side').textContent).toBe('+ side');
    expect(screen.getByTestId('plan-meal-group-lunch-total').textContent).toContain(
      '750 kcal · P 64 g · C 120 g · F 36 g',
    );
    // Single-dish meals get no group chrome.
    expect(screen.queryByTestId('plan-meal-group-dinner')).toBeNull();
    expect(screen.queryByTestId('plan-meal-group-breakfast')).toBeNull();
  });
});

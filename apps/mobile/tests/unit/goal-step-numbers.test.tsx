import { render, screen } from '@testing-library/react-native';
import { NumbersModeProvider } from '../../src/features/numbers-mode/numbers-mode';
import { GoalStep } from '../../src/features/preferences/components/goal-step';

// Lane E3: a goal's kcal effect ("−500 kcal/day deficit") is a nutrition
// figure, so protein-only and "Hide numbers" users see the goal without it.

describe('GoalStep in each numbers mode', () => {
  it.each([false, true])('shows the calorie effect in full mode (compact %s)', async (compact) => {
    await render(<GoalStep value={null} onChange={jest.fn()} compact={compact} />);
    expect(screen.getByText(/−500 kcal\/day deficit/)).toBeTruthy();
  });

  it.each([false, true])('hides it in "Hide numbers" (compact %s)', async (compact) => {
    await render(
      <NumbersModeProvider mode="NONE">
        <GoalStep value={null} onChange={jest.fn()} compact={compact} />
      </NumbersModeProvider>,
    );
    expect(screen.queryByText(/kcal/)).toBeNull();
    expect(screen.getByText(/Lose Weight/)).toBeTruthy();
  });
});

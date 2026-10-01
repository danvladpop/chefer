import { Text } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { DayCardView } from '../../src/features/gym/routine/day-card-view';
import { MealCardView } from '../../src/features/meal-plan/meal-card-view';

// F2.2 extractions: the owner screens' presentational parts, reused read-only
// by the Following views. These pin the testIDs and behaviours the owner's
// Routine tab and Plan tab (and their Maestro flows) depend on.

describe('DayCardView (owner Routine tab shape)', () => {
  const exercises = [
    { id: 'e1', name: 'Bench', summary: '3 × 6–8', supersetGroup: 'A', restSec: 90 },
    { id: 'e2', name: 'Row', summary: '3 × 8–10', supersetGroup: 'A', restSec: 120 },
    { id: 'e3', name: 'Curl', summary: '2 × 10–12', supersetGroup: null, restSec: 60 },
  ];

  it('keeps the routine-day / routine-exercise testIDs and brackets supersets', async () => {
    const onPress = jest.fn();
    await render(
      <DayCardView
        testID="routine-day-d1"
        exerciseTestIDPrefix="routine-exercise"
        title="Upper A"
        subtitle="Monday"
        badge={<Text testID="routine-day-d1-next">Next up</Text>}
        exercises={exercises.map((e, i) =>
          i === 0 ? { ...e, onPress, detail: <Text>Next: 60 kg × 8/8/8</Text> } : e,
        )}
      />,
    );
    expect(screen.getByTestId('routine-day-d1')).toBeTruthy();
    expect(screen.getByTestId('routine-day-d1-next')).toBeTruthy();
    expect(screen.getByTestId('routine-day-d1-superset-A')).toBeTruthy();
    expect(screen.getByText('120 s rest after each round')).toBeTruthy();
    expect(screen.getByTestId('routine-exercise-e1-superset').props.children).toEqual(['A', 1]);
    expect(screen.getByTestId('routine-exercise-e2-superset').props.children).toEqual(['A', 2]);
    expect(screen.queryByTestId('routine-exercise-e3-superset')).toBeNull();
    expect(screen.getByText('Next: 60 kg × 8/8/8')).toBeTruthy();
    // Only rows with an action are buttons.
    expect(screen.getByTestId('routine-exercise-e1').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('routine-exercise-e2').props.accessibilityRole).toBeUndefined();
    await userEvent.setup().press(screen.getByTestId('routine-exercise-e1'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows only the first n exercises when asked', async () => {
    await render(
      <DayCardView
        testID="d"
        exerciseTestIDPrefix="x"
        title="Day"
        exercises={exercises}
        visibleCount={1}
      />,
    );
    expect(screen.getByText('Bench')).toBeTruthy();
    expect(screen.queryByText('Row')).toBeNull();
  });

  it('shows the empty line', async () => {
    await render(<DayCardView testID="d" exerciseTestIDPrefix="x" title="Day" exercises={[]} />);
    expect(screen.getByText('No exercises yet.')).toBeTruthy();
  });
});

describe('MealCardView', () => {
  it('is a button with onPress', async () => {
    const onPress = jest.fn();
    await render(
      <MealCardView testID="m" mealType="lunch" name="Wrap" imageUrl={null} onPress={onPress} />,
    );
    expect(screen.getByTestId('m').props.accessibilityRole).toBe('button');
    await userEvent.setup().press(screen.getByTestId('m'));
    expect(onPress).toHaveBeenCalled();
  });

  it('without onPress it is one labelled element, not a button', async () => {
    await render(
      <MealCardView
        testID="m"
        mealType="dinner"
        name="Hidden recipe"
        imageUrl={null}
        placeholder
        accessibilityLabel="Hidden recipe, 610 kcal"
      />,
    );
    expect(screen.getByTestId('m').props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId('m').props.accessibilityLabel).toBe('Hidden recipe, 610 kcal');
    expect(screen.getByTestId('m-placeholder')).toBeTruthy();
  });
});

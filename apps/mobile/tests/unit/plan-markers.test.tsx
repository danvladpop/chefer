import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PlanTrainingDay } from '@chefer/types';
import { weekdayLongName } from '@chefer/utils';
import { PlanDayChips } from '../../src/features/meal-plan/plan-day-chips';
import { PreRunNote, TrainingDayHeader } from '../../src/features/meal-plan/training-day-header';

// UX-06 T-06.4: training days on the Plan tab — glyph on the chip (only on the
// planned weekdays), the day header, and honest copy for users whose goal gets
// no kcal bump.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: { name: string; testID?: string }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return <RN.Text testID={props.testID ?? `icon-${props.name}`}>{props.name}</RN.Text>;
  },
}));

const day = (
  over: Partial<PlanTrainingDay> & Pick<PlanTrainingDay, 'dayOfWeek'>,
): PlanTrainingDay => ({
  dayName: weekdayLongName(over.dayOfWeek),
  kind: 'lift',
  workoutName: 'Upper A',
  kcalBonus: 300,
  proteinBonus: 30,
  carbsBonus: 40,
  done: false,
  applied: true,
  targetKcal: 2540,
  targetProteinG: 165,
  ...over,
});

const planDays = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  meals: [{ type: 'dinner' }],
}));

describe('PlanDayChips training markers', () => {
  it('shows the barbell only on the planned training weekdays', async () => {
    await render(
      <PlanDayChips
        plan={{ days: planDays, trainingDays: [0, 2, 4].map((dayOfWeek) => day({ dayOfWeek })) }}
        selectedDay={0}
        todayIndex={null}
        onSelect={jest.fn()}
      />,
    );
    for (const i of [0, 2, 4]) {
      expect(screen.getByTestId(`plan-day-${i}-training`)).toHaveTextContent('barbell-outline');
    }
    for (const i of [1, 3, 5, 6]) {
      expect(screen.queryByTestId(`plan-day-${i}-training`)).toBeNull();
    }
    expect(screen.getByLabelText('Wednesday, training day')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tue')).toBeOnTheScreen();
  });

  it('a run day uses the walk glyph and names the kind', async () => {
    await render(
      <PlanDayChips
        plan={{
          days: planDays,
          trainingDays: [day({ dayOfWeek: 5, kind: 'long_run', workoutName: null })],
        }}
        selectedDay={0}
        todayIndex={null}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId('plan-day-5-training')).toHaveTextContent('walk-outline');
    expect(screen.getByLabelText('Saturday, long run day')).toBeOnTheScreen();
  });

  it('without training days no chip gets a glyph', async () => {
    await render(
      <PlanDayChips
        plan={{ days: planDays }}
        selectedDay={0}
        todayIndex={null}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('plan-day-2-training')).toBeNull();
  });
});

describe('TrainingDayHeader', () => {
  it('shows the title, target and bonus lines and opens the explanation', async () => {
    const onPress = jest.fn();
    await render(<TrainingDayHeader day={day({ dayOfWeek: 2 })} isToday onPress={onPress} />);
    expect(screen.getByTestId('plan-training-header-title')).toHaveTextContent(
      'Training day · Upper A',
    );
    expect(screen.getByTestId('plan-training-header-target')).toHaveTextContent(
      'Target today 2,540 kcal · 165 g protein',
    );
    expect(screen.getByTestId('plan-training-header-bonus')).toHaveTextContent(
      '(+300 kcal, +30 g protein for training)',
    );
    await fireEvent.press(screen.getByTestId('plan-training-header'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a user whose goal gets no bump sees no kcal', async () => {
    await render(
      <TrainingDayHeader
        day={day({
          dayOfWeek: 2,
          kcalBonus: 0,
          proteinBonus: 0,
          carbsBonus: 0,
          applied: false,
          targetKcal: undefined,
          targetProteinG: undefined,
        })}
        isToday={false}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByTestId('plan-training-header-title')).toBeOnTheScreen();
    expect(screen.queryByTestId('plan-training-header-target')).toBeNull();
    expect(screen.queryByTestId('plan-training-header-bonus')).toBeNull();
    expect(screen.queryByText(/kcal/)).toBeNull();
  });

  it('a run day header uses the walk glyph', async () => {
    await render(
      <TrainingDayHeader
        day={day({ dayOfWeek: 1, kind: 'run', workoutName: null })}
        isToday
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('walk-outline')).toBeOnTheScreen();
  });
});

describe('PreRunNote', () => {
  it('names the snack for the evening before a long run', async () => {
    await render(<PreRunNote snack="rice cakes with jam" />);
    expect(screen.getByTestId('plan-pre-run-note')).toHaveTextContent(
      /Long run tomorrow\. A carb snack tonight helps: for example, rice cakes with jam\./,
    );
  });
});

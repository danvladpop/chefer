import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import type { SessionExerciseDoc } from '@chefer/types';
import { WhySheet } from '../../src/features/gym/workout/workout-sheets';
import { safeAreaMetrics, suggestion } from './gym-workout-helpers';

// D2 (CLAUDE.md "Protected delight"): the gym Why? sheet users praised must
// render identically once T-00.1 refactors it onto the kit `ExplainSheet`.
// This test pins the exact copy and testIDs BEFORE that refactor lands, so a
// diff against it after the refactor proves nothing moved.

function exercise(): SessionExerciseDoc {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    exerciseId: 'bench',
    routineExerciseId: null,
    position: 0,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 120,
    skipped: false,
    swappedFromId: null,
    lastSetRir: null,
    prescription: suggestion(),
    notes: null,
    sets: [],
  };
}

describe('WhySheet (D2 protected — gym Why? sheet)', () => {
  it('pins the sentence, rows, footnote and testIDs', async () => {
    await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <WhySheet visible onClose={jest.fn()} exercise={exercise()} name="Bench Press" unit="KG" />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('why-sheet')).toBeTruthy();
    expect(screen.getByTestId('why-sheet-title')).toHaveTextContent('Bench Press');
    expect(screen.getByText('Why this target')).toBeOnTheScreen();
    expect(screen.getByTestId('why-sheet-sentence')).toHaveTextContent(
      'Starting weight: 60 kg. Aim for 10 reps.',
    );

    expect(screen.getByText('Last time')).toBeOnTheScreen();
    expect(screen.getByText('No history yet')).toBeOnTheScreen();
    expect(screen.getByText('Rule')).toBeOnTheScreen();
    expect(screen.getByText('No history yet: a starting point')).toBeOnTheScreen();
    expect(screen.getByText('Next')).toBeOnTheScreen();
    expect(screen.getByText('60 kg × 10 / 10 / 10')).toBeOnTheScreen();

    expect(
      screen.getByText(
        'Change any number freely: the next suggestion uses what you actually lift.',
      ),
    ).toBeOnTheScreen();
  });

  it('renders nothing when there is no exercise (still shows the sheet chrome)', async () => {
    await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <WhySheet visible onClose={jest.fn()} exercise={null} name="Bench Press" unit="KG" />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
    expect(screen.queryByTestId('why-sheet-sentence')).toBeNull();
  });
});

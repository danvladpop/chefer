import * as ReactNative from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ExerciseCard, type WorkoutContext } from '../../src/features/gym/workout/exercise-card';
import { SetRow, type SetRowHandlers } from '../../src/features/gym/workout/set-row';
import { makeExercise, profile } from './gym-fixtures';
import { activeDoc, SE_ID, SET_IDS } from './gym-workout-helpers';

// WP-04 lane B (feedback 1): the logger is used with a barbell in hand and by
// people without reading glasses. These pin the sizes and wrapping rules that
// keep it usable at large OS text: a 52 pt tick, `text-xl` weight/reps values,
// 2-line exercise names, and set-row text that grows (min-h) instead of clipping.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

const handlers: SetRowHandlers = {
  onTick: jest.fn(),
  onWeight: jest.fn(),
  onReps: jest.fn(),
  onOpenWeight: jest.fn(),
  onOpenReps: jest.fn(),
  onLongPress: jest.fn(),
};

const LONG_NAME = 'Single-Arm Incline Dumbbell Bench Press With Neutral Grip';
const bench = makeExercise('bench', LONG_NAME);

function setDoc() {
  const set = activeDoc().exercises[0]?.sets.find((s) => s.id === SET_IDS[0]);
  if (!set) throw new Error('fixture set');
  return set;
}

describe('SetRow readability (WP-04)', () => {
  async function renderRow(weightMode: 'plates' | 'none' = 'plates', last = true) {
    await render(
      <SetRow
        seId={SE_ID}
        set={setDoc()}
        label="Set 1"
        last={last ? { weightKg: 102.5, reps: 10 } : null}
        meta={bench}
        profile={profile}
        unit="KG"
        weightMode={weightMode}
        prKind={null}
        handlers={handlers}
        testID="row"
      />,
    );
  }

  it('the set tick is 52 pt, visual and hit area', async () => {
    await renderRow();
    const tick = screen.getByTestId('row-check');
    const className = String(tick.props.className);
    expect(className).toContain('h-[52px]');
    expect(className).toContain('w-[52px]');
    // No hitSlop shrinking or fixed smaller wrapper: the Pressable is the hit area.
    expect(tick.props.accessibilityRole).toBe('checkbox');
  });

  it('labels are text-sm and the row grows with large text (min-h, never h-)', async () => {
    await renderRow();
    expect(String(screen.getByTestId('row-label').props.className)).toContain('text-sm');
    const last = screen.getByTestId('row-last');
    expect(String(last.props.className)).toContain('text-sm');
    expect(String(last.props.className)).toContain('min-w-0');
    // "Last 102.5 × 10" wraps to a second line rather than clipping mid-word.
    expect(last.props.numberOfLines).toBe(2);
  });

  it('keeps the remove control at 44 pt', async () => {
    await renderRow();
    expect(String(screen.getByTestId('row-menu').props.className)).toMatch(/\bh-11\b.*\bw-11\b/);
  });

  it('a bodyweight set shows its "BW" value at text-xl', async () => {
    await renderRow('none', false);
    expect(String(screen.getByTestId('row-weight-value').props.className)).toContain('text-xl');
  });
});

describe('ExerciseCard readability (WP-04)', () => {
  it('a long exercise name wraps to 2 lines inside a min-w-0 flex child', async () => {
    const doc = activeDoc();
    const se = doc.exercises[0];
    if (!se) throw new Error('fixture exercise');
    const ctx: WorkoutContext = {
      unit: 'KG',
      profile,
      lookup: () => bench,
      prior: [],
      handlers,
      onSheet: jest.fn(),
      onToggle: jest.fn(),
      onRir: jest.fn(),
      onRirDismiss: jest.fn(),
      onSkip: jest.fn(),
      onAddSet: jest.fn(),
      onLayoutY: jest.fn(),
      onLogCardio: jest.fn(),
    };
    await render(<ExerciseCard exercise={se} index={0} expanded isCurrent ctx={ctx} />);
    const name = screen.getByTestId('exercise-0-name');
    expect(name).toHaveTextContent(LONG_NAME);
    expect(name.props.numberOfLines).toBe(2);
    expect(String(name.props.className)).toContain('min-w-0');
    expect(String(screen.getByTestId('exercise-0-add-set').props.className)).toMatch(
      /\bmin-h-12\b/,
    );
  });
  it('large OS text: the suggestion stacks under the chip and "Why?" instead of one word per line', async () => {
    const dims = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.6 });
    const doc = activeDoc();
    const se = doc.exercises[0];
    if (!se) throw new Error('fixture exercise');
    const ctx: WorkoutContext = {
      unit: 'KG',
      profile,
      lookup: () => bench,
      prior: [],
      handlers,
      onSheet: jest.fn(),
      onToggle: jest.fn(),
      onRir: jest.fn(),
      onRirDismiss: jest.fn(),
      onSkip: jest.fn(),
      onAddSet: jest.fn(),
      onLayoutY: jest.fn(),
      onLogCardio: jest.fn(),
    };
    await render(<ExerciseCard exercise={se} index={0} expanded isCurrent ctx={ctx} />);
    const suggestion = screen.getByTestId('exercise-0-suggestion');
    expect(String(suggestion.props.className)).toMatch(/\bw-full\b/);
    expect(String(suggestion.props.className)).not.toMatch(/\bflex-1\b/);
    expect(String(screen.getByTestId('exercise-0-suggestion-row').props.className)).toMatch(
      /\bflex-wrap\b/,
    );
    dims.mockRestore();
  });
});

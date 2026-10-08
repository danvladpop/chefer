import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ProgressionDto, ProgressionState, Suggestion } from '@chefer/types';
import { unitToKg } from '@chefer/utils';
import {
  buildOverridePayload,
  type SetOverrideInput,
} from '../../src/features/gym/routine/override-payload';
import {
  OverrideSheet,
  type OverrideSheetProps,
} from '../../src/features/gym/routine/override-sheet';
import { makeExercise } from './gym-fixtures';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(props: OverrideSheetProps) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <OverrideSheet {...props} />
    </SafeAreaProvider>,
  );
}

// Next-target override (D5c): weight/reps steppers in the user's unit convert
// to kg for `progression.setOverride`. The pure conversion is tested directly
// (buildOverridePayload) and again through the mounted sheet.

const exercise = makeExercise('bench', 'Bench Press');

function makeProgression(overrides: Partial<ProgressionDto> = {}): ProgressionDto {
  const suggestion: Suggestion = {
    kind: 'increase',
    weightKg: 100,
    reps: [8, 8, 8],
    sets: 3,
    reasonCode: 'TOP_OF_RANGE',
    inputs: {},
    deltaKg: 2.5,
    engineVersion: 1,
  };
  const state: ProgressionState = {
    workingWeightKg: 100,
    repTargets: [8, 8, 8],
    sets: 3,
    missStreak: 0,
    stallCount: 0,
    resetDates: [],
    calibrating: false,
    calibrationExposures: 0,
    justIncreased: false,
    preBreakWeightKg: null,
    lastExposureDate: '2026-09-20',
    lastTotalReps: 24,
    next: suggestion,
  };
  return {
    exerciseId: 'bench',
    repBucket: '8-12',
    state,
    override: null,
    suggestion,
    ...overrides,
  };
}

describe('buildOverridePayload', () => {
  it('converts the display weight to kg and repeats the rep target per set', () => {
    const payload = buildOverridePayload({
      exerciseId: 'bench',
      repBucket: '8-12',
      unit: 'LB',
      weightDisplay: 225.5,
      repsDisplay: 9,
      sets: 3,
    });
    expect(payload).toEqual({
      exerciseId: 'bench',
      repBucket: '8-12',
      weightKg: unitToKg(225.5, 'LB'),
      reps: [9, 9, 9],
    });
  });

  it('passes kg through unchanged for KG users', () => {
    const payload = buildOverridePayload({
      exerciseId: 'bench',
      repBucket: '8-12',
      unit: 'KG',
      weightDisplay: 102.5,
      repsDisplay: 8,
      sets: 2,
    });
    expect(payload.weightKg).toBeCloseTo(102.5, 5);
    expect(payload.reps).toEqual([8, 8]);
  });
});

describe('OverrideSheet', () => {
  it('prefills from the suggestion and saves a converted payload', async () => {
    const user = userEvent.setup();
    const calls: SetOverrideInput[] = [];
    const onSave = (payload: SetOverrideInput) => calls.push(payload);
    const progression = makeProgression();

    await renderSheet({
      visible: true,
      onClose: jest.fn(),
      exercise,
      unit: 'LB',
      repBucket: progression.repBucket,
      progression,
      onSave,
      onReset: jest.fn(),
      testID: 'override-sheet',
    });

    // No override yet — "Reset to suggestion" is disabled and no edited badge shows.
    expect(screen.queryByTestId('override-sheet-edited')).toBeNull();
    expect(screen.getByTestId('override-sheet-reset')).toBeDisabled();

    await user.press(screen.getByTestId('override-sheet-weight-inc'));
    await user.press(screen.getByTestId('override-sheet-reps-inc'));
    await user.press(screen.getByTestId('override-sheet-save'));

    expect(calls).toHaveLength(1);
    const payload = calls[0];
    if (!payload) throw new Error('onSave was not called with a payload');
    expect(payload.exerciseId).toBe('bench');
    expect(payload.repBucket).toBe('8-12');
    expect(payload.reps).toEqual([9, 9, 9]);
    // UX-GYM-28: the step is the exercise's real load step in kg (a 2.5 kg
    // plate pair), not +5 on an unrounded lb figure.
    expect(payload.weightKg).toBeCloseTo(102.5, 5);
  });

  it('shows the edited badge and an enabled reset when an override exists', async () => {
    const progression = makeProgression({
      override: { weightKg: 105, reps: [8, 8, 8], at: '2026-09-24' },
    });

    await renderSheet({
      visible: true,
      onClose: jest.fn(),
      exercise,
      unit: 'KG',
      repBucket: progression.repBucket,
      progression,
      onSave: jest.fn(),
      onReset: jest.fn(),
      testID: 'override-sheet',
    });

    expect(screen.getByTestId('override-sheet-edited')).toBeOnTheScreen();
    expect(screen.getByTestId('override-sheet-reset')).toBeEnabled();
  });

  it('calls onReset when "Reset to suggestion" is pressed', async () => {
    const user = userEvent.setup();
    const onReset = jest.fn();
    const progression = makeProgression({
      override: { weightKg: 105, reps: [8, 8, 8], at: '2026-09-24' },
    });

    await renderSheet({
      visible: true,
      onClose: jest.fn(),
      exercise,
      unit: 'KG',
      repBucket: progression.repBucket,
      progression,
      onSave: jest.fn(),
      onReset,
      testID: 'override-sheet',
    });

    await user.press(screen.getByTestId('override-sheet-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('UX-GYM-28: tapping the weight opens the keypad, so 40 → 150 kg is typed, not 44 taps', async () => {
    const user = userEvent.setup();
    const calls: SetOverrideInput[] = [];
    const progression = makeProgression();
    const base = progression.suggestion;
    const lowSuggestion = { ...base, weightKg: 40 };

    await renderSheet({
      visible: true,
      onClose: jest.fn(),
      exercise,
      unit: 'KG',
      repBucket: progression.repBucket,
      progression: { ...progression, suggestion: lowSuggestion },
      onSave: (payload) => calls.push(payload),
      onReset: jest.fn(),
      testID: 'override-sheet',
    });

    expect(screen.getByTestId('override-sheet-weight-value')).toHaveTextContent('40 kg');
    await user.press(screen.getByTestId('override-sheet-weight-value'));
    await user.press(screen.getByTestId('number-sheet-key-1'));
    await user.press(screen.getByTestId('number-sheet-key-5'));
    await user.press(screen.getByTestId('number-sheet-key-0'));
    await user.press(screen.getByTestId('number-sheet-save'));
    // 40 → 150 is more than 2x (UX-GYM-01): the keypad asks once before saving.
    await user.press(screen.getByTestId('number-sheet-jump-confirm'));
    expect(screen.getByTestId('override-sheet-weight-value')).toHaveTextContent('150 kg');

    await user.press(screen.getByTestId('override-sheet-save'));
    expect(calls[0]?.weightKg).toBeCloseTo(150, 5);
  });

  it('UX-GYM-28: lb users step through real loads (the logger’s step), not +5 on an unrounded lb figure', async () => {
    const user = userEvent.setup();
    const calls: SetOverrideInput[] = [];
    const progression = makeProgression();
    await renderSheet({
      visible: true,
      onClose: jest.fn(),
      exercise,
      unit: 'LB',
      repBucket: progression.repBucket,
      // 60 kg is 132.3 lb; the old sheet stepped it to 137.3 lb, a load nobody can put on the bar.
      progression: { ...progression, suggestion: { ...progression.suggestion, weightKg: 60 } },
      onSave: (payload) => calls.push(payload),
      onReset: jest.fn(),
      testID: 'override-sheet',
    });

    await user.press(screen.getByTestId('override-sheet-weight-inc'));
    await user.press(screen.getByTestId('override-sheet-save'));
    // One real step up (2.5 kg), the same step the live logger takes.
    expect(calls[0]?.weightKg).toBeCloseTo(62.5, 5);
    expect(screen.getByTestId('override-sheet-weight-value')).toHaveTextContent('137.8 lb');
  });
});

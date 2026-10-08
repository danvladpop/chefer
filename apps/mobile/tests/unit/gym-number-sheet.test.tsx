import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { GYM_MAX_WEIGHT_KG } from '@chefer/types';
import {
  keypadMax,
  needsJumpConfirm,
  NumberSheet,
  type NumberSheetProps,
} from '../../src/features/gym/workout/number-sheet';
import { makeExercise, profile } from './gym-fixtures';

// UX-GYM-01: the keypad stops at the schema bounds and asks before a value
// that jumps more than 2x the previous one is saved.

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

async function renderSheet(props: Partial<NumberSheetProps> = {}) {
  const onSubmit = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <NumberSheet
        visible
        onClose={jest.fn()}
        kind="weight"
        value={100}
        onSubmit={onSubmit}
        title="Bench Press · Weight"
        unit="KG"
        meta={null}
        profile={profile}
        showPlates={false}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return { onSubmit };
}

async function typeDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const digit of digits) {
    await user.press(screen.getByTestId(`number-sheet-key-${digit}`));
  }
}

// UX-GYM-19: per-dumbbell weights say "each" on the keypad too.
describe('per-hand exercises', () => {
  it('shows "kg each" beside the value and in the jump warning', async () => {
    const user = userEvent.setup();
    await renderSheet({
      value: 10,
      meta: { ...makeExercise('db-press', 'Dumbbell Press'), perHand: true },
    });
    expect(screen.getByTestId('number-sheet-value')).toHaveTextContent('10 kg each');
    await typeDigits(user, '30');
    await user.press(screen.getByTestId('number-sheet-save'));
    expect(screen.getByTestId('number-sheet-jump-warning')).toHaveTextContent('last 10 kg each', {
      exact: false,
    });
  });

  it('leaves a barbell exercise as plain "kg"', async () => {
    await renderSheet({ value: 10, meta: makeExercise('bench', 'Bench Press') });
    expect(screen.getByTestId('number-sheet-value')).toHaveTextContent('10 kg');
    expect(screen.getByTestId('number-sheet-value')).not.toHaveTextContent('each');
  });
});

describe('keypad clamp', () => {
  it('ignores a digit that would push the weight past the 1000 kg schema limit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSheet({ value: 500 });
    await typeDigits(user, '1025');
    expect(screen.getByTestId('number-sheet-value')).toHaveTextContent(/^102\s/);
    await user.press(screen.getByTestId('number-sheet-save'));
    expect(onSubmit).toHaveBeenCalledWith(102);
  });

  it('allows exactly the limit', async () => {
    const user = userEvent.setup();
    await renderSheet({ value: 500 });
    await typeDigits(user, '1000');
    expect(screen.getByTestId('number-sheet-value')).toHaveTextContent(/^1000\s/);
  });

  it('clamps in pounds against the same 1000 kg limit (2204.6 lb)', async () => {
    const user = userEvent.setup();
    await renderSheet({ unit: 'LB', value: 100 });
    await typeDigits(user, '2300');
    expect(screen.getByTestId('number-sheet-value')).toHaveTextContent(/^230\s/);
  });

  it('clamps reps at 3600', async () => {
    const user = userEvent.setup();
    await renderSheet({ kind: 'reps', value: 10 });
    await typeDigits(user, '3601');
    expect(screen.getByTestId('number-sheet-value')).toHaveTextContent(/^360\s/);
  });

  it('exposes the bounds the keypad uses', () => {
    expect(keypadMax('weight', 'KG')).toBe(GYM_MAX_WEIGHT_KG);
    expect(keypadMax('weight', 'LB')).toBeCloseTo(2204.6, 1);
    expect(keypadMax('reps', 'KG')).toBe(3600);
  });
});

describe('jump confirm', () => {
  it('asks before saving a weight more than 2x the previous one', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSheet({ value: 100 });
    await typeDigits(user, '250');
    await user.press(screen.getByTestId('number-sheet-save'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('number-sheet-jump-warning')).toHaveTextContent(
      /more than 2× the last 100 kg/,
    );
    await user.press(screen.getByTestId('number-sheet-jump-confirm'));
    expect(onSubmit).toHaveBeenCalledWith(250);
  });

  it('"Change it" goes back to the keypad without saving', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSheet({ value: 100 });
    await typeDigits(user, '250');
    await user.press(screen.getByTestId('number-sheet-save'));
    await user.press(screen.getByTestId('number-sheet-jump-change'));

    expect(screen.queryByTestId('number-sheet-jump-warning')).toBeNull();
    expect(screen.getByTestId('number-sheet-save')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves straight away for a normal change', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSheet({ value: 100 });
    await typeDigits(user, '150');
    await user.press(screen.getByTestId('number-sheet-save'));
    expect(onSubmit).toHaveBeenCalledWith(150);
  });

  it('does not nag when there is no previous value', async () => {
    const user = userEvent.setup();
    const { onSubmit } = await renderSheet({ value: 0 });
    await typeDigits(user, '80');
    await user.press(screen.getByTestId('number-sheet-save'));
    expect(onSubmit).toHaveBeenCalledWith(80);
  });

  it('decides per kind: reps only ask for a large result', () => {
    expect(needsJumpConfirm('weight', 100, 201)).toBe(true);
    expect(needsJumpConfirm('weight', 100, 200)).toBe(false);
    expect(needsJumpConfirm('reps', 8, 20)).toBe(false);
    expect(needsJumpConfirm('reps', 8, 80)).toBe(true);
    expect(needsJumpConfirm('weight', 0, 500)).toBe(false);
  });
});

describe('plate remainder', () => {
  it('shows what the plates cannot make, per side', async () => {
    const barbell = { ...profile, platePairsKg: [20, 10] };
    await renderSheet({ value: 50, profile: barbell, showPlates: true });
    expect(screen.getByTestId('plate-calculator-remainder')).toHaveTextContent(
      "5 kg per side can't be made with your plates.",
    );
  });
});

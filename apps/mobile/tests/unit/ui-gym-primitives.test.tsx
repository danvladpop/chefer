import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import {
  Badge,
  BarChart,
  Chip,
  ChipGroup,
  ConfirmSheet,
  EmptyState,
  LineChart,
  ProgressRing,
  SegmentedControl,
  Sheet,
  Stepper,
  STEPPER_REPEAT_DELAY_MS,
  STEPPER_REPEAT_INTERVAL_MS,
  Text,
  ValueStepper,
  WeekGrid,
} from '@chefer/ui-mobile';

// RNTL v14: render is async (concurrent React) — always await it.

type JsonElement = NonNullable<ReturnType<typeof screen.toJSON>>;

/** Host svg nodes of a kind (react-native-svg renders RNSVGCircle, RNSVGRect…). */
function hostNodes(kind: string): JsonElement[] {
  const found: JsonElement[] = [];
  const walk = (node: JsonElement | string) => {
    if (typeof node === 'string') return;
    if (node.type === `RNSVG${kind}`) found.push(node);
    node.children.forEach(walk);
  };
  const root = screen.toJSON();
  if (root) walk(root);
  return found;
}

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('SegmentedControl', () => {
  it('marks the selected segment and reports changes (not re-selections)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Alpha', testID: 'seg-a' },
          { value: 'b', label: 'Beta', testID: 'seg-b' },
        ]}
      />,
    );
    expect(screen.getByTestId('seg-a')).toBeSelected();
    expect(screen.getByTestId('seg-b')).not.toBeSelected();

    await user.press(screen.getByText('Beta'));
    await user.press(screen.getByText('Alpha'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

function ControlledStepper(props: { initial: number; min?: number; max?: number; step?: number }) {
  const [value, setValue] = useState(props.initial);
  return (
    <Stepper
      testID="weight"
      value={value}
      onChange={setValue}
      min={props.min}
      max={props.max}
      step={props.step}
      format={(v) => `${v} kg`}
    />
  );
}

describe('Stepper', () => {
  it('steps, clamps at the bounds and handles fractional steps cleanly', async () => {
    const user = userEvent.setup();
    await render(<ControlledStepper initial={60} step={2.5} min={57.5} max={62.5} />);

    await user.press(screen.getByTestId('weight-inc'));
    expect(screen.getByText('62.5 kg')).toBeOnTheScreen();
    expect(screen.getByTestId('weight-inc')).toBeDisabled();

    await user.press(screen.getByTestId('weight-dec'));
    await user.press(screen.getByTestId('weight-dec'));
    expect(screen.getByText('57.5 kg')).toBeOnTheScreen();
    expect(screen.getByTestId('weight-dec')).toBeDisabled();
  });

  it('repeats while held and stops on release', async () => {
    jest.useFakeTimers();
    try {
      await render(<ControlledStepper initial={10} />);
      const inc = screen.getByTestId('weight-inc');

      await fireEvent(inc, 'longPress');
      expect(screen.getByText('11 kg')).toBeOnTheScreen(); // immediate first step
      await act(() => jest.advanceTimersByTime(STEPPER_REPEAT_INTERVAL_MS * 3));
      expect(screen.getByText('14 kg')).toBeOnTheScreen();

      await fireEvent(inc, 'pressOut');
      await act(() => jest.advanceTimersByTime(STEPPER_REPEAT_INTERVAL_MS * 5));
      expect(screen.getByText('14 kg')).toBeOnTheScreen();
      expect(STEPPER_REPEAT_DELAY_MS).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Chip / ChipGroup', () => {
  it('Chip reports selection state and presses', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Chip testID="chip" label="Chest" selected onPress={onPress} />);
    expect(screen.getByTestId('chip')).toBeSelected();
    await user.press(screen.getByText('Chest'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  const options = [
    { value: 0, label: '0', testID: 'rir-0' },
    { value: 1, label: '1', testID: 'rir-1' },
    { value: 3, label: '3+', testID: 'rir-3' },
  ] as const;

  it('single choice replaces the selection', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<ChipGroup options={options} value={[1]} onChange={onChange} />);
    await user.press(screen.getByTestId('rir-3'));
    expect(onChange).toHaveBeenLastCalledWith([3]);
    await user.press(screen.getByTestId('rir-1')); // re-tap without allowEmpty: no-op
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('multiple toggles values in and out', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<ChipGroup multiple options={options} value={[0, 1]} onChange={onChange} />);
    await user.press(screen.getByTestId('rir-1'));
    expect(onChange).toHaveBeenLastCalledWith([0]);
    await user.press(screen.getByTestId('rir-3'));
    expect(onChange).toHaveBeenLastCalledWith([0, 1, 3]);
  });
});

describe('Sheet', () => {
  it('renders title and body when visible and closes from the close button', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible title="Plate calculator" testID="plates" onClose={onClose}>
          <Text>20 kg bar</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('plates-title')).toHaveTextContent('Plate calculator');
    expect(screen.getByText('20 kg bar')).toBeOnTheScreen();
    await user.press(screen.getByTestId('plates-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when hidden', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible={false} title="Hidden" testID="hidden" onClose={jest.fn()}>
          <Text>secret</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    expect(screen.queryByText('secret')).toBeNull();
  });
});

/** ValueStepper walking a custom ladder (like achievable plate loads). */
function LadderStepper({ initial }: { initial: number }) {
  const ladder = [20, 22.5, 25, 30];
  const [value, setValue] = useState(initial);
  return (
    <ValueStepper
      testID="load"
      name="Weight"
      value={value}
      next={(v, dir) => ladder[ladder.indexOf(v) + dir] ?? v}
      onChange={setValue}
      format={(v) => String(v)}
      caption="kg"
    />
  );
}

describe('ValueStepper', () => {
  it('walks the values `next` picks and stops at the ends', async () => {
    const user = userEvent.setup();
    await render(<LadderStepper initial={22.5} />);
    expect(screen.getByTestId('load-value')).toHaveTextContent(/^22\.5kg$/);

    await user.press(screen.getByTestId('load-inc'));
    await user.press(screen.getByTestId('load-inc'));
    await user.press(screen.getByTestId('load-inc')); // already at the top: no change
    expect(screen.getByTestId('load-value')).toHaveTextContent(/^30kg$/);

    await user.press(screen.getByTestId('load-dec'));
    expect(screen.getByTestId('load-value')).toHaveTextContent(/^25kg$/);
    expect(screen.getByTestId('load').props.accessibilityValue).toEqual({ text: '25 kg' });
  });

  it('repeats while held and taps the value when it is pressable', async () => {
    jest.useFakeTimers();
    try {
      const onPressValue = jest.fn();
      const onChange = jest.fn();
      await render(
        <ValueStepper
          testID="reps"
          name="Reps"
          value={5}
          next={(v, dir) => v + dir}
          onChange={onChange}
          format={String}
          caption="reps"
          onPressValue={onPressValue}
        />,
      );
      await fireEvent(screen.getByTestId('reps-inc'), 'longPress');
      await act(() => jest.advanceTimersByTime(STEPPER_REPEAT_INTERVAL_MS * 2));
      expect(onChange.mock.calls.map((c) => c[0])).toEqual([6, 7, 8]);
      await fireEvent(screen.getByTestId('reps-inc'), 'pressOut');

      await fireEvent.press(screen.getByTestId('reps-value'));
      expect(onPressValue).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ConfirmSheet', () => {
  it('confirms, cancels and shows its sentence', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ConfirmSheet
          visible
          testID="remove"
          title="Remove set 2?"
          body="Its values are gone for this workout."
          confirmLabel="Remove set"
          cancelLabel="Keep it"
          destructive
          onConfirm={onConfirm}
          onClose={onClose}
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('remove-title')).toHaveTextContent('Remove set 2?');
    expect(screen.getByTestId('remove-body')).toHaveTextContent(/values are gone/);
    await user.press(screen.getByTestId('remove-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.press(screen.getByTestId('remove-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when hidden', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ConfirmSheet
          visible={false}
          testID="hidden"
          title="Hidden"
          body="secret"
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={jest.fn()}
          onClose={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByText('secret')).toBeNull();
  });
});

describe('ProgressRing / Badge / EmptyState', () => {
  it('ProgressRing clamps and exposes its value', async () => {
    await render(
      <ProgressRing testID="ring" progress={1.4} accessibilityLabel="2 of 3 this week">
        <Text>2/3</Text>
      </ProgressRing>,
    );
    expect(screen.getByTestId('ring')).toHaveAccessibilityValue({ min: 0, max: 100, now: 100 });
    expect(screen.getByText('2/3')).toBeOnTheScreen();
    expect(hostNodes('Circle')).toHaveLength(2);
  });

  it('ProgressRing at 0 draws only the track', async () => {
    await render(<ProgressRing testID="ring" progress={0} />);
    expect(hostNodes('Circle')).toHaveLength(1);
  });

  it('Badge wraps text', async () => {
    await render(<Badge variant="success">PR</Badge>);
    expect(screen.getByText('PR')).toBeOnTheScreen();
  });

  it('EmptyState shows copy and fires its action', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <EmptyState
        testID="empty"
        title="Editing routines needs a connection."
        description="Logging works offline."
        action={{ label: 'Retry', onPress, testID: 'empty-retry' }}
      />,
    );
    expect(screen.getByText('Logging works offline.')).toBeOnTheScreen();
    await user.press(screen.getByTestId('empty-retry'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('charts', () => {
  it('LineChart draws a dot per point with highlighted PRs', async () => {
    await render(
      <LineChart
        testID="e1rm"
        width={320}
        data={[
          { x: 1, y: 80 },
          { x: 2, y: 82.5 },
          { x: 3, y: 85, highlight: true },
        ]}
        trend={[80, 82.5, 85]}
        secondary={{
          data: [
            { x: 1, y: 81 },
            { x: 3, y: 80 },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('e1rm')).toBeOnTheScreen();
    const dots = hostNodes('Circle');
    expect(dots).toHaveLength(3);
    expect(dots.filter((d) => Number(d.props.r) === 5.5)).toHaveLength(1);
  });

  it('LineChart shows the empty label without data', async () => {
    await render(<LineChart width={320} data={[]} emptyLabel="Log a session to see trends" />);
    expect(screen.getByText('Log a session to see trends')).toBeOnTheScreen();
  });

  it('BarChart stacks segments and shades the band', async () => {
    await render(
      <BarChart
        testID="sets"
        width={320}
        band={{ min: 10, max: 20 }}
        data={[
          {
            label: 'W1',
            segments: [
              { key: 'chest', value: 8 },
              { key: 'back', value: 6 },
            ],
          },
          {
            label: 'W2',
            segments: [
              { key: 'chest', value: 12 },
              { key: 'back', value: 0 },
            ],
          },
        ]}
      />,
    );
    // band + 3 non-zero segments
    expect(hostNodes('Rect')).toHaveLength(4);
  });

  it('WeekGrid renders a cell per week and reports presses', async () => {
    const user = userEvent.setup();
    const onPressWeek = jest.fn();
    const weeks = [
      { weekStart: '2026-09-01', status: 'met' as const },
      { weekStart: '2026-09-08', status: 'flex' as const },
      { weekStart: '2026-09-15', status: 'under' as const },
      { weekStart: '2026-09-22', status: 'current' as const },
    ];
    await render(
      <WeekGrid testID="grid" columns={2} weeks={weeks} onPressWeek={onPressWeek} showLegend />,
    );
    expect(screen.getByTestId('grid-cell-3')).toBeOnTheScreen();
    await user.press(screen.getByTestId('grid-cell-1'));
    expect(onPressWeek).toHaveBeenCalledWith(weeks[1]);
    expect(screen.getByText('Flex week')).toBeOnTheScreen();
  });
});

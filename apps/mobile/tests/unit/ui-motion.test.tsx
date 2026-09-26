import { useState } from 'react';
import { AccessibilityInfo, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import {
  Button,
  Chip,
  colors,
  CountUp,
  dashOffset,
  isOverTarget,
  mainFill,
  normaliseProgress,
  overflowFill,
  PressableScale,
  ProgressBar,
  progressColor,
  progressOf,
  ProgressRing,
  resolvePressScale,
  SegmentedControl,
  Sheet,
  Stepper,
  Text,
  useReducedMotion,
} from '@chefer/ui-mobile';

// Motion primitives (P2-1, docs/audit-2026-09/motion-system.md). Reanimated,
// worklets and expo-haptics run on the global mocks in tests/setup: animations
// finish instantly and their callbacks fire synchronously, so what is tested
// here is the LOGIC — who fires, when onClose runs, the over-target maths.

type ReducedMotionGlobal = typeof globalThis & { __REDUCED_MOTION__?: boolean };
const setReducedMotion = (on: boolean) => {
  (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = on;
};

const haptics = jest.requireMock<{
  selectionAsync: jest.Mock;
  impactAsync: jest.Mock;
  notificationAsync: jest.Mock;
}>('expo-haptics');

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

afterEach(() => {
  setReducedMotion(false);
  jest.clearAllMocks();
});

describe('progress maths (MO-06)', () => {
  it('turns value/target into a sanitised fraction', () => {
    expect(progressOf(1900, 2000)).toBeCloseTo(0.95);
    expect(progressOf(50, 0)).toBe(2); // 0 target counts as 1, capped at 200%
    expect(normaliseProgress(Number.NaN)).toBe(0);
    expect(normaliseProgress(-0.3)).toBe(0);
    expect(normaliseProgress(7)).toBe(2);
  });

  it('is over target only strictly past 100%', () => {
    expect(isOverTarget(progressOf(2728, 2728))).toBe(false);
    expect(isOverTarget(progressOf(2810, 2728))).toBe(true);
    expect(isOverTarget(progressOf(81, 62))).toBe(true); // the fat bar from the audit
  });

  it('splits progress into the first lap and the overflow', () => {
    expect(mainFill(0.4)).toBe(0.4);
    expect(overflowFill(0.4)).toBe(0);
    expect(mainFill(1.3)).toBe(1);
    expect(overflowFill(1.3)).toBeCloseTo(0.3);
  });

  it('computes stroke offsets and the over colour', () => {
    expect(dashOffset(100, 0)).toBe(100);
    expect(dashOffset(100, 0.25)).toBe(75);
    expect(dashOffset(100, 3)).toBe(0);
    expect(progressColor(0.9, 'brown', 'amber')).toBe('brown');
    expect(progressColor(1.1, 'brown', 'amber')).toBe('amber');
    expect(progressColor(1.1, 'brown')).toBe('brown'); // no over colour → unchanged
  });
});

describe('PressableScale (MO-01)', () => {
  it('resolves the press scales from the tokens', () => {
    expect(resolvePressScale()).toBe(0.97);
    expect(resolvePressScale('card')).toBe(0.98);
    expect(resolvePressScale(0.9)).toBe(0.9);
  });

  it('renders children and fires onPress / onPressIn / onPressOut', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await render(
      <PressableScale
        testID="tap"
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <RNText>Tap me</RNText>
      </PressableScale>,
    );
    expect(screen.getByText('Tap me')).toBeOnTheScreen();
    await user.press(screen.getByTestId('tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <PressableScale testID="tap" disabled onPress={onPress}>
        <RNText>Nope</RNText>
      </PressableScale>,
    );
    await user.press(screen.getByTestId('tap'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('still presses under reduced motion (only the scale is dropped)', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <PressableScale testID="tap" onPress={onPress}>
        <RNText>Calm</RNText>
      </PressableScale>,
    );
    await user.press(screen.getByTestId('tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('haptics on selection controls', () => {
  it('Chip ticks a selection haptic; Button does not', async () => {
    const user = userEvent.setup();
    await render(
      <>
        <Chip testID="chip" label="Vegan" onPress={jest.fn()} />
        <Button testID="btn" onPress={jest.fn()}>
          Save
        </Button>
      </>,
    );
    await user.press(screen.getByTestId('btn'));
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('chip'));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('Stepper ticks on a change but not when pinned at a bound', async () => {
    function Controlled() {
      const [value, setValue] = useState(1);
      return <Stepper testID="qty" value={value} onChange={setValue} min={0} max={2} />;
    }
    const user = userEvent.setup();
    await render(<Controlled />);
    await user.press(screen.getByTestId('qty-inc')); // 1 → 2
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
    await user.press(screen.getByTestId('qty-inc')); // at max: disabled, no change
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('SegmentedControl ticks only when the selection changes', async () => {
    const user = userEvent.setup();
    await render(
      <SegmentedControl
        value="a"
        onChange={jest.fn()}
        options={[
          { value: 'a', label: 'Food' },
          { value: 'b', label: 'Gym' },
        ]}
      />,
    );
    await user.press(screen.getByText('Food'));
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
    await user.press(screen.getByText('Gym'));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('a rejecting or missing haptics engine never throws', async () => {
    haptics.selectionAsync.mockImplementationOnce(() => Promise.reject(new Error('low power')));
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Chip testID="chip" label="Keto" onPress={onPress} />);
    await user.press(screen.getByTestId('chip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressRing / ProgressBar over target (MO-06)', () => {
  it('ring: amber fill plus an overflow lap past 100% when overColor is set', async () => {
    await render(<ProgressRing testID="ring" progress={2810 / 2728} overColor={colors.warning} />);
    expect(screen.getByTestId('ring-overflow')).toBeOnTheScreen();
    expect(screen.getByTestId('ring')).toHaveAccessibilityValue({ min: 0, max: 100, now: 100 });
  });

  it('ring: no overflow lap on target, or without an overColor (gym week ring)', async () => {
    await render(
      <>
        <ProgressRing testID="met" progress={1} overColor={colors.warning} />
        <ProgressRing testID="week" progress={1.4} />
      </>,
    );
    expect(screen.queryByTestId('met-overflow')).toBeNull();
    expect(screen.queryByTestId('week-overflow')).toBeNull();
  });

  it('bar: an end cap past 100%, none below', async () => {
    await render(
      <>
        <ProgressBar testID="fat" progress={81 / 62} overColor={colors.warning} />
        <ProgressBar testID="carbs" progress={0.5} overColor={colors.warning} />
      </>,
    );
    expect(screen.getByTestId('fat-cap')).toBeOnTheScreen();
    expect(screen.getByTestId('fat-fill')).toHaveStyle({ backgroundColor: colors.warning });
    expect(screen.queryByTestId('carbs-cap')).toBeNull();
    expect(screen.getByTestId('carbs-fill')).toHaveStyle({ backgroundColor: colors.primary });
  });
});

describe('CountUp', () => {
  it('counts up to the value over ~600 ms', async () => {
    jest.useFakeTimers();
    try {
      await render(<CountUp testID="kcal" value={1900} />);
      expect(screen.getByTestId('kcal')).toHaveTextContent('0');
      await act(() => jest.advanceTimersByTime(300));
      const midText = screen.getByTestId('kcal').props.children as string;
      const mid = Number(midText.replace(/,/g, ''));
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1900);
      await act(() => jest.advanceTimersByTime(400));
      expect(screen.getByTestId('kcal')).toHaveTextContent('1,900');
      // Screen readers only ever get the final value.
      expect(screen.getByTestId('kcal')).toHaveAccessibleName('1,900');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the final value immediately under reduced motion', async () => {
    setReducedMotion(true);
    await render(<CountUp testID="kcal" value={2810} />);
    expect(screen.getByTestId('kcal')).toHaveTextContent('2,810');
  });
});

describe('useReducedMotion', () => {
  it('starts from the launch value and follows reduceMotionChanged', async () => {
    const listeners: ((on: boolean) => void)[] = [];
    // RN's jest preset already mocks addEventListener; override one call only
    // so its default ({ remove }) survives for the rest of the file.
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementationOnce((_event, handler) => {
      listeners.push(handler as unknown as (on: boolean) => void);
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    await act(() => listeners.forEach((l) => l(true)));
    expect(result.current).toBe(true);
  });
});

describe('Sheet enter / exit (MO-02)', () => {
  function Harness({ onClose }: { onClose: jest.Mock }) {
    const [open, setOpen] = useState(true);
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet
          visible={open}
          title="Swap meal"
          testID="swap"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <Text>body</Text>
        </Sheet>
      </SafeAreaProvider>
    );
  }

  it('✕ plays the exit, then calls onClose once and unmounts', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(<Harness onClose={onClose} />);
    expect(screen.getByText('body')).toBeOnTheScreen();
    await user.press(screen.getByTestId('swap-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('body')).toBeNull();
  });

  it('the backdrop closes it too', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(<Harness onClose={onClose} />);
    await user.press(screen.getByLabelText('Close Swap meal'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('body')).toBeNull();
  });

  it('closes under reduced motion (crossfade path)', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(<Harness onClose={onClose} />);
    await user.press(screen.getByTestId('swap-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('body')).toBeNull();
  });

  it('a parent-driven close runs the exit and unmounts without calling onClose', async () => {
    const onClose = jest.fn();
    function ParentDriven() {
      const [open, setOpen] = useState(true);
      return (
        <SafeAreaProvider initialMetrics={metrics}>
          <RNText onPress={() => setOpen(false)}>hide</RNText>
          <Sheet visible={open} title="Timer" testID="t" onClose={onClose}>
            <Text>inside</Text>
          </Sheet>
        </SafeAreaProvider>
      );
    }
    const user = userEvent.setup();
    await render(<ParentDriven />);
    expect(screen.getByText('inside')).toBeOnTheScreen();
    await user.press(screen.getByText('hide'));
    expect(screen.queryByText('inside')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

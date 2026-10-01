import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { duration } from '@chefer/tokens';
import {
  resetSnackbarForTests,
  setSnackbarTabBarHeight,
  Snackbar,
  useSnackbar,
  type SnackbarOptions,
} from '@chefer/ui-mobile';

// PAT-4 (technical-plan.md §2.4): one at a time, announces for accessibility,
// pauses (doubles its duration) under a screen reader, reduced motion drops
// the rise. Reanimated timing/spring resolve synchronously under the global
// motion mocks (tests/setup/motion-mocks.js). RNTL v14: render/fireEvent are
// async (concurrent React) — always await them.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type ReducedMotionGlobal = typeof globalThis & { __REDUCED_MOTION__?: boolean };
const setReducedMotion = (on: boolean) => {
  (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = on;
};

function Harness({ a, b }: { a: SnackbarOptions; b?: SnackbarOptions }) {
  const { show } = useSnackbar();
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <Pressable testID="show-a" onPress={() => show(a)} />
      {b ? <Pressable testID="show-b" onPress={() => show(b)} /> : null}
      <Snackbar />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  resetSnackbarForTests();
  setReducedMotion(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  resetSnackbarForTests();
});

describe('Snackbar (PAT-4)', () => {
  it('renders nothing until shown, then shows the message and announces it', async () => {
    await render(<Harness a={{ message: 'List shared' }} />);
    expect(screen.queryByTestId('snackbar')).toBeNull();

    await fireEvent.press(screen.getByTestId('show-a'));
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('List shared');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('List shared');
  });

  it('announces the action label too, and fires haptics.success only for a success tone', async () => {
    await render(
      <Harness a={{ message: 'Routine saved', actionLabel: 'Undo', tone: 'success' }} />,
    );
    await fireEvent.press(screen.getByTestId('show-a'));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Routine saved, Undo');

    const haptics = jest.requireMock<{ notificationAsync: jest.Mock }>('expo-haptics');
    expect(haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('shows one at a time — a new snackbar replaces the old', async () => {
    await render(
      <Harness
        a={{ message: 'Routine saved' }}
        b={{ message: 'Meal logged', actionLabel: 'View' }}
      />,
    );
    await fireEvent.press(screen.getByTestId('show-a'));
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('Routine saved');

    await fireEvent.press(screen.getByTestId('show-b'));
    expect(screen.getAllByTestId('snackbar-message')).toHaveLength(1);
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('Meal logged');
    expect(screen.getByTestId('snackbar-action')).toHaveTextContent('View');
  });

  it('the action button fires onAction and dismisses the bar', async () => {
    jest.useFakeTimers();
    const onAction = jest.fn();
    await render(
      <Harness a={{ message: 'Regenerated 28 Sep – 4 Oct', actionLabel: 'Undo', onAction }} />,
    );

    await fireEvent.press(screen.getByTestId('show-a'));
    await fireEvent.press(screen.getByTestId('snackbar-action'));
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(() => {
      jest.advanceTimersByTime(duration.fast);
    });
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('auto-dismisses after the default duration (6 s; 8 s with an action)', async () => {
    jest.useFakeTimers();
    await render(
      <Harness
        a={{ message: 'Workout saved' }}
        b={{ message: 'Meal logged', actionLabel: 'View' }}
      />,
    );

    await fireEvent.press(screen.getByTestId('show-a'));
    await act(() => {
      jest.advanceTimersByTime(5999);
    });
    expect(screen.getByTestId('snackbar')).toBeTruthy();
    await act(() => {
      jest.advanceTimersByTime(1 + duration.fast);
    });
    expect(screen.queryByTestId('snackbar')).toBeNull();

    await fireEvent.press(screen.getByTestId('show-b'));
    await act(() => {
      jest.advanceTimersByTime(7999);
    });
    expect(screen.getByTestId('snackbar')).toBeTruthy(); // still up — has an action, 8 s
    await act(() => {
      jest.advanceTimersByTime(1 + duration.fast);
    });
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('pauses (doubles its duration) while a screen reader is running', async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await render(<Harness a={{ message: 'Safety report sent' }} />);

    await fireEvent.press(screen.getByTestId('show-a'));
    await act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(screen.getByTestId('snackbar')).toBeTruthy(); // a screen reader is running: not yet

    await act(() => {
      jest.advanceTimersByTime(6000 + duration.fast);
    });
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('reduced motion: the bar still shows (no rise, fade only) — no crash', async () => {
    setReducedMotion(true);
    await render(<Harness a={{ message: 'List shared' }} />);
    await fireEvent.press(screen.getByTestId('show-a'));
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('List shared');
  });
});

describe('Snackbar above the tab bar (App Review R-11)', () => {
  function wrapperBottom(): number | undefined {
    const wrapper = screen.getByTestId('snackbar').parent;
    return (StyleSheet.flatten(wrapper?.props.style as never) as { bottom?: number }).bottom;
  }

  it('sits above a published tab bar height instead of covering it', async () => {
    await render(<Harness a={{ message: 'Swapped', actionLabel: 'Undo' }} />);
    await fireEvent.press(screen.getByTestId('show-a'));
    // No tab bar published: safe-area inset (34) + 8.
    expect(wrapperBottom()).toBe(42);

    await act(() => {
      setSnackbarTabBarHeight('food', 83); // 49 bar + 34 inset
    });
    expect(wrapperBottom()).toBe(91);
  });

  it('falls back when the tab bar unmounts, and the latest registered bar wins', async () => {
    await render(<Harness a={{ message: 'Swapped' }} />);
    await fireEvent.press(screen.getByTestId('show-a'));

    await act(() => {
      setSnackbarTabBarHeight('food', 83);
      setSnackbarTabBarHeight('gym', 90);
    });
    expect(wrapperBottom()).toBe(98);

    await act(() => {
      setSnackbarTabBarHeight('food', null);
    });
    expect(wrapperBottom()).toBe(98);

    await act(() => {
      setSnackbarTabBarHeight('gym', null);
    });
    expect(wrapperBottom()).toBe(42);
  });

  it('lets touches outside the toast through (box-none wrapper)', async () => {
    await render(<Harness a={{ message: 'Swapped' }} />);
    await fireEvent.press(screen.getByTestId('show-a'));
    expect(screen.getByTestId('snackbar').parent?.props.pointerEvents).toBe('box-none');
  });
});

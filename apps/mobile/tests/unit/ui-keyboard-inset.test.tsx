import { Keyboard, Platform, Text as RNText, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen } from '@testing-library/react-native';
import { Sheet, useKeyboardInset } from '@chefer/ui-mobile';

// WP-01 (UX-X-02, UX-FOOD-07): one keyboard primitive. useKeyboardInset turns
// RN core's keyboard events + the bottom safe-area into a bottom padding.
// iOS listens to keyboardWill*, Android to keyboardDid* (no Will* events there).
// RNTL v14: render / act are async — always await them.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type Listener = (event: { endCoordinates: { height: number } }) => void;

/** Captures the callbacks registered through Keyboard.addListener, keyed by event name. */
function spyOnKeyboard() {
  const listeners = new Map<string, Listener>();
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName: string, cb: unknown) => {
    listeners.set(eventName, cb as Listener);
    return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  const emit = (eventName: string, height = 0) =>
    act(() => {
      listeners.get(eventName)?.({ endCoordinates: { height } });
    });
  return { listeners, remove, emit };
}

function Probe({ enabled }: { enabled?: boolean }) {
  const { inset, keyboardHeight, isVisible } = useKeyboardInset(
    enabled === undefined ? undefined : { enabled },
  );
  return (
    <View testID="probe" accessibilityValue={{ text: `${inset}|${keyboardHeight}|${isVisible}` }} />
  );
}

const readProbe = () =>
  (screen.getByTestId('probe').props as { accessibilityValue: { text: string } }).accessibilityValue
    .text;

const renderProbe = (enabled?: boolean) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Probe enabled={enabled} />
    </SafeAreaProvider>,
  );

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useKeyboardInset', () => {
  it('iOS: follows keyboardWillShow/Hide; the inset is the keyboard height minus the bottom safe area', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { listeners, emit } = spyOnKeyboard();
    await renderProbe();

    expect([...listeners.keys()].sort()).toEqual(['keyboardWillHide', 'keyboardWillShow']);
    expect(readProbe()).toBe('0|0|false');

    await emit('keyboardWillShow', 336);
    expect(readProbe()).toBe('302|336|true'); // 336 - 34

    await emit('keyboardWillHide');
    expect(readProbe()).toBe('0|0|false');
  });

  it('Android: follows keyboardDidShow/Hide instead', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { listeners, emit } = spyOnKeyboard();
    await renderProbe();

    expect([...listeners.keys()].sort()).toEqual(['keyboardDidHide', 'keyboardDidShow']);
    await emit('keyboardDidShow', 800);
    expect(readProbe()).toBe('766|800|true');
    await emit('keyboardDidHide');
    expect(readProbe()).toBe('0|0|false');
  });

  it('never goes negative when the keyboard is shorter than the safe area', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { emit } = spyOnKeyboard();
    await renderProbe();
    await emit('keyboardDidShow', 20);
    expect(readProbe()).toBe('0|20|true');
  });

  it('starts from the current keyboard when mounted while it is already open', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    spyOnKeyboard();
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({
      screenX: 0,
      screenY: 508,
      width: 390,
      height: 336,
    });
    await renderProbe();
    expect(readProbe()).toBe('302|336|true');
  });

  it('subscribes only while enabled, and unsubscribes on unmount', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { listeners, remove } = spyOnKeyboard();
    const off = await renderProbe(false);
    expect(listeners.size).toBe(0);
    expect(readProbe()).toBe('0|0|false');
    await off.unmount();

    const on = await renderProbe(true);
    expect(listeners.size).toBe(2);
    await on.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

/** The paddingBottom in the (possibly nested) style of the element with this testID. */
function paddingBottomOf(testID: string): number | undefined {
  const style = screen.getByTestId(testID).props.style as unknown;
  const flat = ([] as unknown[]).concat(style).flat(Infinity).filter(Boolean) as {
    paddingBottom?: number;
  }[];
  return flat.find((s) => typeof s.paddingBottom === 'number')?.paddingBottom;
}

describe('Sheet applies a single keyboard compensation (UX-X-02)', () => {
  const renderSheet = () =>
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible onClose={jest.fn()} title="Log something" testID="sheet">
          <RNText>Body</RNText>
        </Sheet>
      </SafeAreaProvider>,
    );

  it.each([
    ['ios', 'keyboardWillShow', 'keyboardWillHide'],
    ['android', 'keyboardDidShow', 'keyboardDidHide'],
  ] as const)(
    '%s: only the wrapper padding moves; no KeyboardAvoidingView, no automatic ScrollView inset',
    async (os, show, hide) => {
      jest.replaceProperty(Platform, 'OS', os);
      const { emit } = spyOnKeyboard();
      await renderSheet();

      expect(paddingBottomOf('sheet-keyboard-inset')).toBe(0);
      await emit(show, 336);
      expect(paddingBottomOf('sheet-keyboard-inset')).toBe(302);
      await emit(hide);
      expect(paddingBottomOf('sheet-keyboard-inset')).toBe(0);

      // The mechanism count: exactly one (the padding above). A
      // KeyboardAvoidingView would put an onLayout on the wrapper; the body
      // ScrollView must not add its own automatic inset on top.
      expect(screen.getByTestId('sheet-keyboard-inset').props.onLayout).toBeUndefined();
      expect(screen.getByTestId('sheet-scroll').props.automaticallyAdjustKeyboardInsets).not.toBe(
        true,
      );
    },
  );

  it('a closed Sheet does not listen for the keyboard', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { listeners } = spyOnKeyboard();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible={false} onClose={jest.fn()} title="Closed" testID="sheet">
          <RNText>Body</RNText>
        </Sheet>
      </SafeAreaProvider>,
    );
    expect(listeners.size).toBe(0);
  });
});

import { Keyboard, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen } from '@testing-library/react-native';
import ChatScreen from '../../app/chat';

// UX-FOOD-07: on Android the AI Chef composer sat under the keyboard
// (KeyboardAvoidingView "height" does nothing under edge-to-edge). The
// composer column now takes useKeyboardInset() as its bottom padding.
// RNTL v14: render / act are async — always await them.

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => true }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => Promise.resolve('token') }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type Listener = (event: { endCoordinates: { height: number } }) => void;

function spyOnKeyboard() {
  const listeners = new Map<string, Listener>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName: string, cb: unknown) => {
    listeners.set(eventName, cb as Listener);
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  return (eventName: string, height = 0) =>
    act(() => {
      listeners.get(eventName)?.({ endCoordinates: { height } });
    });
}

const paddingBottom = () => {
  const style = screen.getByTestId('chat-keyboard-inset').props.style as unknown;
  const flat = ([] as unknown[]).concat(style).flat(Infinity).filter(Boolean) as {
    paddingBottom?: number;
  }[];
  return flat.find((s) => typeof s.paddingBottom === 'number')?.paddingBottom;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AI Chef composer vs the keyboard (UX-FOOD-07)', () => {
  it.each([
    ['android', 'keyboardDidShow', 'keyboardDidHide'],
    ['ios', 'keyboardWillShow', 'keyboardWillHide'],
  ] as const)('%s: the composer column is padded by the keyboard inset', async (os, show, hide) => {
    jest.replaceProperty(Platform, 'OS', os);
    const emit = spyOnKeyboard();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ChatScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('chat-input')).toBeOnTheScreen();
    expect(paddingBottom()).toBe(0);

    await emit(show, 800);
    expect(paddingBottom()).toBe(766); // keyboard 800 - safe-area bottom 34 (Screen pads that)

    await emit(hide);
    expect(paddingBottom()).toBe(0);
  });
});

import { useRef } from 'react';
import { Keyboard, Platform, Text as RNText } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import {
  KeyboardAwareScrollView,
  useScrollFieldIntoView,
  type ScrollFieldIntoView,
} from '@chefer/ui-mobile';

// Gym dogfood #2: the number keyboard was covering the field being typed
// into (and the primary button below it). These cover the two behaviors
// `KeyboardAwareScrollView` adds over a plain `ScrollView` — extra bottom
// padding while the keyboard is open, and the scroll-into-view plumbing it
// hands descendants via `useScrollFieldIntoView` — without needing a device
// or a real keyboard.

// RNTL v14: render is async (concurrent React) — always await it.

type KeyboardListener = () => void;

/** Captures the callbacks `KeyboardAwareScrollView` registers, keyed by event name. */
function spyOnKeyboardListeners() {
  const listeners = new Map<string, KeyboardListener>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName: string, cb: unknown) => {
    listeners.set(eventName, cb as KeyboardListener);
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  return listeners;
}

function readPaddingBottom(testID: string): number | undefined {
  const style = screen.getByTestId(testID).props.contentContainerStyle as unknown;
  const flat = ([] as unknown[]).concat(style).filter(Boolean) as { paddingBottom?: number }[];
  return flat.find((s) => typeof s.paddingBottom === 'number')?.paddingBottom;
}

describe('KeyboardAwareScrollView', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('pads the scroll content once the keyboard opens, and un-pads it once it closes', async () => {
    const listeners = spyOnKeyboardListeners();
    await render(
      <KeyboardAwareScrollView testID="kb-scroll" extraKeyboardPadding={40}>
        <RNText>Weight</RNText>
      </KeyboardAwareScrollView>,
    );

    expect(readPaddingBottom('kb-scroll')).toBeUndefined();

    await waitFor(() => expect(listeners.get('keyboardWillShow')).toBeDefined());
    await act(() => {
      listeners.get('keyboardWillShow')?.();
    });
    expect(readPaddingBottom('kb-scroll')).toBe(40);

    await act(() => {
      listeners.get('keyboardWillHide')?.();
    });
    expect(readPaddingBottom('kb-scroll')).toBeUndefined();
  });

  it('renders the footer below the scroll content, inside the same KeyboardAvoidingView', async () => {
    await render(
      <KeyboardAwareScrollView footer={<RNText>Save</RNText>}>
        <RNText>Routine name</RNText>
      </KeyboardAwareScrollView>,
    );
    expect(screen.getByText('Routine name')).toBeOnTheScreen();
    expect(screen.getByText('Save')).toBeOnTheScreen();
  });

  it('turns automaticallyAdjustKeyboardInsets on for iOS and off for Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(
      <KeyboardAwareScrollView testID="kb-scroll-ios">
        <RNText>Field</RNText>
      </KeyboardAwareScrollView>,
    );
    expect(screen.getByTestId('kb-scroll-ios').props.automaticallyAdjustKeyboardInsets).toBe(true);

    jest.replaceProperty(Platform, 'OS', 'android');
    await render(
      <KeyboardAwareScrollView testID="kb-scroll-android">
        <RNText>Field</RNText>
      </KeyboardAwareScrollView>,
    );
    expect(
      screen.getByTestId('kb-scroll-android').props.automaticallyAdjustKeyboardInsets,
    ).toBeFalsy();
  });
});

type MeasurableFieldMock = { measureLayout: jest.Mock };

function ScrollFieldProbe({
  onReady,
}: {
  onReady: (scrollFieldIntoView: ScrollFieldIntoView, field: MeasurableFieldMock) => void;
}) {
  const scrollFieldIntoView = useScrollFieldIntoView();
  const field = useRef<MeasurableFieldMock>({ measureLayout: jest.fn() }).current;
  // Captured synchronously during render — a passive effect isn't guaranteed
  // to have flushed by the time `await render(...)` returns, and this probe
  // has no other reason to exist.
  onReady(scrollFieldIntoView, field);
  return null;
}

describe('useScrollFieldIntoView', () => {
  it('is a harmless no-op outside a KeyboardAwareScrollView', async () => {
    let scrollFieldIntoView: ScrollFieldIntoView | undefined;
    await render(
      <ScrollFieldProbe
        onReady={(fn) => {
          scrollFieldIntoView = fn;
        }}
      />,
    );
    expect(() => scrollFieldIntoView?.({ measureLayout: jest.fn() })).not.toThrow();
  });

  it('measures the focused field against the scroll view when called inside one', async () => {
    let scrollFieldIntoView: ScrollFieldIntoView | undefined;
    let field: MeasurableFieldMock | undefined;
    await render(
      <KeyboardAwareScrollView>
        <ScrollFieldProbe
          onReady={(fn, f) => {
            scrollFieldIntoView = fn;
            field = f;
          }}
        />
      </KeyboardAwareScrollView>,
    );

    if (!field) throw new Error('probe never reported back');
    const resolvedField = field;
    resolvedField.measureLayout.mockImplementation(
      (_relativeTo: unknown, onSuccess: (x: number, y: number) => void) => onSuccess(0, 300),
    );

    expect(() => scrollFieldIntoView?.(resolvedField, 40)).not.toThrow();
    expect(resolvedField.measureLayout).toHaveBeenCalledTimes(1);
  });
});

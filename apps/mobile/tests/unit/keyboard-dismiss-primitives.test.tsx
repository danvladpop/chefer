import { Keyboard, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  Button,
  DONE_FIELD_PROPS,
  EMAIL_FIELD_PROPS,
  Input,
  KeyboardAwareScrollView,
  PasswordInput,
  Sheet,
} from '@chefer/ui-mobile';

// Tester feedback 2026-10-04: "keyboards are not closing automatically after
// finishing entering inputs". The fix lives in the shared primitives so every
// screen gets it; these pin the contract each primitive now offers.
// RNTL v14: render is async — always await it.

const SAFE_AREA = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

let dismiss: jest.SpyInstance;
beforeEach(() => {
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Input — return key', () => {
  it('a single-line field reads "Done" and blurs on submit, so Return closes the keyboard', async () => {
    await render(<Input testID="f" label="Name" />);
    const field = screen.getByTestId('f');
    expect(field.props.returnKeyType).toBe('done');
    expect(field.props.submitBehavior).toBe('blurAndSubmit');
  });

  it('a "next" field keeps the keyboard up while focus moves on', async () => {
    await render(<Input testID="f" label="Name" returnKeyType="next" />);
    expect(screen.getByTestId('f').props.submitBehavior).toBe('submit');
  });

  it('explicit return key / submit behaviour win over the defaults', async () => {
    await render(<Input testID="f" label="Go" returnKeyType="go" submitBehavior="submit" />);
    const field = screen.getByTestId('f');
    expect(field.props.returnKeyType).toBe('go');
    expect(field.props.submitBehavior).toBe('submit');
  });

  it('a multiline field keeps Return as a newline (no done / blur-on-submit default)', async () => {
    await render(<Input testID="f" label="Notes" multiline />);
    const field = screen.getByTestId('f');
    expect(field.props.returnKeyType).toBeUndefined();
    expect(field.props.submitBehavior).toBeUndefined();
  });

  it('DONE_FIELD_PROPS: Return reads Done and dismisses the keyboard', async () => {
    await render(<Input testID="f" label="Name" {...DONE_FIELD_PROPS} />);
    const field = screen.getByTestId('f');
    expect(field.props.returnKeyType).toBe('done');
    await fireEvent(field, 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Input — iOS "Done" accessory for keyboards with no Return key', () => {
  it.each(['number-pad', 'decimal-pad', 'phone-pad'] as const)(
    'a %s field gets a Done bar that closes the keyboard',
    async (keyboardType) => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await render(<Input testID="f" label="Amount" keyboardType={keyboardType} />);
      const field = screen.getByTestId('f');
      const barId = field.props.inputAccessoryViewID as string;
      expect(barId).toMatch(/^chefer-done-/);
      expect(screen.getByText('Done')).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId('f-done'));
      expect(dismiss).toHaveBeenCalledTimes(1);
    },
  );

  it('a multiline field gets one too (Return is a newline there)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<Input testID="f" label="Notes" multiline />);
    expect(screen.getByTestId('f').props.inputAccessoryViewID).toMatch(/^chefer-done-/);
    await fireEvent.press(screen.getByTestId('f-done'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('a plain text field gets none', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<Input testID="f" label="Name" />);
    expect(screen.getByTestId('f').props.inputAccessoryViewID).toBeUndefined();
    expect(screen.queryByTestId('f-done')).not.toBeOnTheScreen();
  });

  it("keeps the caller's own accessory (a Next/Done NumericReturnBar chain) instead of adding another", async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(
      <Input testID="f" label="Amount" keyboardType="decimal-pad" inputAccessoryViewID="mine" />,
    );
    expect(screen.getByTestId('f').props.inputAccessoryViewID).toBe('mine');
    expect(screen.queryByTestId('f-done')).not.toBeOnTheScreen();
  });

  it('showDoneBar={false} opts out for a screen that pins its own Done control', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<Input testID="f" label="Notes" multiline showDoneBar={false} />);
    expect(screen.getByTestId('f').props.inputAccessoryViewID).toBeUndefined();
    expect(screen.queryByTestId('f-done')).not.toBeOnTheScreen();
  });

  it('Android has no accessory: its IME shows a ✓ that fires onSubmitEditing', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const onSubmit = jest.fn();
    await render(
      <Input testID="f" label="Amount" keyboardType="decimal-pad" onSubmitEditing={onSubmit} />,
    );
    const field = screen.getByTestId('f');
    expect(field.props.inputAccessoryViewID).toBeUndefined();
    expect(screen.queryByTestId('f-done')).not.toBeOnTheScreen();
    expect(field.props.returnKeyType).toBe('done');
    await fireEvent(field, 'submitEditing');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('PasswordInput / email fields are treated like the credentials they are', () => {
  it('defaults to a saved-password field: secure, no autocapitalise/correct, current-password', async () => {
    await render(<PasswordInput testID="pw" label="Password" />);
    const field = screen.getByTestId('pw');
    expect(field.props.secureTextEntry).toBe(true);
    expect(field.props.autoCapitalize).toBe('none');
    expect(field.props.autoCorrect).toBe(false);
    expect(field.props.spellCheck).toBe(false);
    expect(field.props.textContentType).toBe('password');
    expect(field.props.autoComplete).toBe('current-password');
  });

  it('a "choose a password" field overrides it with new-password', async () => {
    await render(
      <PasswordInput
        testID="pw"
        label="New password"
        textContentType="newPassword"
        autoComplete="new-password"
      />,
    );
    const field = screen.getByTestId('pw');
    expect(field.props.textContentType).toBe('newPassword');
    expect(field.props.autoComplete).toBe('new-password');
    expect(field.props.secureTextEntry).toBe(true);
  });

  it('Show reveals the text but the field stays a password field', async () => {
    await render(<PasswordInput testID="pw" label="Password" />);
    await fireEvent.press(screen.getByTestId('pw-toggle'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('pw').props.textContentType).toBe('password');
  });

  it('EMAIL_FIELD_PROPS: email keyboard, autofill hints, no autocapitalise/correct', async () => {
    await render(<Input testID="em" label="Email" {...EMAIL_FIELD_PROPS} />);
    const field = screen.getByTestId('em');
    expect(field.props.keyboardType).toBe('email-address');
    expect(field.props.autoComplete).toBe('email');
    expect(field.props.textContentType).toBe('emailAddress');
    expect(field.props.autoCapitalize).toBe('none');
    expect(field.props.autoCorrect).toBe(false);
  });
});

describe('Button — the form submit closes the keyboard', () => {
  it('a primary (default / destructive) button dismisses, then runs onPress', async () => {
    const order: string[] = [];
    dismiss.mockImplementation(() => void order.push('dismiss'));
    const onPress = jest.fn(() => void order.push('press'));
    await render(
      <View>
        <Button testID="save" onPress={onPress}>
          Save
        </Button>
        <Button testID="del" variant="destructive" onPress={onPress}>
          Delete
        </Button>
      </View>,
    );
    await fireEvent.press(screen.getByTestId('save'));
    await fireEvent.press(screen.getByTestId('del'));
    expect(order).toEqual(['dismiss', 'press', 'dismiss', 'press']);
  });

  it('secondary / outline / ghost buttons (e.g. "+ add another") leave the keyboard alone', async () => {
    const onPress = jest.fn();
    await render(
      <View>
        <Button testID="a" variant="outline" onPress={onPress}>
          Add
        </Button>
        <Button testID="b" variant="secondary" onPress={onPress}>
          Add
        </Button>
        <Button testID="c" variant="ghost" onPress={onPress}>
          Add
        </Button>
      </View>,
    );
    for (const id of ['a', 'b', 'c']) await fireEvent.press(screen.getByTestId(id));
    expect(onPress).toHaveBeenCalledTimes(3);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('dismissKeyboard overrides the variant default', async () => {
    await render(
      <View>
        <Button testID="keep" dismissKeyboard={false} onPress={jest.fn()}>
          Keep
        </Button>
        <Button testID="close" variant="outline" dismissKeyboard onPress={jest.fn()}>
          Close
        </Button>
      </View>,
    );
    await fireEvent.press(screen.getByTestId('keep'));
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('close'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('scrolling forms close the keyboard on drag, and let buttons keep their first tap', () => {
  it.each([
    ['ios', 'interactive'],
    ['android', 'on-drag'],
  ] as const)('KeyboardAwareScrollView on %s: %s', async (os, mode) => {
    jest.replaceProperty(Platform, 'OS', os);
    await render(
      <KeyboardAwareScrollView testID="scroll">
        <Input label="x" />
      </KeyboardAwareScrollView>,
    );
    const props = screen.getByTestId('scroll').props;
    expect(props.keyboardDismissMode).toBe(mode);
    expect(props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('Sheet body: drag dismisses, taps persist', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <Sheet visible onClose={jest.fn()} title="T" testID="sh">
          <Input label="x" />
        </Sheet>
      </SafeAreaProvider>,
    );
    const props = screen.getByTestId('sh-scroll').props;
    expect(props.keyboardDismissMode).toBe('interactive');
    expect(props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('Sheet — leaving or dragging it away closes the keyboard', () => {
  it('✕ closes the keyboard along with the sheet', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <Sheet visible onClose={jest.fn()} title="T" testID="sh">
          <Input label="x" />
        </Sheet>
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByTestId('sh-close'));
    expect(dismiss).toHaveBeenCalled();
  });

  it('starting to drag the sheet down puts the keyboard away', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <Sheet visible onClose={jest.fn()} title="T" testID="sh">
          <Input label="x" />
        </Sheet>
      </SafeAreaProvider>,
    );
    const handle = screen.getByTestId('sh-drag-handle');
    const touch = {
      touchActive: true,
      currentPageX: 1,
      currentPageY: 1,
      previousPageX: 1,
      previousPageY: 1,
      currentTimeStamp: 1,
      previousTimeStamp: 1,
      startPageX: 1,
      startPageY: 1,
      startTimeStamp: 1,
    };
    // PanResponder's grant handler reads the touch history — give it a real one.
    // (RNTL's fireEvent skips responder handlers on a non-pressable host, so call it directly.)
    const grant = handle.props.onResponderGrant as (event: unknown) => void;
    grant({
      touchHistory: {
        touchBank: [touch],
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: 1,
      },
      nativeEvent: {},
    });
    expect(dismiss).toHaveBeenCalled();
  });

  it('a non-scrolling sheet body closes the keyboard when its empty space is tapped', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <Sheet visible onClose={jest.fn()} title="T" testID="sh" scrollable={false}>
          <View testID="body-space" />
        </Sheet>
      </SafeAreaProvider>,
    );
    // The body wrapper is the touchable ancestor of the content.
    await fireEvent.press(screen.getByTestId('body-space'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

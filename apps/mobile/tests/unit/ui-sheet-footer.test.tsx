import { Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { KeyboardAwareScrollView, Sheet } from '@chefer/ui-mobile';

// App Review R-03: with the keyboard up, the first tap on a footer button
// (outside the body ScrollView) only dismissed the keyboard — "Delete my
// account" needed two taps. Every Sheet footer (and KeyboardAwareScrollView
// footer) now lives in a non-scrolling ScrollView with
// keyboardShouldPersistTaps="handled", so a press reaches the button while
// the keyboard is open. RNTL v14: render/fireEvent are async.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('Sheet footer keyboard handling (R-03)', () => {
  it('wraps the footer in a keyboardShouldPersistTaps="handled" scroll view', async () => {
    const onPress = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet
          visible
          onClose={jest.fn()}
          title="Confirm"
          testID="sheet"
          footer={
            <RNText testID="footer-action" onPress={onPress}>
              Go
            </RNText>
          }
        >
          <RNText>Body</RNText>
        </Sheet>
      </SafeAreaProvider>,
    );

    const footer = screen.getByTestId('sheet-footer');
    expect(footer.props.keyboardShouldPersistTaps).toBe('handled');
    expect(footer.props.scrollEnabled).toBe(false);

    await fireEvent.press(screen.getByTestId('footer-action'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders no footer wrapper when there is no footer', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible onClose={jest.fn()} title="Plain" testID="sheet">
          <RNText>Body</RNText>
        </Sheet>
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('sheet-footer')).toBeNull();
  });

  it('gives KeyboardAwareScrollView footers the same treatment', async () => {
    await render(
      <KeyboardAwareScrollView footer={<RNText testID="kb-footer-action">Save</RNText>}>
        <RNText>Field</RNText>
      </KeyboardAwareScrollView>,
    );
    const parent = screen.getByTestId('kb-footer-action').parent;
    // Walk up to the footer's ScrollView host and check the prop on it.
    let node: typeof parent = parent;
    let found = false;
    while (node) {
      if (
        node.props.keyboardShouldPersistTaps === 'handled' &&
        node.props.scrollEnabled === false
      ) {
        found = true;
        break;
      }
      node = node.parent;
    }
    expect(found).toBe(true);
  });
});

import { Platform, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NumericReturnBar } from '@chefer/ui-mobile';

// Gym dogfood #2: `number-pad` / `decimal-pad` have no Return key at all on
// iOS, unlike Android (whose IME renders one). NumericReturnBar is the
// iOS-only substitute bar; these confirm it shows up where it's needed and
// stays out of the way where it isn't.

// RNTL v14: render is async (concurrent React) — always await it.

describe('NumericReturnBar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders its label on iOS and fires onPress', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const onPress = jest.fn();
    await render(
      <View>
        <NumericReturnBar nativeID="acc" label="Next" onPress={onPress} testID="acc-btn" />
      </View>,
    );
    expect(screen.getByText('Next')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('acc-btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await render(
      <View>
        <NumericReturnBar nativeID="acc" label="Done" onPress={jest.fn()} testID="acc-btn" />
      </View>,
    );
    expect(screen.queryByTestId('acc-btn')).not.toBeOnTheScreen();
  });
});

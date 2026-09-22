import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Button, Card, CardTitle, Input, Text } from '@chefer/ui-mobile';

// RNTL v14: render is async (concurrent React) — always await it.
describe('ui-mobile primitives', () => {
  it('Text renders its children', async () => {
    await render(<Text variant="title">Hello</Text>);
    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });

  it('Card + CardTitle render', async () => {
    await render(
      <Card testID="card">
        <CardTitle>Section</CardTitle>
      </Card>,
    );
    expect(screen.getByTestId('card')).toBeOnTheScreen();
    expect(screen.getByText('Section')).toBeOnTheScreen();
  });

  it('Button wraps string children in Text and fires onPress', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Tap me</Button>);

    await user.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Button in loading state is disabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <Button loading onPress={onPress}>
        Saving
      </Button>,
    );

    await user.press(screen.getByText('Saving'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('Input forwards text changes', async () => {
    const onChangeText = jest.fn();
    await render(<Input testID="input" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByTestId('input'), 'chicken');
    expect(onChangeText).toHaveBeenCalledWith('chicken');
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { CheckedForLine } from '../../src/features/safety/checked-for-line';

describe('CheckedForLine (UX-02 T-02.2/T-02.3)', () => {
  it('renders the full checked line for every passed rule', async () => {
    await render(
      <CheckedForLine
        testID="checked"
        checks={{
          checked: [
            { label: 'Tree nuts', who: 'Luca' },
            { label: 'Vegetarian', who: 'you' },
          ],
          unchecked: [],
        }}
      />,
    );
    expect(screen.getByTestId('checked-text')).toHaveTextContent(
      'Checked for Tree nuts (Luca) · Vegetarian (you)',
    );
  });

  it('renders a kept-note line under the main line', async () => {
    await render(
      <CheckedForLine
        testID="checked"
        checks={{ checked: [{ label: 'Vegan', who: 'you' }], unchecked: ['low sugar'] }}
      />,
    );
    expect(screen.getByText('Can’t check: “low sugar”')).toBeTruthy();
  });

  it('renders nothing when the table has no rules and nothing to report (AC1)', async () => {
    await render(<CheckedForLine testID="checked" checks={{ checked: [], unchecked: [] }} />);
    expect(screen.queryByTestId('checked')).toBeNull();
  });

  it('is pressable and opens details when onPress is given', async () => {
    const onPress = jest.fn();
    await render(
      <CheckedForLine
        testID="checked"
        checks={{ checked: [{ label: 'Fish', who: 'Ana' }], unchecked: [] }}
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByTestId('checked'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Opens details\.$/)).toBeTruthy();
  });
});

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TimePicker, type TimeOfDay } from '@chefer/ui-mobile';

// PAT-10 (technical-plan.md §2.10): two taps (hour cell + minute segment)
// reach any quarter hour inside the default window; 12h/24h locale display.
// RNTL v14: render/fireEvent are async (concurrent React) — always await.

function ControlledPicker({ initial, use24h }: { initial: TimeOfDay; use24h?: boolean }) {
  const [value, setValue] = useState(initial);
  return <TimePicker testID="tp" value={value} onChange={setValue} use24h={use24h} />;
}

describe('TimePicker (PAT-10)', () => {
  it('two taps (hour then minute) reach any quarter hour in the default window', async () => {
    await render(<ControlledPicker initial={{ hour: 5, minute: 0 }} use24h />);

    await fireEvent.press(screen.getByTestId('tp-hour-14')); // tap 1: 2 PM
    await fireEvent.press(screen.getByTestId('tp-minute-45')); // tap 2: :45

    expect(screen.getByTestId('tp-hour-14')).toBeSelected();
    expect(screen.getByTestId('tp-minute-45')).toBeSelected();
  });

  it('24h: hour cells show two digits and the a11y label is the 24h clock', async () => {
    await render(<ControlledPicker initial={{ hour: 19, minute: 0 }} use24h />);
    expect(screen.getByTestId('tp-hour-19')).toBeSelected();
    expect(screen.getByTestId('tp-hour-19')).toHaveAccessibleName('19:00');
    expect(screen.getByText('19')).toBeOnTheScreen();
  });

  it('12h: hour cells show the bare number, grouped under AM/PM headers, a11y label has the period', async () => {
    await render(<ControlledPicker initial={{ hour: 19, minute: 0 }} use24h={false} />);
    expect(screen.getByText('AM')).toBeOnTheScreen();
    expect(screen.getByText('PM')).toBeOnTheScreen();
    expect(screen.getByTestId('tp-hour-19')).toHaveAccessibleName('7:00 PM');
    // The bare-number label under PM — hour 19 renders as "7" (disambiguated
    // from AM's own "7" cell by the header, and here by testID).
    expect(screen.getByTestId('tp-hour-19')).toHaveTextContent('7');
  });

  it('a quick pick sets the exact time in one tap', async () => {
    const onChange = jest.fn();
    await render(
      <TimePicker testID="tp" value={{ hour: 5, minute: 0 }} onChange={onChange} use24h />,
    );
    await fireEvent.press(screen.getByTestId('tp-quick-18-0'));
    expect(onChange).toHaveBeenCalledWith({ hour: 18, minute: 0 });
  });

  it('"Earlier" reveals the hidden 0–4 am hours; "Later" is always disabled', async () => {
    await render(<ControlledPicker initial={{ hour: 5, minute: 0 }} use24h />);
    expect(screen.queryByTestId('tp-hour-3')).toBeNull();
    expect(screen.getByTestId('tp-later')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('tp-earlier'));
    expect(screen.getByTestId('tp-hour-3')).toBeTruthy();
  });

  it('a minute tap keeps the hour, an hour tap keeps the minute', async () => {
    await render(<ControlledPicker initial={{ hour: 9, minute: 15 }} use24h />);

    await fireEvent.press(screen.getByTestId('tp-hour-11'));
    expect(screen.getByTestId('tp-hour-11')).toBeSelected();
    expect(screen.getByTestId('tp-minute-15')).toBeSelected(); // unchanged

    await fireEvent.press(screen.getByTestId('tp-minute-30'));
    expect(screen.getByTestId('tp-hour-11')).toBeSelected(); // unchanged
    expect(screen.getByTestId('tp-minute-30')).toBeSelected();
  });
});

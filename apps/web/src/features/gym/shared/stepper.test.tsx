// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Stepper } from './stepper';

afterEach(cleanup);

// T-05.4 (CI-31, AC6): `onValueChange` makes the value directly typeable —
// reaching 150 from 40 is a couple of keystrokes, not ~44 clicks.

function TypedHarness() {
  const [value, setValue] = useState(40);
  return (
    <Stepper
      label="weight"
      value={`${value} kg`}
      rawValue={value}
      onValueChange={setValue}
      onDecrement={() => setValue((v) => v - 1)}
      onIncrement={() => setValue((v) => v + 1)}
      testId="weight-stepper"
    />
  );
}

describe('Stepper — typed entry (onValueChange)', () => {
  it('renders an editable numeric input instead of a read-only value', () => {
    render(<TypedHarness />);
    const input = screen.getByTestId('weight-stepper-input');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveValue(40);
  });

  it('reaching 150 from 40 is one typed change, not ~44 clicks', () => {
    render(<TypedHarness />);
    const input = screen.getByTestId('weight-stepper-input');
    fireEvent.change(input, { target: { value: '150' } });
    expect(input).toHaveValue(150);
  });

  it('without onValueChange, falls back to the plain read-only value (existing callers unaffected)', () => {
    render(
      <Stepper
        label="weight"
        value="40 kg"
        onDecrement={() => undefined}
        onIncrement={() => undefined}
        testId="plain-stepper"
      />,
    );
    expect(screen.queryByTestId('plain-stepper-input')).toBeNull();
    expect(screen.getByText('40 kg')).toBeInTheDocument();
  });

  it('onValueClick still works when onValueChange is not given (barbell plate calculator)', () => {
    let clicked = false;
    render(
      <Stepper
        label="weight"
        value="40 kg"
        onValueClick={() => {
          clicked = true;
        }}
        onDecrement={() => undefined}
        onIncrement={() => undefined}
        testId="clickable-stepper"
      />,
    );
    fireEvent.click(screen.getByText('40 kg'));
    expect(clicked).toBe(true);
  });
});

// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StepMetrics, type StepMetricsValues } from './step-metrics';

// §2.4, T-03.8 (bug B-43, AC11): typed values switch the height/weight unit
// toggle when they fit the OTHER system far better than the one currently
// selected — e.g. typing "69" into the cm field (implausible for cm, a
// plausible height in inches) flips to ft/in and re-interprets the same
// digits, with a notice + Undo. Mirrors
// apps/mobile/tests/unit/onboarding-units.test.tsx, adapted to web's
// independent height/weight toggles (StepMetrics manages its own cm/ft and
// kg/lbs state — there is no shared "units" prop like mobile's).

const EMPTY_VALUE: StepMetricsValues = {
  biologicalSex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
};

function ControlledStepMetrics() {
  const [value, setValue] = useState<StepMetricsValues>(EMPTY_VALUE);
  return <StepMetrics value={value} onChange={setValue} />;
}

function inputValue(el: HTMLElement): string {
  return (el as HTMLInputElement).value;
}

afterEach(cleanup);

describe('StepMetrics — units follow typed values (bug B-43, AC11)', () => {
  it('starts in cm/kg', () => {
    render(<ControlledStepMetrics />);
    expect(screen.getByLabelText('Height in centimetres')).toBeTruthy();
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
  });

  it('typing an inches-looking height switches to ft/in, with the notice + Undo', () => {
    render(<ControlledStepMetrics />);

    fireEvent.change(screen.getByLabelText('Height in centimetres'), {
      target: { value: '69' },
    });

    const feetInput = screen.getByLabelText('Height, feet');
    const inchesInput = screen.getByLabelText('Height, inches');
    expect(feetInput).toBeTruthy();
    expect(inputValue(feetInput)).toBe('5');
    expect(inputValue(inchesInput)).toBe('9');
    expect(screen.getByTestId('metrics-units-switch-notice').textContent).toMatch(
      /Switched height to ft \/ in/,
    );
  });

  it('typing a lb-looking weight switches to lbs, with the notice + Undo', () => {
    render(<ControlledStepMetrics />);

    fireEvent.change(screen.getByLabelText('Weight in kilograms'), {
      target: { value: '300' },
    });

    const weightInput = screen.getByLabelText('Weight in pounds');
    expect(weightInput).toBeTruthy();
    expect(inputValue(weightInput)).toBe('300');
    expect(screen.getByTestId('metrics-units-switch-notice').textContent).toMatch(
      /Switched weight to lbs/,
    );
  });

  it('Undo reverts the height switch to cm with the same digits', () => {
    render(<ControlledStepMetrics />);
    fireEvent.change(screen.getByLabelText('Height in centimetres'), {
      target: { value: '69' },
    });
    expect(screen.getByTestId('metrics-units-switch-undo')).toBeTruthy();

    fireEvent.click(screen.getByTestId('metrics-units-switch-undo'));

    const heightInput = screen.getByLabelText('Height in centimetres');
    expect(heightInput).toBeTruthy();
    expect(inputValue(heightInput)).toBe('69');
    expect(screen.queryByTestId('metrics-units-switch-notice')).toBeNull();
  });

  it('does not switch when the typed values already fit the current system', () => {
    render(<ControlledStepMetrics />);
    fireEvent.change(screen.getByLabelText('Height in centimetres'), {
      target: { value: '175' },
    });
    fireEvent.change(screen.getByLabelText('Weight in kilograms'), {
      target: { value: '75' },
    });

    expect(screen.getByLabelText('Height in centimetres')).toBeTruthy();
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
    expect(screen.queryByTestId('metrics-units-switch-notice')).toBeNull();
  });
});

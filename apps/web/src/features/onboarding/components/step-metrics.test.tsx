// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepMetrics } from './step-metrics';

// T-22.3: goal/metrics disclaimer, always shown here (targets-section.tsx
// suppresses StepGoal's copy instead, so a combined screen shows it once).

afterEach(cleanup);

const EMPTY_VALUE = {
  biologicalSex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
};

describe('StepMetrics', () => {
  it('shows the goal/metrics disclaimer', () => {
    render(<StepMetrics value={EMPTY_VALUE} onChange={vi.fn()} />);
    expect(screen.getByText(/General estimates only/i)).toBeTruthy();
  });
});

// R-02 (Guideline 1.4.1): no body metrics under 16, no deficit under 18.
describe('StepMetrics — age rules (R-02)', () => {
  const REPRO = {
    biologicalSex: 'FEMALE' as const,
    age: 13,
    heightCm: 152,
    weightKg: 44,
    activityLevel: 'SEDENTARY' as const,
  };

  it('shows the friendly message and no estimate for age 13', () => {
    render(<StepMetrics value={REPRO} onChange={vi.fn()} goal="LOSE_WEIGHT" />);
    expect(screen.getAllByText('Chefer is for people aged 16 and over.').length).toBeGreaterThan(0);
    expect(screen.getByRole('alert').textContent).toBe('Chefer is for people aged 16 and over.');
    expect(screen.getByLabelText('Age').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('1,200')).toBeNull();
    expect(screen.queryByText(/Estimated daily calorie target/)).toBeNull();
  });

  it('explains maintenance for a 17-year-old on Lose Weight (no deficit)', () => {
    render(<StepMetrics value={{ ...REPRO, age: 17 }} onChange={vi.fn()} goal="LOSE_WEIGHT" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('minor-no-deficit-note').textContent).toContain(
      "Under 18 we don't set a calorie deficit",
    );
    // maintenance, not maintenance − 500
    expect(screen.getAllByText(/1,373/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/for your goal/)).toBeNull();
  });

  it('keeps the −500 deficit for an adult', () => {
    render(
      <StepMetrics
        value={{ ...REPRO, age: 30, weightKg: 70, heightCm: 170 }}
        onChange={vi.fn()}
        goal="LOSE_WEIGHT"
      />,
    );
    expect(screen.queryByTestId('minor-no-deficit-note')).toBeNull();
    expect(screen.getByText(/− 500 for your goal/)).toBeTruthy();
  });
});

// UX-ONB-05: plausibility bounds for height and weight.
describe('StepMetrics — height and weight bounds (UX-ONB-05)', () => {
  const OK = {
    biologicalSex: 'FEMALE' as const,
    age: 30,
    heightCm: 170,
    weightKg: 70,
    activityLevel: 'SEDENTARY' as const,
  };

  it('shows no error and the estimate for plausible values', () => {
    render(<StepMetrics value={OK} onChange={vi.fn()} goal="MAINTAIN" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/Estimated daily calorie target/)).toBeTruthy();
  });

  it('flags "1,80" cm (1.8), hides the estimate', () => {
    render(<StepMetrics value={{ ...OK, heightCm: 1.8 }} onChange={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Enter a height between 100 and 250 cm.');
    expect(screen.getByLabelText('Height in centimetres').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(screen.queryByText(/Estimated daily calorie target/)).toBeNull();
    expect(screen.getByText(/Fix your height and weight/)).toBeTruthy();
  });

  it('flags an 8 kg weight', () => {
    render(<StepMetrics value={{ ...OK, weightKg: 8 }} onChange={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Enter a weight between 20 and 400 kg.');
    expect(screen.queryByText(/Estimated daily calorie target/)).toBeNull();
  });
});

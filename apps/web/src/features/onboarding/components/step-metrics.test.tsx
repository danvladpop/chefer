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

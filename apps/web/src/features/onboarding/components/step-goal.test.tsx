// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepGoal } from './step-goal';

// T-22.3: goal/metrics disclaimer, visible by default (the standalone
// onboarding step has no metrics screen alongside it) and suppressible for a
// combined screen (Settings › Preferences) where StepMetrics carries it
// instead. T-35.2: RECOMP/PERFORMANCE join the picker.

afterEach(cleanup);

describe('StepGoal', () => {
  it('shows the disclaimer by default', () => {
    render(<StepGoal value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/General estimates only/i)).toBeTruthy();
  });

  it('hides the disclaimer when showDisclaimer is false', () => {
    render(<StepGoal value={null} onChange={vi.fn()} showDisclaimer={false} />);
    expect(screen.queryByText(/General estimates only/i)).toBeNull();
  });

  it('lists RECOMP and PERFORMANCE alongside the original four goals', () => {
    render(<StepGoal value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Recomposition' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Performance' })).toBeTruthy();
  });
});

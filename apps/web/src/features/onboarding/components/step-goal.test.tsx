// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumbersModeProvider } from '../../numbers-mode/numbers-mode';
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

  // Lane E3: the kcal effect is a nutrition figure.
  it('shows each goal’s calorie effect only when numbers are shown', () => {
    render(<StepGoal value={null} onChange={vi.fn()} />);
    expect(screen.getByText('−500 kcal/day deficit')).toBeTruthy();
    cleanup();
    render(
      <NumbersModeProvider mode="NONE">
        <StepGoal value={null} onChange={vi.fn()} />
      </NumbersModeProvider>,
    );
    expect(screen.queryByText(/kcal/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Lose Weight' })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepTrainingDays, trainingDaysCountLabel } from './step-training-days';

// UX-ONB-10: onboarding nits — pluralised count, run-only copy, no lone "Sun" chip.

afterEach(cleanup);

function renderStep(weekdays: number[], onWeekdaysChange = vi.fn()) {
  return render(
    <StepTrainingDays
      weekdays={weekdays}
      onWeekdaysChange={onWeekdaysChange}
      dayKinds={{}}
      onDayKindsChange={vi.fn()}
      onNotSure={vi.fn()}
    />,
  );
}

describe('StepTrainingDays nits (UX-ONB-10)', () => {
  it('pluralises the count', () => {
    expect(trainingDaysCountLabel(0)).toBe('0 days a week');
    expect(trainingDaysCountLabel(1)).toBe('1 day a week');
    expect(trainingDaysCountLabel(3)).toBe('3 days a week');
    renderStep([0]);
    expect(screen.getByTestId('training-days-count').textContent).toBe('1 day a week');
  });

  it('asks about runs only — there is no ride option', () => {
    renderStep([0]);
    expect(screen.getByText('Are any of these days a run?')).toBeTruthy();
    expect(screen.queryByText(/ride/i)).toBeNull();
  });

  it('lays the weekdays out as 4 + 3 on a phone and one row from sm, never 6 + 1', () => {
    renderStep([]);
    const row = screen.getByTestId('training-days-6').parentElement;
    expect(row?.className).toContain('grid-cols-4');
    expect(row?.className).toContain('sm:flex');
    expect(row?.children).toHaveLength(7);
  });

  it('toggles a weekday', () => {
    const onChange = vi.fn();
    renderStep([0], onChange);
    fireEvent.click(screen.getByTestId('training-days-6'));
    expect(onChange).toHaveBeenCalledWith([0, 6]);
  });
});

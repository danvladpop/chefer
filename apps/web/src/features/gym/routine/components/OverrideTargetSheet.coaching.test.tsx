// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Suggestion } from '@chefer/types';
import { OverrideTargetSheet, type OverrideTargetSheetTarget } from './OverrideTargetSheet';

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);

const suggestion: Suggestion = {
  kind: 'hold',
  weightKg: 60,
  reps: [8, 8, 8],
  sets: 3,
  reasonCode: 'CONSOLIDATE',
  inputs: {},
  deltaKg: 0,
  engineVersion: 1,
};

const target: OverrideTargetSheetTarget = {
  exerciseId: 'back-squat',
  repBucket: '6-8',
  repRangeLabel: '6-8',
  exerciseName: 'Back Squat',
  loadType: 'WEIGHTED',
  isTimed: false,
  suggestion,
  override: { weightKg: 62.5, reps: [6, 6, 6, 6], at: '2026-10-02T12:00:00.000Z' },
};

describe('OverrideTargetSheet: trainer wording', () => {
  it('says whose target it is, when it applies, and resets to the app suggestion', () => {
    const onReset = vi.fn();
    render(
      <OverrideTargetSheet
        target={target}
        unit="KG"
        coaching={{ clientName: 'Maria' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onReset={onReset}
      />,
    );
    expect(screen.getByText('Set Maria’s target for the next session')).toBeInTheDocument();
    expect(
      screen.getByText(/Applies the next time Maria does Back Squat \(6–8 reps\)\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to app suggestion' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('keeps the owner wording when not coaching', () => {
    render(
      <OverrideTargetSheet
        target={target}
        unit="KG"
        onClose={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText("Override the next session's target")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to suggestion' })).toBeInTheDocument();
  });
});

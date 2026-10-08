// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_JOBS } from '@chefer/types';
import { isOfferedOnboardingJob } from '@chefer/utils';
import { JOB_OPTIONS, StepJobs } from './step-jobs';

afterEach(cleanup);

// WP-24 / FB7-10: the pantry is retired, so its "Use what I have" job is no
// longer offered. The enum value stays valid for stored values / old clients.
describe('StepJobs — retired pantry job', () => {
  it('does not render a "Use what I have" card', () => {
    render(<StepJobs value={[]} onChange={vi.fn()} />);
    expect(screen.queryByTestId('onboarding-job-USE_WHAT_I_HAVE')).toBeNull();
    expect(screen.queryByText(/use what i have/i)).toBeNull();
    expect(screen.queryByText(/what.s in my kitchen/i)).toBeNull();
  });

  it('offers every job that is not retired, and only those', () => {
    expect(JOB_OPTIONS.map((o) => o.value)).toEqual(ONBOARDING_JOBS.filter(isOfferedOnboardingJob));
    render(<StepJobs value={[]} onChange={vi.fn()} />);
    for (const job of ONBOARDING_JOBS.filter(isOfferedOnboardingJob)) {
      expect(screen.getByTestId(`onboarding-job-${job}`)).toBeTruthy();
    }
  });

  it('keeps a stored USE_WHAT_I_HAVE in the selection when another card is toggled', () => {
    const onChange = vi.fn();
    render(<StepJobs value={['USE_WHAT_I_HAVE']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('onboarding-job-TRAIN'));
    expect(onChange).toHaveBeenCalledWith(['USE_WHAT_I_HAVE', 'TRAIN']);
  });
});

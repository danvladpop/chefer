import { fireEvent, render, screen } from '@testing-library/react-native';
import { ONBOARDING_JOBS } from '@chefer/types';
import { isOfferedOnboardingJob } from '@chefer/utils';
import { ONBOARDING_COPY } from '../../src/features/onboarding/copy';
import { JOB_OPTIONS, JobsStep } from '../../src/features/onboarding/jobs-step';

// WP-24 / FB7-10: the "In my kitchen" pantry is retired, so the "Use what I
// have" job is no longer offered. The enum value stays valid for stored values
// and old clients.
describe('JobsStep — retired pantry job', () => {
  it('does not render a "Use what I have" card', async () => {
    await render(<JobsStep value={[]} onChange={jest.fn()} />);
    expect(screen.queryByTestId('onboarding-job-USE_WHAT_I_HAVE')).toBeNull();
    expect(screen.queryByText(/use what i have/i)).toBeNull();
    expect(screen.queryByText(/what.s in my kitchen/i)).toBeNull();
  });

  it('offers every job that is not retired, and only those', async () => {
    expect(JOB_OPTIONS.map((o) => o.value)).toEqual(ONBOARDING_JOBS.filter(isOfferedOnboardingJob));
    await render(<JobsStep value={[]} onChange={jest.fn()} />);
    for (const job of ONBOARDING_JOBS.filter(isOfferedOnboardingJob)) {
      expect(screen.getByTestId(`onboarding-job-${job}`)).toBeOnTheScreen();
    }
  });

  it('keeps a stored USE_WHAT_I_HAVE in the selection when another card is toggled', async () => {
    const onChange = jest.fn();
    await render(<JobsStep value={['USE_WHAT_I_HAVE']} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('onboarding-job-TRAIN'));
    expect(onChange).toHaveBeenCalledWith(['USE_WHAT_I_HAVE', 'TRAIN']);
  });

  it('the copy table no longer carries the pantry job strings', () => {
    expect(Object.keys(ONBOARDING_COPY)).not.toContain('jobUseWhatIHaveTitle');
    expect(Object.values(ONBOARDING_COPY).join('\n')).not.toMatch(/what.s in my kitchen/i);
  });
});

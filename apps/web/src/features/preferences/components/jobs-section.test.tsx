// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsSection } from './jobs-section';

// Bug found via the integration Playwright run (2026-09-29): every existing
// account — including every account in production, which predates the jobs
// question — can have ZERO saved jobs (`preferences.get`'s `jobs` is `[]`).
// desktop-preferences-jobs.spec.ts passed on a lane DB where the seeded admin
// account already had a job saved, masking that starting from an empty
// selection was never actually exercised. This is the regression test that
// was missing: JobsSection must accept, render and correctly save a
// selection made from a genuinely empty `initialJobs`.

const m = vi.hoisted(() => ({ mutate: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ preferences: { invalidate: vi.fn() } }),
    preferences: {
      setJobs: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            m.mutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

beforeEach(() => {
  m.mutate.mockReset();
  m.push.mockReset();
});
afterEach(cleanup);

describe('JobsSection — starting from zero saved jobs (bug found 2026-09-29)', () => {
  it('renders every card unselected and Save disabled', () => {
    render(<JobsSection initialJobs={[]} />);

    expect(screen.getByTestId('onboarding-job-TRACK').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('onboarding-job-TRAIN').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('jobs-section-save').hasAttribute('disabled')).toBe(true);
  });

  it('selecting a card from empty enables Save and saves exactly that job', () => {
    render(<JobsSection initialJobs={[]} />);

    const track = screen.getByTestId('onboarding-job-TRACK');
    fireEvent.click(track);
    expect(track.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('jobs-section-save').hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByTestId('jobs-section-save'));
    expect(m.mutate).toHaveBeenCalledWith({ jobs: ['TRACK'] });
  });

  it('deselecting back to zero (e.g. undoing the click above) disables Save again', () => {
    render(<JobsSection initialJobs={[]} />);

    const track = screen.getByTestId('onboarding-job-TRACK');
    fireEvent.click(track);
    fireEvent.click(track);
    expect(track.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('jobs-section-save').hasAttribute('disabled')).toBe(true);
  });

  it('a non-empty starting selection still renders correctly (existing behaviour)', () => {
    render(<JobsSection initialJobs={['TRAIN']} />);

    expect(screen.getByTestId('onboarding-job-TRAIN').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('jobs-section-save').hasAttribute('disabled')).toBe(false);
  });
});

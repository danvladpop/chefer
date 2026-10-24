// @vitest-environment jsdom
import { progressMock, resetProgressMock, summaryFixture } from '@/test-support/progress-fixtures';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import { RewardsSettingsCard } from './rewards-settings-card';

vi.mock('@/lib/trpc', () =>
  import('@/test-support/progress-fixtures').then((m) => m.progressTrpcMock),
);

beforeEach(() => {
  resetProgressMock();
});
afterEach(cleanup);

describe('RewardsSettingsCard', () => {
  it('shows the current settings', () => {
    render(<RewardsSettingsCard />);
    expect(screen.getByRole('heading', { name: 'Rewards & motivation' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Full party' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(
      screen.getByRole('switch', { name: 'Show XP & levels' }).getAttribute('aria-checked'),
    ).toBe('true');
    // No reminder row on web: there is no web push.
    expect(screen.queryByText('Gentle reminder')).toBeNull();
  });

  it('calls updateSettings with just the changed field', () => {
    render(<RewardsSettingsCard />);
    fireEvent.click(screen.getByRole('radio', { name: 'Subtle' }));
    expect(progressMock.mutate.updateSettings).toHaveBeenLastCalledWith({ celebrations: 'SUBTLE' });

    fireEvent.click(screen.getByRole('switch', { name: 'Show XP & levels' }));
    expect(progressMock.mutate.updateSettings).toHaveBeenLastCalledWith({ showXp: false });

    fireEvent.click(screen.getByRole('switch', { name: 'Biscuit companion' }));
    expect(progressMock.mutate.updateSettings).toHaveBeenLastCalledWith({ biscuit: false });

    fireEvent.click(screen.getByRole('switch', { name: 'Show my flame on Today' }));
    expect(progressMock.mutate.updateSettings).toHaveBeenLastCalledWith({
      showFlameOnToday: false,
    });
    expect(progressMock.mutate.updateSettings).toHaveBeenCalledTimes(4);
  });

  it('explains that Off still saves progress', () => {
    progressMock.summary = summaryFixture({
      settings: { ...DEFAULT_PROGRESS_SETTINGS, celebrations: 'OFF' },
    });
    render(<RewardsSettingsCard />);
    expect(screen.getByText(/Off still saves your XP and badges/)).toBeTruthy();
  });

  it('changes the weekly goal and pauses / resumes the flame', () => {
    render(<RewardsSettingsCard />);
    fireEvent.change(screen.getByLabelText('Weekly active-day goal'), { target: { value: '5' } });
    expect(progressMock.mutate.setActiveDayGoal).toHaveBeenCalledWith({
      goal: 5,
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
    });

    const pause = screen.getByTestId('pause-flame');
    fireEvent.change(within(pause).getByLabelText('For how long'), { target: { value: '2' } });
    fireEvent.click(within(pause).getByRole('button', { name: 'Pause from today' }));
    expect(progressMock.mutate.pauseFlame).toHaveBeenCalledWith({
      startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
      weeks: 2,
    });
  });

  it('offers "I\'m back" while the flame is paused', () => {
    const base = summaryFixture();
    progressMock.summary = summaryFixture({ flame: { ...base.flame, pausedUntil: '2026-11-02' } });
    render(<RewardsSettingsCard />);
    expect(screen.getByTestId('pause-flame').textContent).toContain('Paused until 2026-11-02');
    fireEvent.click(screen.getByRole('button', { name: 'I’m back' }));
    expect(progressMock.mutate.resumeFlame).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while the gate is off', () => {
    progressMock.availability = { enabled: false };
    const { container } = render(<RewardsSettingsCard />);
    expect(container.innerHTML).toBe('');
  });
});

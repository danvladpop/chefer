// @vitest-environment jsdom
import { progressMock, resetProgressMock, summaryFixture } from '@/test-support/progress-fixtures';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import { ProgressToday } from './progress-today';

vi.mock('@/lib/trpc', () =>
  import('@/test-support/progress-fixtures').then((m) => m.progressTrpcMock),
);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  resetProgressMock();
});
afterEach(cleanup);

describe('ProgressToday: the strip', () => {
  it('shows the level, rank, XP to the next rank, the flame and the week', () => {
    render(<ProgressToday />);
    const strip = screen.getByTestId('progress-strip');
    expect(within(strip).getByText('Line Cook')).toBeTruthy();
    expect(strip.textContent).toContain('340 / 500 XP to Chef de Partie');
    expect(strip.textContent).toContain('6 wk');
    expect(strip.textContent).toContain('2 of 3');
    expect(strip.textContent).toContain('active days');
    // The level ring carries the number and an accessible name.
    expect(screen.getByRole('progressbar', { name: /Lv 7, 340 of 500 XP/ })).toBeTruthy();
    // Seven day dots, each named for screen readers.
    expect(within(strip).getByText('Thursday: today')).toBeTruthy();
    expect(within(strip).getByText('Wednesday: rest day')).toBeTruthy();
  });

  it('opens the Flame sheet when tapped', () => {
    render(<ProgressToday />);
    expect(screen.queryByTestId('flame-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('progress-strip'));
    const sheet = screen.getByTestId('flame-sheet');
    expect(within(sheet).getByTestId('flame-count').textContent).toBe('6 weeks');
    expect(sheet.textContent).toContain('Best: 9 weeks.');
    // Best 9: the 4 and 8 week milestones are filled, 12 is next (dashed).
    expect(sheet.querySelector('[data-state="next"]')?.textContent).toContain('12 wk');
    const reached = [...sheet.querySelectorAll('[data-state="reached"]')].map(
      (li) => li.textContent,
    );
    expect(reached).toHaveLength(2);
    expect(reached[0]).toContain('4 wk');
    expect(reached[1]).toContain('8 wk');
  });

  it('is hidden when "Show my flame on Today" is off, but Today\'s three stays', () => {
    progressMock.summary = summaryFixture({
      settings: { ...DEFAULT_PROGRESS_SETTINGS, showFlameOnToday: false },
    });
    render(<ProgressToday />);
    expect(screen.queryByTestId('progress-strip')).toBeNull();
    expect(screen.getByTestId('todays-three')).toBeTruthy();
  });

  it('shows only the flame row when "Show XP & levels" is off, and hides Today\'s three', () => {
    progressMock.summary = summaryFixture({
      settings: { ...DEFAULT_PROGRESS_SETTINGS, showXp: false },
    });
    render(<ProgressToday />);
    const strip = screen.getByTestId('progress-strip');
    expect(strip.textContent).toContain('6 weeks');
    expect(strip.textContent).not.toContain('XP');
    expect(screen.queryByTestId('progress-strip-ring')).toBeNull();
    expect(screen.queryByTestId('todays-three')).toBeNull();
  });
});

describe("ProgressToday: Today's three", () => {
  it('lists the quests with their XP, the bonus pill and deep links', () => {
    render(<ProgressToday />);
    const card = screen.getByTestId('todays-three');
    expect(within(card).getByText("Today's three")).toBeTruthy();
    expect(card.textContent).toContain('+40 XP bonus');
    expect(card.textContent).toContain('Log breakfast');
    expect(card.textContent).toContain('Cook dinner at home');
    expect(card.textContent).toContain('Lemon Herb Salmon');
    expect(card.textContent).toContain('62 g so far');
    expect(card.textContent).toContain('Finish all three for a bonus.');

    // A done quest is not a link; an open one goes where it gets done.
    expect(screen.getByTestId('quest-LOG_SLOT:breakfast').querySelector('a')).toBeNull();
    expect(screen.getByTestId('quest-COOK:dinner').querySelector('a')?.getAttribute('href')).toBe(
      '/recipes/r1/cook',
    );
    expect(screen.getByTestId('quest-PROTEIN').querySelector('a')?.getAttribute('href')).toBe(
      '/tracker',
    );
  });

  it('is hidden when there are no quests, and in quiet mode', () => {
    progressMock.summary = summaryFixture({ todaysThree: null });
    const { unmount } = render(<ProgressToday />);
    expect(screen.queryByTestId('todays-three')).toBeNull();
    unmount();

    progressMock.summary = summaryFixture({ quiet: true });
    render(<ProgressToday />);
    expect(screen.queryByTestId('todays-three')).toBeNull();
    expect(screen.getByTestId('progress-quiet').textContent).toContain(
      'We’re here for the whole you',
    );
  });
});

describe('ProgressToday: the gate', () => {
  it('renders nothing and makes no progress call when the flag is off', () => {
    progressMock.flags = { gamification: false };
    const { container } = render(<ProgressToday />);
    expect(container.innerHTML).toBe('');
    expect(progressMock.queries['availability']).toBeUndefined();
    expect(progressMock.queries['summary']).toBeUndefined();
  });

  it("renders nothing when the account isn't on the allowlist", () => {
    progressMock.availability = { enabled: false };
    const { container } = render(<ProgressToday />);
    expect(container.innerHTML).toBe('');
    expect(progressMock.queries['summary']).toBeUndefined();
  });
});

describe('ProgressToday: intro and recap', () => {
  it('shows the welcome card once and marks it seen on the button', () => {
    progressMock.summary = summaryFixture({ intro: { backdatedXp: 1240, badges: 6 } });
    render(<ProgressToday />);
    const intro = screen.getByTestId('progress-intro');
    expect(intro.textContent).toContain('Welcome to the kitchen');
    expect(intro.textContent).toContain('Your history earned 1,240 XP and 6 badges.');
    fireEvent.click(within(intro).getByRole('button', { name: 'Let’s cook' }));
    expect(progressMock.mutate.markSeen).toHaveBeenCalledWith({ intro: true });
  });

  it('links the recap banner to that week', () => {
    progressMock.summary = summaryFixture({ recap: { weekStart: '2026-10-12' } });
    render(<ProgressToday />);
    expect(screen.getByTestId('progress-recap-banner').getAttribute('href')).toBe(
      '/kitchen-recap/2026-10-12',
    );
  });
});

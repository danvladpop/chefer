// @vitest-environment jsdom
import { progressMock, resetProgressMock } from '@/test-support/progress-fixtures';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyRecap } from '@chefer/types';
import { RecapView, weekRangeLabel } from './recap-view';

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

const RECAP: WeeklyRecap = {
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  cooked: 9,
  mealsLogged: 20,
  activeDays: 6,
  workouts: 3,
  workoutGoal: 3,
  prs: 2,
  newRecipes: 4,
  dishOfWeek: {
    recipeId: 'r1',
    name: 'Lemon Herb Salmon',
    imageUrl: null,
    timesCooked: 2,
    rating: 5,
  },
  flame: { from: 5, to: 6 },
  xp: 640,
  level: { from: 6, to: 7 },
};

beforeEach(() => {
  resetProgressMock();
  progressMock.recap = RECAP;
});
afterEach(cleanup);

describe('weekRangeLabel', () => {
  it('formats within a month and across months', () => {
    expect(weekRangeLabel('2026-10-12', '2026-10-18')).toBe('12–18 Oct');
    expect(weekRangeLabel('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct');
  });
});

describe('RecapView', () => {
  it('walks the cards with the buttons and ←/→, ending on "Plan next week"', () => {
    render(<RecapView week="2026-10-12" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    // Card 1: the four tiles.
    let card = screen.getByTestId('recap-card');
    expect(card.textContent).toContain('The kitchen was busy this week.');
    expect(card.textContent).toContain('meals cooked at home');
    expect(card.textContent).toContain('workouts · goal met');
    expect(card.textContent).toContain('12–18 Oct');

    // Card 2: the dish of the week.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    card = screen.getByTestId('recap-card');
    expect(card.textContent).toContain('Lemon Herb Salmon');
    expect(card.textContent).toContain('cooked 2 times');

    // Card 3: Flame, XP and level; the keyboard moves too.
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    card = screen.getByTestId('recap-card');
    expect(card.textContent).toContain('+640 XP');
    expect(card.textContent).toContain('Lv 6');

    // Card 4: Biscuit, and the way into next week.
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    card = screen.getByTestId('recap-card');
    expect(card.textContent).toContain('Biscuit’s take');
    expect(screen.getByRole('link', { name: 'Plan next week' }).getAttribute('href')).toBe(
      '/meal-plan',
    );

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByTestId('recap-card').textContent).toContain('+640 XP');
  });

  it('opening the recap marks it seen', () => {
    render(<RecapView week="2026-10-12" />);
    expect(progressMock.mutate.markSeen).toHaveBeenCalledWith({ recapWeek: '2026-10-12' });
  });

  it('skips the dish card when there is none', () => {
    progressMock.recap = { ...RECAP, dishOfWeek: null };
    render(<RecapView week="2026-10-12" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('recap-card').textContent).toContain('XP earned');
  });

  it('says so for a bad week and for a gate that is off, with one <h1>', () => {
    const { unmount } = render(<RecapView week="not-a-date" />);
    expect(screen.getByText('That week isn’t one we can show.')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    unmount();

    progressMock.availability = { enabled: false };
    render(<RecapView week="2026-10-12" />);
    expect(screen.getByTestId('progress-not-available')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(progressMock.queries['weeklyRecap']).toBeUndefined();
  });
});

// @vitest-environment jsdom
import { progressMock, resetProgressMock } from '@/test-support/progress-fixtures';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementItem, AchievementsDto } from '@chefer/types';
import { AchievementsView } from './achievements-view';

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

function item(overrides: Partial<AchievementItem>): AchievementItem {
  return {
    id: 'HOME_CHEF',
    group: 'KITCHEN',
    title: 'Home Chef',
    description: 'Cook 25 meals in cook mode',
    icon: '🍳',
    tier: 2,
    tiers: [5, 25, 100],
    progress: 23,
    nextTarget: 25,
    unlockedAt: new Date('2026-10-01T10:00:00Z'),
    isNew: false,
    ...overrides,
  };
}

const homeChef = item({});
const flame = item({
  id: 'FLAME',
  group: 'FLAME',
  title: 'Flame',
  icon: '🔥',
  description: 'Keep your flame going for 12 weeks',
  tier: 0,
  tiers: [4, 12],
  progress: 1,
  nextTarget: 4,
  unlockedAt: null,
  isNew: true,
});
const DTO: AchievementsDto = {
  earned: 23,
  total: 64,
  closestNext: homeChef,
  groups: [
    { group: 'KITCHEN', items: [homeChef] },
    { group: 'FLAME', items: [flame] },
  ],
};

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  resetProgressMock();
  progressMock.achievements = DTO;
});
afterEach(cleanup);

describe('AchievementsView', () => {
  it('shows the earned / total pill, the closest next badge and a tile per achievement', () => {
    render(<AchievementsView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Achievements' })).toBeTruthy();
    expect(screen.getByTestId('achievements-count').textContent).toBe('23 / 64');

    const closest = screen.getByTestId('achievements-closest');
    expect(closest.textContent).toContain('Closest next');
    expect(closest.textContent).toContain('2 to go');
    expect(closest.textContent).toContain('Home Chef III · Cook 25 meals in cook mode');

    expect(screen.getByRole('button', { name: 'Home Chef, tier II' })).toBeTruthy();
    // An unearned badge has no tier; a new one is called out.
    expect(screen.getByRole('button', { name: 'Flame, New' })).toBeTruthy();
  });

  it('filters by group', () => {
    render(<AchievementsView />);
    fireEvent.click(screen.getByRole('button', { name: /Flame/, pressed: false }));
    expect(screen.queryByRole('button', { name: /Home Chef, tier/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Flame, New/ })).toBeTruthy();
  });

  it('opens a detail sheet with the progress when a tile is tapped', () => {
    render(<AchievementsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Home Chef, tier II' }));
    const detail = screen.getByTestId('achievement-detail');
    expect(detail.textContent).toContain('Cook 25 meals in cook mode');
    expect(within(detail).getByRole('progressbar', { name: '23 of 25' })).toBeTruthy();
  });

  it('marks the shelf as seen once it has loaded', () => {
    const { rerender } = render(<AchievementsView />);
    rerender(<AchievementsView />);
    expect(progressMock.mutate.markSeen).toHaveBeenCalledTimes(1);
    expect(progressMock.mutate.markSeen).toHaveBeenCalledWith({ achievements: true });
  });

  it('shows the friendly "not available" state, and loads nothing, while the gate is off', () => {
    progressMock.flags = { gamification: false };
    render(<AchievementsView />);
    expect(screen.getByTestId('progress-not-available')).toBeTruthy();
    // One <h1> even then.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(progressMock.queries['achievements']).toBeUndefined();
    expect(progressMock.mutate.markSeen).not.toHaveBeenCalled();
  });
});

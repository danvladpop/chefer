// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navFor, type AppMode } from '../nav-items';
import { BottomNav } from './bottom-nav';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
let mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
let mockMode: AppMode = 'food';
let mockBadges: Record<string, number> = {};
vi.mock('../mode-context', () => ({
  useAppMode: () => ({
    mode: mockMode,
    nav: navFor(mockMode),
    navBadges: mockBadges,
    trainerModeAvailable: mockMode === 'trainer',
  }),
}));

afterEach(cleanup);

function tabLabels(): string[] {
  const bar = screen.getByRole('navigation', { name: 'Primary' });
  return within(bar)
    .getAllByRole('listitem')
    .map((li) => li.textContent ?? '');
}

describe('BottomNav', () => {
  // Owner feedback 2026-10-17 (F4): Today is the core of the app, so it sits
  // in the middle of the phone tab bar (a literal swap with Shop), as on mobile.
  it('food mode reads Shop · Plan · Today · Cookbook · More', () => {
    mockMode = 'food';
    mockPathname = '/dashboard';
    render(<BottomNav onOpenMore={() => undefined} />);
    expect(tabLabels()).toEqual(['Shop', 'Plan', 'Today', 'Cookbook', 'More']);
    expect(screen.getByRole('link', { current: 'page' }).getAttribute('href')).toBe('/dashboard');
  });

  it('gym mode keeps Today · Routine · Exercises · Stats · More', () => {
    mockMode = 'gym';
    mockPathname = '/gym';
    render(<BottomNav onOpenMore={() => undefined} />);
    expect(tabLabels()).toEqual(['Today', 'Routine', 'Exercises', 'Stats', 'More']);
  });
});

describe('BottomNav in trainer mode (trainer-mode.md §5.3, §7.1)', () => {
  it('reads Schedule · Clients · Today · Workouts · More, Today lit on /trainer/today', () => {
    mockMode = 'trainer';
    mockPathname = '/trainer/today';
    mockBadges = {};
    render(<BottomNav onOpenMore={() => undefined} />);
    expect(tabLabels()).toEqual(['Schedule', 'Clients', 'Today', 'Workouts', 'More']);
    expect(screen.getByRole('link', { current: 'page' }).getAttribute('href')).toBe(
      '/trainer/today',
    );
  });

  it('Clients carries the pending-request count, with an accessible name', () => {
    mockMode = 'trainer';
    mockPathname = '/trainer/today';
    mockBadges = { '/trainer/clients': 2 };
    render(<BottomNav onOpenMore={() => undefined} />);
    const clients = screen.getByRole('link', { name: /Clients/ });
    expect(clients).toHaveAccessibleName(/^Clients\s*, 2 things waiting$/);
    expect(within(clients).getByTestId('nav-count-badge').textContent).toBe('2');
  });
});

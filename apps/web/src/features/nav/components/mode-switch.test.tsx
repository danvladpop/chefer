// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { TrainerModeState } from '@/features/trainer-mode/use-trainer-mode';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModeProvider } from '../mode-context';
import type { AppMode } from '../nav-items';
import { ModeSwitch } from './mode-switch';

const m = vi.hoisted(() => ({
  push: vi.fn(),
  capture: vi.fn(),
  pathname: '/dashboard',
  trainer: {
    available: false,
    isLoading: false,
    badges: null,
    status: { active: false },
  } as unknown as TrainerModeState,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => m.pathname,
  useRouter: () => ({ push: m.push, replace: vi.fn() }),
}));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/features/trainer-mode/use-trainer-mode', () => ({ useTrainerMode: () => m.trainer }));

function setTrainer(available: boolean, total = 0) {
  m.trainer = {
    available,
    isLoading: false,
    badges: available ? { requests: total, unmarkedAttendance: 0, bookingChanges: 0, total } : null,
    status: { active: available },
  } as unknown as TrainerModeState;
}

function renderSwitch(initialMode: AppMode = 'food') {
  return render(
    <ModeProvider initialMode={initialMode}>
      <ModeSwitch />
    </ModeProvider>,
  );
}

beforeEach(() => {
  m.push.mockClear();
  m.capture.mockClear();
  m.pathname = '/dashboard';
  document.cookie = 'chefer_mode=; Max-Age=0; Path=/';
});
afterEach(cleanup);

describe('ModeSwitch', () => {
  it('shows Food | Gym only, and no announcer, while trainer mode is unavailable', () => {
    setTrainer(false);
    renderSwitch();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Food', 'Gym']);
    expect(screen.queryByTestId('mode-announcement')).toBeNull();
  });

  it('food ↔ gym keeps its own event', () => {
    setTrainer(false);
    renderSwitch();
    fireEvent.click(screen.getByRole('button', { name: 'Gym' }));
    expect(m.capture).toHaveBeenCalledWith('gym_mode_switched', { to: 'gym' });
    expect(m.push).toHaveBeenCalledWith('/gym');
  });

  it('adds a Trainer segment for an available trainer mode', () => {
    setTrainer(true);
    renderSwitch();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Food',
      'Gym',
      'Trainer',
    ]);
  });

  it('the Trainer segment counts what waits there, with an accessible count', () => {
    setTrainer(true, 3);
    renderSwitch();
    const trainer = screen.getByTestId('mode-switch-trainer');
    expect(trainer).toHaveAccessibleName(/^Trainer\s*, 3 things waiting$/);
    expect(screen.getByTestId('nav-count-badge')).toHaveTextContent('3');
  });

  it('switching to Trainer writes the cookie, lands on Trainer Today and announces it', () => {
    setTrainer(true);
    renderSwitch();
    fireEvent.click(screen.getByRole('button', { name: 'Trainer' }));
    expect(document.cookie).toContain('chefer_mode=trainer');
    expect(m.push).toHaveBeenCalledWith('/trainer/today');
    expect(m.capture).toHaveBeenCalledWith('trainer_mode_switched', { to: 'trainer' });
    expect(screen.getByRole('button', { name: 'Trainer' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mode-announcement')).toHaveTextContent('Trainer mode');
  });

  it('in Trainer mode the segment carries no count, and leaving it says personal', () => {
    setTrainer(true, 2);
    m.pathname = '/trainer/today';
    renderSwitch('trainer');
    expect(screen.getByTestId('mode-switch-trainer')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('nav-count-badge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Food' }));
    expect(m.capture).toHaveBeenCalledWith('trainer_mode_switched', { to: 'personal' });
    expect(m.push).toHaveBeenCalledWith('/dashboard');
    expect(screen.getByTestId('mode-announcement')).toHaveTextContent('Personal mode');
  });

  it('a remembered trainer mode falls back to Food once it is gone (§5.1)', () => {
    setTrainer(false);
    m.pathname = '/profile';
    renderSwitch('trainer');
    expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.cookie).toContain('chefer_mode=food');
  });
});

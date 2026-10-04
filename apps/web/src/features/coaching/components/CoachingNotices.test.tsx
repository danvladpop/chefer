// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachingStatusDto, RoutineDto } from '@chefer/types';
import { markRoutineSeen } from '../lib/routine-seen';
import { CoachingNotices } from './CoachingNotices';

const m = vi.hoisted((): { enabled: boolean; status: CoachingStatusDto } => ({
  enabled: true,
  status: { trainer: null, stopped: null },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    coaching: {
      availability: { useQuery: () => ({ data: { enabled: m.enabled, canBeTrainer: false } }) },
      status: { useQuery: () => ({ data: m.enabled ? m.status : undefined }) },
    },
  },
}));

const routine = (changed: boolean): RoutineDto => ({
  id: 'r1',
  name: 'PPL',
  templateKey: null,
  isActive: true,
  nextDayId: null,
  version: 2,
  archived: false,
  updatedAt: '2026-10-02T12:00:00.000Z',
  days: [],
  ...(changed ? { lastEditedByOther: { name: 'Ana', at: '2026-10-02T12:00:00.000Z' } } : {}),
});

beforeEach(() => {
  m.enabled = true;
  m.status = { trainer: null, stopped: null };
  window.localStorage.clear();
});
afterEach(cleanup);

describe('CoachingNotices (Gym Today)', () => {
  it('shows "Ana updated your routine · 2 Oct" until the routine is opened on this device', () => {
    const { unmount } = render(<CoachingNotices routine={routine(true)} />);
    expect(screen.getByTestId('coaching-routine-updated')).toHaveTextContent(
      'Ana updated your routine · 2 Oct',
    );
    unmount();
    markRoutineSeen('r1', '2026-10-02T12:00:00.000Z'); // what opening /gym/routine does
    render(<CoachingNotices routine={routine(true)} />);
    expect(screen.queryByTestId('coaching-routine-updated')).toBeNull();
  });

  it('shows nothing for a routine nobody else changed', () => {
    const { container } = render(<CoachingNotices routine={routine(false)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Ana stopped coaching you" once, until dismissed', () => {
    m.status = { trainer: null, stopped: { trainerName: 'Ana', at: '2026-10-03T08:00:00.000Z' } };
    render(<CoachingNotices routine={routine(false)} />);
    expect(screen.getByTestId('coaching-stopped')).toHaveTextContent('Ana stopped coaching you');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('coaching-stopped')).toBeNull();
    expect(window.localStorage.getItem('chefer.coaching.stoppedDismissed')).toBe(
      '2026-10-03T08:00:00.000Z',
    );
  });

  it('offers to carry on joining after gym setup', () => {
    window.localStorage.setItem('chefer.coaching.pendingJoin', 'ABCD234567');
    render(<CoachingNotices routine={null} />);
    expect(screen.getByRole('link', { name: 'Carry on joining your trainer' })).toHaveAttribute(
      'href',
      '/coaching/join/ABCD234567',
    );
  });

  it('never shows the pending-join line when coaching is off', () => {
    m.enabled = false;
    window.localStorage.setItem('chefer.coaching.pendingJoin', 'ABCD234567');
    const { container } = render(<CoachingNotices routine={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

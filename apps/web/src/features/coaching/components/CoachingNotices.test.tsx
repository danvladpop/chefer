// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachingNoticeDto, CoachingStatusDto } from '@chefer/types';
import { CoachingNotices } from './CoachingNotices';

const m = vi.hoisted(
  (): {
    enabled: boolean;
    status: CoachingStatusDto;
    notices: CoachingNoticeDto[];
    dismiss: ReturnType<typeof vi.fn>;
  } => ({
    enabled: true,
    status: { trainer: null, stopped: null },
    notices: [],
    dismiss: vi.fn(),
  }),
);

// Links keep their onClick (dismiss, remember) but never navigate jsdom.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ coaching: { notices: { invalidate: vi.fn() } } }),
    coaching: {
      availability: { useQuery: () => ({ data: { enabled: m.enabled, canBeTrainer: false } }) },
      status: { useQuery: () => ({ data: m.enabled ? m.status : undefined }) },
      notices: { useQuery: () => ({ data: m.enabled ? m.notices : undefined }) },
      dismissNotice: { useMutation: () => ({ mutate: m.dismiss, isPending: false }) },
    },
  },
}));

const trainer = { id: 't1', name: 'Ana', role: 'TRAINER' as const };
const notice = (over: Partial<CoachingNoticeDto>): CoachingNoticeDto => ({
  id: 'n1',
  kind: 'ROUTINE_UPDATED',
  at: '2026-10-02T12:00:00.000Z',
  read: false,
  other: trainer,
  ...over,
});

beforeEach(() => {
  m.enabled = true;
  m.status = { trainer: null, stopped: null };
  m.notices = [];
  m.dismiss.mockClear();
  window.localStorage.clear();
});
afterEach(cleanup);

describe('CoachingNotices (Gym Today)', () => {
  it('shows "Ana updated your routine" with the changes, and View opens the routine', () => {
    m.notices = [
      notice({
        changes: [
          { kind: 'added', exercise: 'Romanian deadlift' },
          { kind: 'changed', exercise: 'Squat', from: '3×8', to: '4×6' },
          { kind: 'note', exercise: 'Bench press' },
        ],
      }),
    ];
    render(<CoachingNotices />);
    const card = screen.getByTestId('coaching-routine-updated');
    expect(card).toHaveTextContent('Ana updated your routine');
    expect(card).toHaveTextContent('+ Romanian deadlift · Squat 3×8 → 4×6 · note on Bench press');
    const view = screen.getByRole('link', { name: 'View' });
    expect(view).toHaveAttribute('href', '/gym/routine');
    fireEvent.click(view);
    expect(m.dismiss).toHaveBeenCalledWith({ id: 'n1' });
    expect(screen.queryByTestId('coaching-routine-updated')).toBeNull();
  });

  it('Dismiss hides the card and tells the server', () => {
    m.notices = [notice({ kind: 'REQUEST_ACCEPTED' })];
    render(<CoachingNotices />);
    expect(screen.getByText('Ana is now your trainer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(m.dismiss).toHaveBeenCalledWith({ id: 'n1' });
    expect(screen.queryByText('Ana is now your trainer')).toBeNull();
  });

  it('says who ended the coaching, or that the trainer left Chefer', () => {
    m.notices = [
      notice({ id: 'a', kind: 'COACHING_ENDED', endedBy: 'TRAINER' }),
      notice({
        id: 'b',
        kind: 'COACHING_ENDED',
        endedBy: 'SYSTEM',
        other: { id: null, name: 'your trainer', role: 'TRAINER' },
      }),
      notice({ id: 'c', kind: 'REQUEST_DECLINED', other: { ...trainer, name: 'Mihai' } }),
    ];
    render(<CoachingNotices />);
    expect(
      screen.getByText('Ana stopped coaching you. Your routine stays yours.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your trainer stopped using Chefer. Your routine stays yours.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mihai can’t take you on right now')).toBeInTheDocument();
  });

  it('shows nothing for read notices or for notices about the viewer’s own clients', () => {
    m.notices = [
      notice({ read: true }),
      notice({ id: 'x', other: { id: 'c1', name: 'Ada', role: 'CLIENT' } }),
      notice({ id: 'y', kind: 'COACHING_ENDED', endedBy: 'CLIENT' }),
    ];
    const { container } = render(<CoachingNotices />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to carry on joining after gym setup', () => {
    window.localStorage.setItem('chefer.coaching.pendingJoin', 'ABCD234567');
    render(<CoachingNotices />);
    expect(screen.getByRole('link', { name: 'Carry on joining your trainer' })).toHaveAttribute(
      'href',
      '/coaching/join/ABCD234567',
    );
  });

  it('carries on to the trainer’s profile after setup started from Find a trainer', () => {
    window.localStorage.setItem('chefer.coaching.pendingTrainer', 'trainer-1');
    render(<CoachingNotices />);
    expect(screen.getByRole('link', { name: 'Carry on joining your trainer' })).toHaveAttribute(
      'href',
      '/coaching/trainers/trainer-1',
    );
  });

  it('never shows anything when coaching is off', () => {
    m.enabled = false;
    m.notices = [notice({})];
    window.localStorage.setItem('chefer.coaching.pendingJoin', 'ABCD234567');
    const { container } = render(<CoachingNotices />);
    expect(container).toBeEmptyDOMElement();
  });
});

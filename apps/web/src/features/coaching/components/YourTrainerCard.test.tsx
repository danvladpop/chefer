// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachingStatusDto } from '@chefer/types';
import { COACHING_COPY } from '@chefer/types';
import { YourTrainerCard } from './YourTrainerCard';

const m = vi.hoisted(() => ({
  enabled: true,
  status: undefined as CoachingStatusDto | undefined,
  leave: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
// The M3 parts have their own tests (ClientBookings.test.tsx, ConsentUpdateNotice.test.tsx).
vi.mock('./ClientBookings', () => ({ UpcomingBookingsList: () => null }));
vi.mock('./ConsentUpdateNotice', () => ({ ConsentUpdateNotice: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/trpc', () => {
  const invalidate = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        coaching: { status: { invalidate }, trainerCard: { invalidate } },
        gym: { bootstrap: { invalidate } },
      }),
      coaching: {
        availability: {
          useQuery: () => ({ data: { enabled: m.enabled, canBeTrainer: false } }),
        },
        status: { useQuery: () => ({ data: m.status }) },
        leave: { useMutation: () => ({ mutate: m.leave, isPending: false }) },
        cancelRequest: { useMutation: () => ({ mutate: m.cancel, isPending: false }) },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

beforeEach(() => {
  m.enabled = true;
  m.status = { trainer: { name: 'Ana', since: '2026-09-20T09:00:00.000Z' }, stopped: null };
  m.leave.mockClear();
  m.cancel.mockClear();
});
afterEach(cleanup);

describe('YourTrainerCard', () => {
  it('renders nothing when coaching is off for this account', () => {
    m.enabled = false;
    const { container } = render(<YourTrainerCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows who, since when, what they see and can do', () => {
    render(<YourTrainerCard />);
    expect(screen.getByRole('heading', { name: 'Your trainer' })).toBeInTheDocument();
    expect(screen.getByText('Coached by Ana since 20 Sep')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What Ana sees' })).toBeInTheDocument();
    for (const line of COACHING_COPY.consent.willSee)
      expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What Ana can do' })).toBeInTheDocument();
  });

  it('Leave asks first, then leaves from the web', () => {
    render(<YourTrainerCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(m.leave).not.toHaveBeenCalled();
    expect(screen.getByText(COACHING_COPY.yourTrainer.leaveBody('Ana'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave trainer' }));
    expect(m.leave).toHaveBeenCalledWith({ source: 'web' });
  });

  it('shows the "stopped coaching you" notice when the trainer ended the link', () => {
    m.status = { trainer: null, stopped: { trainerName: 'Ana', at: '2026-10-02T09:00:00.000Z' } };
    render(<YourTrainerCard />);
    expect(screen.getByTestId('your-trainer-stopped')).toHaveTextContent(
      'Ana stopped coaching you · 2 Oct',
    );
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
  });

  it('explains how to get a trainer when there is none', () => {
    m.status = { trainer: null, stopped: null };
    render(<YourTrainerCard />);
    expect(screen.getByText(COACHING_COPY.yourTrainer.noTrainer)).toBeInTheDocument();
    expect(screen.getByText(COACHING_COPY.yourTrainer.noTrainerHint)).toBeInTheDocument();
  });

  it('offers Find a trainer when there is no trainer and no request', () => {
    m.status = { trainer: null, stopped: null, request: null };
    render(<YourTrainerCard />);
    expect(screen.getByTestId('find-trainer-entry')).toHaveAttribute('href', '/coaching/find');
    expect(screen.getByText(COACHING_COPY.find.entryHint)).toBeInTheDocument();
  });

  it('shows a pending request with its expiry and cancels it', () => {
    m.status = {
      trainer: null,
      stopped: null,
      request: {
        id: 'r1',
        trainer: { id: 't2', name: 'Mihai' },
        createdAt: '2026-10-17T09:00:00.000Z',
        expiresAt: '2026-10-31T09:00:00.000Z',
      },
    };
    render(<YourTrainerCard />);
    const pending = screen.getByTestId('your-trainer-request');
    expect(pending).toHaveTextContent('Waiting for Mihai to answer');
    expect(pending).toHaveTextContent('Expires 31 Oct');
    expect(screen.queryByTestId('find-trainer-entry')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(m.cancel).toHaveBeenCalledWith({ source: 'web' });
  });

  it('shows a pending switch request next to the current trainer', () => {
    m.status = {
      trainer: { name: 'Ana', since: '2026-09-20T09:00:00.000Z' },
      stopped: null,
      request: {
        id: 'r1',
        trainer: { id: 't2', name: 'Mihai' },
        createdAt: '2026-10-17T09:00:00.000Z',
        expiresAt: '2026-10-31T09:00:00.000Z',
      },
    };
    render(<YourTrainerCard />);
    expect(screen.getByText('Coached by Ana since 20 Sep')).toBeInTheDocument();
    expect(screen.getByTestId('your-trainer-request')).toHaveTextContent(
      'Waiting for Mihai to answer',
    );
  });
});

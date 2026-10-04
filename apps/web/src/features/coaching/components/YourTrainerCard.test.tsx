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
}));

vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/trpc', () => {
  const invalidate = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        coaching: { status: { invalidate } },
        gym: { bootstrap: { invalidate } },
      }),
      coaching: {
        availability: {
          useQuery: () => ({ data: { enabled: m.enabled, canBeTrainer: false } }),
        },
        status: { useQuery: () => ({ data: m.status }) },
        leave: { useMutation: () => ({ mutate: m.leave, isPending: false }) },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

beforeEach(() => {
  m.enabled = true;
  m.status = { trainer: { name: 'Ana', since: '2026-09-20T09:00:00.000Z' }, stopped: null };
  m.leave.mockClear();
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
});

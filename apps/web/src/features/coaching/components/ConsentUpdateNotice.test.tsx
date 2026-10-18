// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoachingStatusDto } from '@chefer/types';
import { ConsentUpdateNotice } from './ConsentUpdateNotice';

const m = vi.hoisted((): { status: CoachingStatusDto; ack: ReturnType<typeof vi.fn> } => ({
  status: { trainer: { name: 'Ana', since: '2026-09-01' }, stopped: null },
  ack: vi.fn(),
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
    useUtils: () => ({ coaching: { status: { invalidate: vi.fn() } } }),
    coaching: {
      availability: { useQuery: () => ({ data: { enabled: true, canBeTrainer: false } }) },
      status: { useQuery: () => ({ data: m.status }) },
      acknowledgeConsentUpdate: {
        useMutation: () => ({ mutate: m.ack, isPending: false, isSuccess: false }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  m.ack.mockClear();
});

describe('ConsentUpdateNotice (consent copy v2, §10)', () => {
  it('shows nothing when the client already saw the new copy', () => {
    render(<ConsentUpdateNotice />);
    expect(screen.queryByTestId('coaching-consent-update')).toBeNull();
  });

  it('says what is new, links to Leave, and Got it records it', () => {
    m.status = {
      trainer: { name: 'Ana', since: '2026-09-01' },
      stopped: null,
      consentUpdate: { trainerName: 'Ana', version: 2 },
    };
    render(<ConsentUpdateNotice />);
    const card = screen.getByTestId('coaching-consent-update');
    expect(card).toHaveTextContent('What’s new with Ana: bookings and logged workouts');
    expect(card).toHaveTextContent('Ana can now book sessions with you and log workouts for you.');
    expect(screen.getByRole('link', { name: 'Leave' })).toHaveAttribute(
      'href',
      '/profile#your-trainer',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(m.ack).toHaveBeenCalled();
  });
});

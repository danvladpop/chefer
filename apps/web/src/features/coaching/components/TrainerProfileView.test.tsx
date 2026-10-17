// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachingStatusDto, TrainerCardDto } from '@chefer/types';
import { COACHING_COPY } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { TrainerProfileView } from './TrainerProfileView';

type MutationOpts = { onSuccess?: () => void; onError?: (e: unknown) => void };

const m = vi.hoisted(
  (): {
    card: {
      data: TrainerCardDto | undefined;
      isLoading: boolean;
      isError: boolean;
      error: unknown;
    };
    status: CoachingStatusDto | undefined;
    request: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    requestOpts: MutationOpts;
  } => ({
    card: { data: undefined, isLoading: false, isError: false, error: null },
    status: undefined,
    request: vi.fn(),
    cancel: vi.fn(),
    requestOpts: {},
  }),
);

vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
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
vi.mock('@/lib/trpc', () => {
  const invalidate = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        coaching: { trainerCard: { invalidate }, status: { invalidate } },
      }),
      coaching: {
        trainerCard: { useQuery: () => ({ ...m.card, refetch: vi.fn() }) },
        status: { useQuery: () => ({ data: m.status }) },
        requestCoaching: {
          useMutation: (opts: MutationOpts) => {
            m.requestOpts = opts;
            return { mutate: m.request, isPending: false };
          },
        },
        cancelRequest: { useMutation: () => ({ mutate: m.cancel, isPending: false }) },
      },
    },
  };
});

const ANA: TrainerCardDto = {
  trainerId: 't1',
  name: 'Ana',
  gymLine: 'Iron Gym, Cluj',
  acceptingClients: true,
  relation: 'NONE',
  currentTrainerName: null,
  pendingRequestTo: null,
  needsGymSetup: false,
};

function withCard(over: Partial<TrainerCardDto>) {
  m.card = { data: { ...ANA, ...over }, isLoading: false, isError: false, error: null };
}

beforeEach(() => {
  withCard({});
  m.status = { trainer: null, stopped: null, request: null };
  m.request.mockClear();
  m.cancel.mockClear();
  window.localStorage.clear();
});
afterEach(cleanup);

describe('TrainerProfileView', () => {
  it('shows the name, badge, gym line and the credentials note', () => {
    render(<TrainerProfileView trainerId="t1" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByTestId('trainer-badge')).toHaveTextContent('Trainer');
    expect(screen.getByText('Iron Gym, Cluj')).toBeInTheDocument();
    expect(screen.getByText(COACHING_COPY.find.unverified)).toBeInTheDocument();
  });

  it('Ask to coach me → consent → sends the request with the local date → sent', () => {
    render(<TrainerProfileView trainerId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask to coach me' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ask Ana to coach you?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(COACHING_COPY.request.noFollow)).toBeInTheDocument();
    expect(m.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow and send request' }));
    expect(m.request).toHaveBeenCalledWith({
      trainerId: 't1',
      source: 'web',
      localDate: localDateStr(),
    });
    act(() => m.requestOpts.onSuccess?.());
    expect(screen.getByTestId('coaching-request-sent')).toHaveTextContent('Request sent to Ana');
  });

  it('says asking ends the current coaching when the client has a trainer', () => {
    withCard({ currentTrainerName: 'Ion' });
    render(<TrainerProfileView trainerId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask to coach me' }));
    expect(screen.getByTestId('coaching-switch-line')).toHaveTextContent(
      'This ends your coaching with Ion when Ana accepts.',
    );
    expect(screen.getByRole('button', { name: 'Allow and send request' })).toBeInTheDocument();
  });

  it('shows a send error on the consent screen', () => {
    render(<TrainerProfileView trainerId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask to coach me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Allow and send request' }));
    act(() => m.requestOpts.onError?.(new Error('This trainer isn’t taking new clients.')));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('replaces Ask with "Not taking new clients" at the client cap', () => {
    withCard({ acceptingClients: false });
    render(<TrainerProfileView trainerId="t1" />);
    expect(screen.getByText('Not taking new clients')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to coach me' })).toBeNull();
  });

  it('blocks a second request while one to another trainer is pending', () => {
    withCard({ pendingRequestTo: 'Mihai' });
    render(<TrainerProfileView trainerId="t1" />);
    expect(screen.getByTestId('trainer-card-other-pending')).toHaveTextContent(
      'You already asked Mihai. Cancel that request first.',
    );
    expect(screen.queryByRole('button', { name: 'Ask to coach me' })).toBeNull();
  });

  it('sends a client without gym setup to set up first, remembering the trainer', () => {
    withCard({ needsGymSetup: true });
    render(<TrainerProfileView trainerId="t1" />);
    const setup = screen.getByRole('link', { name: 'Set up training' });
    expect(setup).toHaveAttribute('href', '/gym/setup');
    fireEvent.click(setup);
    expect(window.localStorage.getItem('chefer.coaching.pendingTrainer')).toBe('t1');
    expect(screen.queryByRole('button', { name: 'Ask to coach me' })).toBeNull();
  });

  it('a pending request to this trainer shows its expiry and can be cancelled', () => {
    withCard({ relation: 'REQUESTED' });
    m.status = {
      trainer: null,
      stopped: null,
      request: {
        id: 'r1',
        trainer: { id: 't1', name: 'Ana' },
        createdAt: '2026-10-17T09:00:00.000Z',
        expiresAt: '2026-10-31T09:00:00.000Z',
      },
    };
    render(<TrainerProfileView trainerId="t1" />);
    expect(screen.getByText('Waiting for Ana to answer')).toBeInTheDocument();
    expect(screen.getByText('Expires 31 Oct')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(m.cancel).toHaveBeenCalledWith({ source: 'web' });
  });

  it('says so when this trainer already coaches the client', () => {
    withCard({ relation: 'YOUR_TRAINER' });
    render(<TrainerProfileView trainerId="t1" />);
    expect(screen.getByText('Ana is your trainer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to coach me' })).toBeNull();
  });

  it('NOT_FOUND reads "This trainer isn’t available"', () => {
    m.card = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { code: 'NOT_FOUND' }, message: 'Not found' },
    };
    render(<TrainerProfileView trainerId="nope" />);
    expect(screen.getByTestId('trainer-unavailable')).toHaveTextContent(
      'This trainer isn’t available',
    );
  });
});

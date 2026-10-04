// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitePreviewDto } from '@chefer/types';
import { COACHING_COPY } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { JoinFlow } from './JoinFlow';

const m = vi.hoisted(
  (): {
    preview: { data: InvitePreviewDto | undefined; isLoading: boolean; isError: boolean };
    join: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
  } => ({
    preview: { data: undefined, isLoading: false, isError: false },
    join: vi.fn(),
    push: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
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
        coaching: { status: { invalidate } },
        gym: { bootstrap: { invalidate }, routine: { get: { invalidate } } },
      }),
      coaching: {
        previewInvite: { useQuery: () => m.preview },
        join: { useMutation: () => ({ mutate: m.join, isPending: false }) },
      },
    },
  };
});

const OK: InvitePreviewDto = {
  state: 'OK',
  trainerName: 'Ana',
  currentTrainerName: null,
  needsGymSetup: false,
};

beforeEach(() => {
  m.join.mockClear();
  m.push.mockClear();
  window.localStorage.clear();
  m.preview = { data: OK, isLoading: false, isError: false };
});
afterEach(cleanup);

describe('JoinFlow', () => {
  it.each([
    ['EXPIRED', COACHING_COPY.inviteState.EXPIRED],
    ['USED', COACHING_COPY.inviteState.USED],
    ['REVOKED', COACHING_COPY.inviteState.REVOKED],
    ['SELF', COACHING_COPY.inviteState.SELF],
    ['NOT_FOUND', COACHING_COPY.inviteState.NOT_FOUND],
  ] as const)('shows the %s copy and no consent screen', (state, copy) => {
    m.preview = {
      data: { ...OK, state, trainerName: null },
      isLoading: false,
      isError: false,
    };
    render(<JoinFlow code="ABCD234567" />);
    expect(screen.getByTestId('coaching-invite-message')).toHaveTextContent(copy);
    expect(screen.queryByRole('button', { name: COACHING_COPY.consent.allow })).toBeNull();
  });

  it('names the trainer when the client is already coached by them', () => {
    m.preview = { data: { ...OK, state: 'ALREADY_YOURS' }, isLoading: false, isError: false };
    render(<JoinFlow code="ABCD234567" />);
    expect(screen.getByTestId('coaching-invite-message')).toHaveTextContent(
      COACHING_COPY.inviteState.ALREADY_YOURS('Ana'),
    );
  });

  it('treats a failed preview (flag off, bad code) like an unknown code', () => {
    m.preview = { data: undefined, isLoading: false, isError: true };
    render(<JoinFlow code="nope" />);
    expect(screen.getByTestId('coaching-invite-message')).toHaveTextContent(
      COACHING_COPY.inviteState.NOT_FOUND,
    );
  });

  it('sends a client without gym setup to setup first and remembers the code', () => {
    m.preview = { data: { ...OK, needsGymSetup: true }, isLoading: false, isError: false };
    render(<JoinFlow code="ABCD234567" />);
    expect(screen.getByText(COACHING_COPY.consent.needsSetup)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Set up training' });
    expect(link).toHaveAttribute('href', '/gym/setup');
    link.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot navigate
    fireEvent.click(link);
    expect(window.localStorage.getItem('chefer.coaching.pendingJoin')).toBe('ABCD234567');
  });

  it('shows the consent screen and joins from the web with source "web"', () => {
    render(<JoinFlow code="ABCD234567" />);
    expect(
      screen.getByRole('heading', { level: 1, name: COACHING_COPY.consent.title('Ana') }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: COACHING_COPY.consent.allow }));
    expect(m.join).toHaveBeenCalledWith({
      code: 'ABCD234567',
      source: 'web',
      localDate: localDateStr(),
    });
  });

  it('Not now leaves without joining', () => {
    render(<JoinFlow code="ABCD234567" />);
    fireEvent.click(screen.getByRole('button', { name: COACHING_COPY.consent.notNow }));
    expect(m.join).not.toHaveBeenCalled();
    expect(m.push).toHaveBeenCalledWith('/gym');
  });

  it('offers the app on a phone, then continues on the web', () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone)',
      configurable: true,
    });
    try {
      render(<JoinFlow code="ABCD234567" />);
      const open = screen.getByRole('link', { name: COACHING_COPY.consent.openInApp });
      expect(open).toHaveAttribute('href', 'chefer://coaching/join/ABCD234567');
      expect(screen.queryByRole('button', { name: COACHING_COPY.consent.allow })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: COACHING_COPY.consent.continueOnWeb }));
      expect(screen.getByRole('button', { name: COACHING_COPY.consent.allow })).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
    }
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsubscribeView } from './unsubscribe-view';

type Hoisted = {
  token: string | null;
  mutate: ReturnType<typeof vi.fn>;
  state: Record<string, unknown>;
};
const m = vi.hoisted(
  (): Hoisted => ({
    token: 'signed.token',
    mutate: vi.fn(),
    state: {},
  }),
);

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => m.token }),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      unsubscribe: { useMutation: () => ({ mutate: m.mutate, ...m.state }) },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.token = 'signed.token';
  m.state = { isError: false, isPending: true, data: undefined, variables: undefined };
});

describe('UnsubscribeView (P2-5)', () => {
  it('unsubscribes once, from the browser, with the link token', () => {
    render(<UnsubscribeView />);
    expect(m.mutate).toHaveBeenCalledTimes(1);
    expect(m.mutate).toHaveBeenCalledWith({ token: 'signed.token' });
    expect(screen.getByRole('status').textContent).toContain('Updating');
  });

  it('confirms which email stopped and offers Undo', () => {
    m.state = {
      isError: false,
      isPending: false,
      data: { scope: 'WEEK_READY', weekReady: false, weeklyRecap: true },
      variables: { token: 'signed.token' },
    };
    render(<UnsubscribeView />);
    expect(screen.getByRole('status').textContent).toContain(
      'unsubscribed from the Monday "your week is ready" email',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(m.mutate).toHaveBeenLastCalledWith({ token: 'signed.token', resubscribe: true });
  });

  it('an invalid link points to Preferences and sends nothing without a token', () => {
    m.token = null;
    render(<UnsubscribeView />);
    expect(m.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('This unsubscribe link is invalid or has expired.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Preferences' }).getAttribute('href')).toBe(
      '/preferences',
    );
  });
});

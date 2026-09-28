// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyEmailToggles } from './weekly-email-toggles';

type Hoisted = {
  save: ReturnType<typeof vi.fn>;
  resend: ReturnType<typeof vi.fn>;
  resendState: { isSuccess: boolean; isPending: boolean; isError: boolean; data: unknown };
  dismissNotice: ReturnType<typeof vi.fn>;
  emailDefaultsNoticeAt: string | null;
};
const m = vi.hoisted(
  (): Hoisted => ({
    save: vi.fn(),
    resend: vi.fn(),
    resendState: { isSuccess: false, isPending: false, isError: false, data: undefined },
    dismissNotice: vi.fn(),
    // T-39.3: default "already seen" so it doesn't appear in unrelated tests.
    emailDefaultsNoticeAt: '2026-01-01T00:00:00.000Z',
  }),
);

vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      setEmailPreferences: {
        useMutation: () => ({ mutate: m.save, isPending: false, isError: false }),
      },
      resendConfirmation: {
        useMutation: () => ({ mutate: m.resend, error: null, ...m.resendState }),
      },
    },
    user: {
      me: {
        useQuery: () => ({ data: { emailDefaultsNoticeAt: m.emailDefaultsNoticeAt } }),
      },
      dismissEmailDefaultsNotice: {
        useMutation: () => ({ mutate: m.dismissNotice, isPending: false, isError: false }),
      },
    },
    useUtils: () => ({ user: { me: { setData: vi.fn() } } }),
  },
}));

const PREFS = {
  weekReady: true,
  weeklyRecap: true,
  emailConfirmed: true,
  email: 'ana@chefer.dev',
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.resendState = { isSuccess: false, isPending: false, isError: false, data: undefined };
  m.emailDefaultsNoticeAt = '2026-01-01T00:00:00.000Z';
});

describe('WeeklyEmailToggles (P2-5)', () => {
  it('switches off the Monday email only', () => {
    render(<WeeklyEmailToggles initial={PREFS} />);
    const monday = screen.getByRole('switch', { name: 'Monday: your week is ready' });
    const sunday = screen.getByRole('switch', { name: 'Sunday: your week in review' });
    fireEvent.click(monday);
    expect(m.save).toHaveBeenCalledWith({ weekReady: false });
    expect(monday.getAttribute('aria-checked')).toBe('false');
    expect(sunday.getAttribute('aria-checked')).toBe('true');
  });

  it('shows where the emails go, and no confirmation prompt once confirmed', () => {
    render(<WeeklyEmailToggles initial={PREFS} />);
    expect(screen.getByText('Sent to ana@chefer.dev.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send confirmation link' })).toBeNull();
  });

  it('an unconfirmed address can request the confirmation link', () => {
    render(<WeeklyEmailToggles initial={{ ...PREFS, emailConfirmed: false }} />);
    expect(screen.getByText('Confirm your email address to start getting these.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }));
    expect(m.resend).toHaveBeenCalled();
  });

  it('says the link was sent', () => {
    m.resendState = {
      isSuccess: true,
      isPending: false,
      isError: false,
      data: { alreadyConfirmed: false },
    };
    render(<WeeklyEmailToggles initial={{ ...PREFS, emailConfirmed: false }} />);
    expect(screen.getByRole('status').textContent).toContain('Check your inbox');
  });

  describe('email-defaults notice (T-39.3)', () => {
    it('stays hidden once already seen (the default)', () => {
      render(<WeeklyEmailToggles initial={PREFS} />);
      expect(screen.queryByTestId('email-defaults-notice')).toBeNull();
    });

    it('stays hidden for a never-seen account whose digests are already off', () => {
      m.emailDefaultsNoticeAt = null;
      render(<WeeklyEmailToggles initial={{ ...PREFS, weekReady: false, weeklyRecap: false }} />);
      expect(screen.queryByTestId('email-defaults-notice')).toBeNull();
    });

    it('shows for a never-seen account with at least one digest on', () => {
      m.emailDefaultsNoticeAt = null;
      render(<WeeklyEmailToggles initial={PREFS} />);
      expect(screen.getByTestId('email-defaults-notice')).toBeTruthy();
    });

    it('"Keep them on" dismisses without touching the switches', () => {
      m.emailDefaultsNoticeAt = null;
      render(<WeeklyEmailToggles initial={PREFS} />);
      fireEvent.click(screen.getByRole('button', { name: 'Keep them on' }));
      expect(m.dismissNotice).toHaveBeenCalled();
      expect(m.save).not.toHaveBeenCalled();
    });

    it('"Turn them off" flips both switches off and dismisses', () => {
      m.emailDefaultsNoticeAt = null;
      render(<WeeklyEmailToggles initial={PREFS} />);
      fireEvent.click(screen.getByRole('button', { name: 'Turn them off' }));
      expect(m.save).toHaveBeenCalledWith({ weekReady: false, weeklyRecap: false });
      expect(m.dismissNotice).toHaveBeenCalled();
      const monday = screen.getByRole('switch', { name: 'Monday: your week is ready' });
      const sunday = screen.getByRole('switch', { name: 'Sunday: your week in review' });
      expect(monday.getAttribute('aria-checked')).toBe('false');
      expect(sunday.getAttribute('aria-checked')).toBe('false');
    });
  });
});

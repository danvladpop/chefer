// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyEmailToggles } from './weekly-email-toggles';

type Hoisted = {
  save: ReturnType<typeof vi.fn>;
  resend: ReturnType<typeof vi.fn>;
  resendState: { isSuccess: boolean; isPending: boolean; isError: boolean; data: unknown };
};
const m = vi.hoisted(
  (): Hoisted => ({
    save: vi.fn(),
    resend: vi.fn(),
    resendState: { isSuccess: false, isPending: false, isError: false, data: undefined },
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
});

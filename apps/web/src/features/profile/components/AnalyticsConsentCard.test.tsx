// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsConsentCard } from './AnalyticsConsentCard';

// Backlog P0-6: linking analytics to the account is opt-in, default off.

type Consent = 'granted' | 'denied';
const m: { consent: Consent; set: ReturnType<typeof vi.fn> } = vi.hoisted(() => ({
  consent: 'denied',
  set: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: { user: { me: { useQuery: () => ({ data: { id: 'user-1' } }) } } },
}));

vi.mock('@/lib/analytics', () => ({
  getAnalyticsConsent: () => m.consent,
  setAnalyticsConsent: (userId: string, consent: Consent) => {
    m.set(userId, consent);
    m.consent = consent;
  },
}));

beforeEach(() => {
  m.consent = 'denied';
  m.set.mockClear();
});
afterEach(cleanup);

describe('AnalyticsConsentCard', () => {
  it('is off by default and says only anonymous usage is counted', () => {
    render(<AnalyticsConsentCard />);
    expect(screen.getByRole('switch')).toHaveProperty('ariaChecked', 'false');
    expect(screen.getByText(/only count anonymous usage/)).toBeTruthy();
  });

  it('turning it on records consent for this account', () => {
    render(<AnalyticsConsentCard />);
    fireEvent.click(screen.getByRole('switch'));
    expect(m.set).toHaveBeenCalledWith('user-1', 'granted');
    expect(screen.getByRole('switch')).toHaveProperty('ariaChecked', 'true');
  });

  it('shows a stored grant and lets the user withdraw it', () => {
    m.consent = 'granted';
    render(<AnalyticsConsentCard />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveProperty('ariaChecked', 'true');
    fireEvent.click(toggle);
    expect(m.set).toHaveBeenCalledWith('user-1', 'denied');
  });
});

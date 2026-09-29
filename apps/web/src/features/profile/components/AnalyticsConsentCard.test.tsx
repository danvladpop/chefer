// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsConsentCard } from './AnalyticsConsentCard';

// Backlog P0-6, T-12.3: anonymous counting defaults on (Q-8); linking to the
// account is opt-in, default off, and disabled while anonymous is off.

type Consent = 'granted' | 'denied';
const m: {
  anonymous: Consent;
  linked: Consent;
  setAnonymous: ReturnType<typeof vi.fn>;
  setLinked: ReturnType<typeof vi.fn>;
} = vi.hoisted(() => ({
  anonymous: 'granted',
  linked: 'denied',
  setAnonymous: vi.fn(),
  setLinked: vi.fn(),
}));

const recordConsentMutate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/trpc', () => ({
  trpc: {
    user: { me: { useQuery: () => ({ data: { id: 'user-1' } }) } },
    privacy: {
      recordAnalyticsConsent: { useMutation: () => ({ mutate: recordConsentMutate }) },
    },
  },
}));

vi.mock('@/lib/analytics', () => ({
  getAnonymousAnalyticsConsent: () => m.anonymous,
  setAnonymousAnalyticsConsent: (userId: string, consent: Consent) => {
    m.setAnonymous(userId, consent);
    m.anonymous = consent;
  },
  getAnalyticsConsent: () => m.linked,
  setAnalyticsConsent: (userId: string, consent: Consent) => {
    m.setLinked(userId, consent);
    m.linked = consent;
  },
}));

beforeEach(() => {
  m.anonymous = 'granted';
  m.linked = 'denied';
  m.setAnonymous.mockClear();
  m.setLinked.mockClear();
  recordConsentMutate.mockClear();
});
afterEach(cleanup);

function switches(): [HTMLElement, HTMLElement] {
  const [anonymous, linked] = screen.getAllByRole('switch');
  if (!anonymous || !linked) throw new Error('expected two switches');
  return [anonymous, linked];
}

describe('AnalyticsConsentCard', () => {
  it('defaults to anonymous on, linked off', () => {
    render(<AnalyticsConsentCard />);
    const [anonymous, linked] = switches();
    expect(anonymous).toHaveProperty('ariaChecked', 'true');
    expect(linked).toHaveProperty('ariaChecked', 'false');
  });

  it('turning linking on records consent for this account and logs it server-side', () => {
    render(<AnalyticsConsentCard />);
    const [, linked] = switches();
    fireEvent.click(linked);
    expect(m.setLinked).toHaveBeenCalledWith('user-1', 'granted');
    expect(recordConsentMutate).toHaveBeenCalledWith({ linked: true });
  });

  it('turning anonymous off also turns linking off and logs both', () => {
    m.linked = 'granted';
    render(<AnalyticsConsentCard />);
    const [anonymous] = switches();
    fireEvent.click(anonymous);
    expect(m.setAnonymous).toHaveBeenCalledWith('user-1', 'denied');
    expect(recordConsentMutate).toHaveBeenCalledWith({ anonymous: false, linked: false });
    const [, linked] = switches();
    expect(linked).toHaveProperty('ariaChecked', 'false');
  });

  it('the "linked" switch is disabled while anonymous is off', () => {
    m.anonymous = 'denied';
    render(<AnalyticsConsentCard />);
    const [, linked] = switches();
    expect(linked).toHaveProperty('disabled', true);
  });

  it('shows a stored linked grant and lets the user withdraw it', () => {
    m.linked = 'granted';
    render(<AnalyticsConsentCard />);
    const [, linked] = switches();
    expect(linked).toHaveProperty('ariaChecked', 'true');
    fireEvent.click(linked);
    expect(m.setLinked).toHaveBeenCalledWith('user-1', 'denied');
  });
});

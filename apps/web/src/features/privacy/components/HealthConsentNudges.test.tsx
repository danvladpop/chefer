// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setHealthConsentDeclined } from '../health-declined-flag';
import {
  HealthConsentLaunchPrompt,
  HealthConsentTodayNotice,
  resetHealthConsentLaunchPromptForTests,
} from './HealthConsentNudges';

// UX-26: Q-7 launch prompt (existing data kept, asked once per session) and the
// dashboard card after "Don't save it". Web twin of the mobile nudges test.

const m = vi.hoisted(() => ({
  user: { healthDataConsentAt: null as Date | null },
  prefs: undefined as unknown,
  grant: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@chefer/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/ui')>()),
  Sheet: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children: unknown;
    footer?: unknown;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children as never}
        {footer as never}
      </div>
    ) : null,
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      user: {
        me: {
          setData: vi.fn(),
          getData: () => m.user,
          fetch: () => Promise.resolve(m.user),
          invalidate: vi.fn(),
        },
      },
    }),
    user: { me: { useQuery: () => ({ data: m.user }) } },
    preferences: { get: { useQuery: () => ({ data: m.prefs }) } },
    privacy: {
      grantHealthConsent: {
        useMutation: () => ({
          mutate: (_i: unknown, opts?: { onSuccess?: () => void }) => {
            m.grant();
            opts?.onSuccess?.();
          },
          reset: () => undefined,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const WITH_ALLERGY = {
  dietaryPreferences: { allergies: ['Peanuts'], dietaryRestrictions: [], dislikedIngredients: [] },
  chefProfile: null,
};
const EMPTY = {
  dietaryPreferences: { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
  chefProfile: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { healthDataConsentAt: null };
  m.prefs = WITH_ALLERGY;
  window.localStorage.clear();
  resetHealthConsentLaunchPromptForTests();
});
afterEach(cleanup);

describe('HealthConsentLaunchPrompt (Q-7)', () => {
  it('asks once when health data exists but consent does not, and changes nothing when declined', () => {
    const view = render(<HealthConsentLaunchPrompt />);
    expect(screen.getByTestId('health-consent-allow')).toBeTruthy();
    fireEvent.click(screen.getByTestId('health-consent-decline'));
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
    expect(m.grant).not.toHaveBeenCalled();

    view.rerender(<HealthConsentLaunchPrompt />);
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it('stays quiet when consent is on record', () => {
    m.user = { healthDataConsentAt: new Date() };
    render(<HealthConsentLaunchPrompt />);
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it('stays quiet when no health data is stored', () => {
    m.prefs = EMPTY;
    render(<HealthConsentLaunchPrompt />);
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });
});

describe('HealthConsentTodayNotice (AC2)', () => {
  it('is hidden for a user who has not declined', () => {
    render(<HealthConsentTodayNotice />);
    expect(screen.queryByTestId('health-consent-notice-card')).toBeNull();
  });

  it('shows after "Don\'t save it", reopens the sheet and can be dismissed', () => {
    setHealthConsentDeclined(true);
    render(<HealthConsentTodayNotice />);
    expect(screen.getByText('Plans aren’t being checked for allergies')).toBeTruthy();

    fireEvent.click(screen.getByText('Allow health information'));
    expect(screen.getByTestId('health-consent-allow')).toBeTruthy();
    fireEvent.click(screen.getByTestId('health-consent-decline'));
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByTestId('health-consent-notice-card')).toBeNull();
  });

  it('is hidden once consent is on record', () => {
    setHealthConsentDeclined(true);
    m.user = { healthDataConsentAt: new Date() };
    render(<HealthConsentTodayNotice />);
    expect(screen.queryByTestId('health-consent-notice-card')).toBeNull();
  });
});

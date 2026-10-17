// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TierRow } from './TierRow';

// F6/F7 (owner feedback 2026-10-17), web parity of the mobile You tier row:
// the tier first on Profile. Free opens the overview (every benefit, Turn on
// Premium); Premium is status only and jumps to what they have.

const mocks = vi.hoisted(() => ({
  tier: undefined as 'free' | 'premium' | 'admin' | undefined,
  capture: vi.fn(),
}));

vi.mock('@/hooks/useTier', () => ({ useTier: () => mocks.tier }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/analytics', () => ({ capture: mocks.capture }));
vi.mock('@/features/flags/use-flags', () => ({ useFlags: () => ({}) }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ memberCount: 0 }) }));
vi.mock('@/features/premium/components/PostUpgradeActivation', () => ({
  ACTIVATION_EVENT: 'e',
  ACTIVATION_FLAG: 'f',
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ invalidate: vi.fn() }),
    preferences: { get: { useQuery: () => ({ data: { jobs: ['PLAN_MEALS'] } }) } },
    household: { list: { useQuery: () => ({ data: [] }) } },
    user: {
      upgradePlan: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); // the Sheet's scroll lock
  mocks.tier = 'free';
});
afterEach(cleanup);

describe('TierRow', () => {
  it('a free user sees their plan, and a tap shows every benefit Premium adds', () => {
    render(<TierRow />);
    const row = screen.getByTestId('profile-tier-row');
    expect(row.textContent).toContain('Free plan');
    expect(row.textContent).toContain('See what Premium adds');

    fireEvent.click(within(row).getByRole('button'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Everything Premium adds')).toBeTruthy();
    // The overview opens with "Also included" unfolded.
    expect(dialog.querySelector('details')?.open).toBe(true);
    expect(within(dialog).getByText(/Portions for your table/)).toBeTruthy();
    expect(mocks.capture).toHaveBeenCalledWith('upgrade_prompt_shown', {
      source: 'tier-row',
      job: 'overview',
    });
  });

  it('a premium user sees status only, linking to what they have', () => {
    mocks.tier = 'premium';
    render(<TierRow />);
    const row = screen.getByTestId('profile-tier-row');
    expect(row.textContent).toContain('Premium plan');
    expect(row.textContent).toContain('Included · What you have');
    expect(row.getAttribute('href')).toBe('#plan');
    expect(screen.queryByText('See what Premium adds')).toBeNull();
  });

  it('an admin sees Premium status with no link (no plan card to jump to)', () => {
    mocks.tier = 'admin';
    render(<TierRow />);
    const row = screen.getByTestId('profile-tier-row');
    expect(row.textContent).toContain('Premium plan');
    expect(row.textContent).toContain('Included with admin access');
    expect(row.tagName).not.toBe('A');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('shows nothing until the plan is known', () => {
    mocks.tier = undefined;
    render(<TierRow />);
    expect(screen.queryByTestId('profile-tier-row')).toBeNull();
  });
});

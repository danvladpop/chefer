// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdSection } from './household-section';

// Backlog P2-3: members are free (safety), scaling is premium; the free ghost
// reflects the chip tapped (F-PM-12); removing a member asks first (F-ONB-3-2).
const m = vi.hoisted(() => {
  const noState: Record<string, unknown> = {};
  return {
    members: [] as Record<string, unknown>[],
    isPremium: false,
    remove: vi.fn(),
    add: vi.fn(),
    updateSafety: vi.fn(),
    ownSafety: { allergies: [] as string[], dietaryRestrictions: [] as string[] },
    // UX-ACC-03: the two loads can fail independently.
    listState: noState,
    prefsState: noState,
    table: { people: [] as Record<string, unknown>[], hasRules: false, needsReview: false },
  };
});
// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in privacy/use-health-consent.test.tsx, so here consent is always on record.
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: ({ source }: { source: string }) => <button>Upgrade ({source})</button>,
}));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => m.isPremium }));
vi.mock('@chefer/ui', () => ({
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
vi.mock('@/lib/trpc', () => {
  const invalidate = () => Promise.resolve();
  const mutation = (fn: (...args: unknown[]) => unknown) => () => ({
    mutate: fn,
    isPending: false,
    error: null,
  });
  return {
    trpc: {
      useUtils: () => ({
        household: { list: { invalidate } },
        preferences: { get: { invalidate } },
        mealPlan: { invalidate },
        shoppingList: { invalidate },
      }),
      household: {
        list: { useQuery: () => ({ data: m.members, isLoading: false, ...m.listState }) },
        add: { useMutation: mutation((...a) => m.add(...a)) },
        update: { useMutation: mutation(() => undefined) },
        remove: { useMutation: mutation((...a) => m.remove(...a)) },
      },
      // T-01.7: the "You" row and the table summary line.
      preferences: {
        get: {
          useQuery: () => ({
            data: { dietaryPreferences: m.ownSafety },
            ...m.prefsState,
          }),
        },
        updateSafety: { useMutation: mutation((...a) => m.updateSafety(...a)) },
      },
      safety: {
        getTable: { useQuery: () => ({ data: m.table }) },
      },
    },
  };
});

const owner = { allergies: [], dietaryRestrictions: [] };
const sam = {
  id: 'm1',
  name: 'Sam',
  portionFactor: 0.5,
  isKid: true,
  allergies: ['peanuts'],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.members = [];
  m.listState = {};
  m.prefsState = {};
  m.isPremium = false;
  m.ownSafety = { allergies: [], dietaryRestrictions: [] };
  m.table = { people: [], hasRules: false, needsReview: false };
});

describe('HouseholdSection', () => {
  it('free ghost: the kid chip shows a sample kid at ½ portion with an allergy (F-PM-12)', () => {
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    fireEvent.click(screen.getByRole('button', { name: '+ add a kid' }));
    const sample = screen.getByTestId('household-ghost-sample');
    expect(sample.textContent).toContain('Sam');
    expect(sample.textContent).toContain('½ portion');
    expect(sample.textContent).toContain('peanuts');
    expect(sample.textContent).toContain('2 servings');
  });

  it('free users can add a member for real from the ghost — safety is free', () => {
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    fireEvent.click(screen.getByRole('button', { name: '+ add a kid' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a kid — free/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add someone to your table' });
    expect(dialog).toBeTruthy();
    // The kid preset starts at ½ portion.
    expect(screen.getByRole('button', { name: '½ · kid' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to my table' }));
    expect(m.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sam', portionFactor: 0.5, isKid: true }),
    );
  });

  it('UX-PLAN-12: a kid gets age chips that pre-fill the portion and are sent with the member', () => {
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    fireEvent.click(screen.getByRole('button', { name: '+ add a kid' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a kid — free/ }));
    expect(screen.getByTestId('member-age-group')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Age 14–17' }));
    expect(screen.getByRole('button', { name: 'Age 14–17' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // Pre-filled to 1¼, still adjustable.
    expect(screen.getByRole('button', { name: '1¼ · hearty' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to my table' }));
    expect(m.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ana', isKid: true, ageBand: 'TEEN', portionFactor: 1.25 }),
    );
  });

  it('UX-PLAN-12: age chips are hidden for a non-kid, and the stored band shows on the member', () => {
    m.members = [{ ...sam, ageBand: 'CHILD' }];
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    expect(screen.getByText(/4–8 · /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sam' }));
    expect(screen.getByRole('button', { name: 'Age 4–8' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByLabelText('This is a kid'));
    expect(screen.queryByTestId('member-age-group')).toBeNull();
  });

  it('a free table with members can edit them and sees the scaling upsell', () => {
    m.members = [sam];
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    expect(screen.getByRole('button', { name: 'Edit Sam' })).toBeTruthy();
    expect(screen.getByText(/sized for one portion/)).toBeTruthy();
    expect(screen.getByText('2 at the table')).toBeTruthy();
  });

  it('premium shows the table portions it cooks for', () => {
    m.members = [sam];
    m.isPremium = true;
    render(<HouseholdSection isPremium ownerSafety={owner} />);
    expect(screen.getByText('cooking for 2')).toBeTruthy();
    expect(screen.queryByText(/sized for one portion/)).toBeNull();
  });

  it('removing a member asks for confirmation first (F-ONB-3-2)', () => {
    m.members = [sam];
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));
    expect(m.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/stop applying to your plans/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(m.remove).toHaveBeenCalledWith({ id: 'm1' });
  });

  it('the section is an anchor Profile and Preferences link to', () => {
    const { container } = render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    expect(container.querySelector('section#household')).not.toBeNull();
  });

  it('a "You" row is always shown and opens the safety editor (UX-01)', () => {
    m.ownSafety = { allergies: ['Tree nuts'], dietaryRestrictions: [] };
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    const youButton = screen.getByRole('button', { name: 'Allergies & diet for you' });
    expect(youButton.textContent).toContain('allergic: Tree nuts');
    fireEvent.click(youButton);
    expect(screen.getByRole('dialog', { name: 'Allergies & diet for you' })).toBeTruthy();
  });

  it('shows the table read-back summary once the table has rules (CI-41)', () => {
    m.members = [sam];
    m.table = {
      people: [
        { who: 'you', isOwner: true, items: [], notes: [] },
        {
          who: 'Sam',
          isOwner: false,
          items: [{ id: 'peanuts', label: 'Peanuts', kind: 'allergy' }],
          notes: [],
        },
      ],
      hasRules: true,
      needsReview: false,
    };
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    expect(screen.getByText('2 at the table · we’ll check for Peanuts (Sam)')).toBeTruthy();
  });

  it('the onboarding variant skips the "You" row and the table summary', () => {
    m.members = [sam];
    m.table = { people: [], hasRules: true, needsReview: false };
    render(<HouseholdSection isPremium={false} ownerSafety={owner} variant="onboarding" />);
    expect(screen.queryByRole('button', { name: 'Allergies & diet for you' })).toBeNull();
  });

  // UX-ACC-01: a typed-but-unadded "Something else?" term must be in what Save stores.
  it('adds a typed "sesame" to the new member when Add to my table is pressed', () => {
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    fireEvent.click(screen.getByRole('button', { name: '+ add a kid' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a kid — free/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'sesame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to my table' }));

    expect(m.add).toHaveBeenCalledTimes(1);
    const [payload] = m.add.mock.calls[0] as [{ allergies: string[] }];
    expect(payload.allergies).toContain('Sesame');
  });

  it('adds a typed "sesame" to your own allergies when Save changes is pressed', () => {
    m.ownSafety = { allergies: ['Peanuts'], dietaryRestrictions: [] };
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allergies & diet for you' }));
    fireEvent.change(screen.getByLabelText('Something else?'), { target: { value: 'sesame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(m.updateSafety).toHaveBeenCalledTimes(1);
    const [payload] = m.updateSafety.mock.calls[0] as [{ allergies: string[] }];
    expect(payload.allergies).toEqual(expect.arrayContaining(['Peanuts', 'Sesame']));
  });

  // UX-ACC-03: a failed load must not read as "just you", nor seed "You" with nothing.
  it('shows an error with a retry — not an empty table — when the household failed to load', () => {
    const refetch = vi.fn();
    m.listState = { data: undefined, isError: true, refetch };
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    expect(screen.getByTestId('household-load-error')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ add a kid' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('does not offer "You" until the saved preferences loaded', () => {
    const refetch = vi.fn();
    m.prefsState = { data: undefined, isError: true, refetch };
    render(<HouseholdSection isPremium={false} ownerSafety={owner} />);
    expect(screen.queryByRole('button', { name: 'Allergies & diet for you' })).toBeNull();
    expect(screen.getByTestId('household-you-unavailable').textContent).toContain('Couldn’t load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});

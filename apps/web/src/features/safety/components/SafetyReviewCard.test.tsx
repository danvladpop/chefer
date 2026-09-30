// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SafetyReviewCard } from './SafetyReviewCard';

// T-01.3 — the one-time free-text migration card (UX-01 (b), AC9).

const m = vi.hoisted(() => ({
  confirm: vi.fn(),
  updateSafety: vi.fn(),
  table: { people: [] as unknown[], hasRules: false, needsReview: false },
  ownSafety: { allergies: [] as string[], dietaryRestrictions: [] as string[] },
}));

// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in privacy/use-health-consent.test.tsx, so here consent is always on record.
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

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

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      safety: { getTable: { invalidate: () => Promise.resolve() } },
      preferences: { get: { invalidate: () => Promise.resolve() } },
      mealPlan: { invalidate: () => Promise.resolve() },
    }),
    safety: {
      getTable: { useQuery: () => ({ data: m.table }) },
      confirmReview: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: () => {
            m.confirm();
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
    preferences: {
      get: { useQuery: () => ({ data: { dietaryPreferences: m.ownSafety } }) },
      updateSafety: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            m.updateSafety(input);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.table = { people: [], hasRules: false, needsReview: false };
  m.ownSafety = { allergies: [], dietaryRestrictions: [] };
});

describe('SafetyReviewCard (T-01.3)', () => {
  it('renders nothing when nothing needs review', () => {
    const { container } = render(<SafetyReviewCard />);
    expect(container.firstChild).toBeNull();
  });

  it('maps legacy free text and confirms with "Looks right" (AC9)', () => {
    m.table = { people: [], hasRules: true, needsReview: true };
    m.ownSafety = { allergies: ['tree nuts'], dietaryRestrictions: ['no eggs'] };
    render(<SafetyReviewCard />);
    expect(screen.getByText('“tree nuts” → Tree nuts')).toBeTruthy();
    expect(screen.getByText('“no eggs” → Vegetarian, no eggs')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }));
    expect(m.confirm).toHaveBeenCalledTimes(1);
  });

  it('"Change" opens the picker pre-applied; Save updates then confirms', () => {
    m.table = { people: [], hasRules: true, needsReview: true };
    m.ownSafety = { allergies: ['tree nuts'], dietaryRestrictions: [] };
    render(<SafetyReviewCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('checkbox', { name: 'Tree nuts' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(m.updateSafety).toHaveBeenCalledTimes(1);
    expect(m.confirm).toHaveBeenCalledTimes(1);
  });
});

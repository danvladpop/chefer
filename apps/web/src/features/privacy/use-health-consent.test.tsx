// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHealthConsent } from './use-health-consent';

// UX-26 (T-26.2), web twin of apps/mobile/tests/unit/health-consent.test.tsx:
// AC1 — the sheet asks first and nothing runs before the answer;
// AC2 — "Don't save it" stores nothing health-related and the caller is told.

const m = vi.hoisted(() => ({
  user: { healthDataConsentAt: null as Date | null },
  grant: vi.fn(),
  save: vi.fn(),
  declined: vi.fn(),
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
        me: { setData: vi.fn(), getData: () => m.user, fetch: () => Promise.resolve(m.user) },
      },
    }),
    user: { me: { useQuery: () => ({ data: m.user }) } },
    privacy: {
      grantHealthConsent: {
        useMutation: () => ({
          mutate: (input: unknown, opts?: { onSuccess?: () => void }) => {
            m.grant(input);
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

function SaveButton({ hasHealthData }: { hasHealthData?: boolean }) {
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          requestHealthConsent(m.save, {
            ...(hasHealthData !== undefined && { hasHealthData }),
            onDeclined: m.declined,
          })
        }
      >
        Save
      </button>
      {healthConsentSheet}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { healthDataConsentAt: null };
});
afterEach(cleanup);

describe('useHealthConsent (web)', () => {
  it('runs straight away when consent is on record', () => {
    m.user = { healthDataConsentAt: new Date() };
    render(<SaveButton />);
    fireEvent.click(screen.getByText('Save'));
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it('runs straight away when nothing health-related is being stored', () => {
    render(<SaveButton hasHealthData={false} />);
    fireEvent.click(screen.getByText('Save'));
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('health-consent-allow')).toBeNull();
  });

  it('asks first: nothing is saved or recorded before an answer, and nothing is pre-selected', () => {
    render(<SaveButton />);
    fireEvent.click(screen.getByText('Save'));
    expect(
      screen.getByRole('dialog', { name: 'Can Chefer use this to plan your food?' }),
    ).toBeTruthy();
    expect(screen.getByTestId('health-consent-allow')).toBeTruthy();
    expect(screen.getByTestId('health-consent-decline')).toBeTruthy();
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.grant).not.toHaveBeenCalled();
  });

  it('"Allow and save" records consent, then saves', () => {
    render(<SaveButton />);
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByTestId('health-consent-allow'));
    expect(m.grant).toHaveBeenCalledTimes(1);
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(m.declined).not.toHaveBeenCalled();
  });

  it('"Don\'t save it" stores nothing health-related: no save, no consent, the caller is told', () => {
    render(<SaveButton />);
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByTestId('health-consent-decline'));
    expect(m.save).not.toHaveBeenCalled();
    expect(m.grant).not.toHaveBeenCalled();
    expect(m.declined).toHaveBeenCalledTimes(1);
  });
});

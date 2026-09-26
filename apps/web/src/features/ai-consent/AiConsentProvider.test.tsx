// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConsentProvider, useAiConsent } from './AiConsentProvider';

// App Store 5.1.2(i): before the first AI action the consent sheet asks;
// "Not now" sends nothing, "Allow" records consent and then runs the action.
// Mirrors apps/mobile/tests/unit/ai-consent.test.tsx.

interface MockState {
  user: { aiDataConsentAt: Date | null };
  grant: ReturnType<typeof vi.fn>;
  action: ReturnType<typeof vi.fn>;
}
const m: MockState = vi.hoisted(() => ({
  user: { aiDataConsentAt: null },
  grant: vi.fn(),
  action: vi.fn(),
}));

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
      user: { me: { setData: vi.fn(), fetch: () => Promise.resolve(m.user) } },
    }),
    user: {
      me: { useQuery: () => ({ data: m.user }) },
      grantAiDataConsent: {
        useMutation: () => ({
          mutate: (_input: undefined, opts?: { onSuccess?: () => void }) => {
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

function AiButton({ usesAi }: { usesAi?: boolean }) {
  const requestAiConsent = useAiConsent();
  return (
    <button
      type="button"
      onClick={() =>
        requestAiConsent('recipe-import', m.action, usesAi === undefined ? undefined : { usesAi })
      }
    >
      Import
    </button>
  );
}

function renderGate(usesAi?: boolean) {
  render(
    <AiConsentProvider>
      <AiButton {...(usesAi !== undefined && { usesAi })} />
    </AiConsentProvider>,
  );
}

beforeEach(() => {
  m.user = { aiDataConsentAt: null };
  m.grant.mockReset();
  m.action.mockReset();
});
afterEach(cleanup);

describe('AiConsentProvider', () => {
  it('runs straight away when consent is on record', () => {
    m.user = { aiDataConsentAt: new Date() };
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(m.action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never asks for an action that does not use AI', () => {
    renderGate(false);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(m.action).toHaveBeenCalledTimes(1);
  });

  it('asks first, naming the provider, the data sent and the privacy policy', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(m.action).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Google Gemini/)).toBeTruthy();
    expect(screen.getByText('The link, text or photo you submit')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
  });

  it('"Not now" sends nothing and records nothing', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(m.grant).not.toHaveBeenCalled();
    expect(m.action).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Allow" records consent, then runs the original action', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(m.grant).toHaveBeenCalledTimes(1);
    expect(m.action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

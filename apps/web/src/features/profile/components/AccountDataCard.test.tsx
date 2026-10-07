// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDataCard } from './AccountDataCard';

// T-39.5 (bug B-53): the download is a NAMED file (`chefer-export-YYYY-MM-DD.json`,
// not the old `chefer-data-...`), and confirms with "Your export is ready."

const mockExportData = vi.hoisted(() => vi.fn());
const mockResetMutate = vi.hoisted(() => vi.fn());
const mockDeleteMutate = vi.hoisted(() => vi.fn());
// WP-22: what auth.linkedIdentities / auth.socialAvailability answer.
type MockAuth = {
  linked: { hasPassword: boolean; identities: { id: string; provider: string }[] } | undefined;
  availability: unknown;
};
const mockAuth = vi.hoisted(
  (): MockAuth => ({ linked: { hasPassword: true, identities: [] }, availability: undefined }),
);
const mockDeleteState = vi.hoisted(() => ({
  isError: false,
  error: null as Error | null,
  onSuccess: undefined as (() => void) | undefined,
}));

const mockLogout = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: () => ({ logout: mockLogout }) }));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { exportData: { fetch: mockExportData } } }),
    user: {
      deleteSelf: {
        useMutation: (opts?: { onSuccess?: () => void }) => {
          mockDeleteState.onSuccess = opts?.onSuccess;
          return {
            mutate: mockDeleteMutate,
            reset: vi.fn(),
            isPending: false,
            isError: mockDeleteState.isError,
            error: mockDeleteState.error,
          };
        },
      },
    },
    auth: {
      me: { useQuery: () => ({ data: { email: 'alice@chefer.dev' } }) },
      linkedIdentities: { useQuery: () => ({ data: mockAuth.linked }) },
      socialAvailability: { useQuery: () => ({ data: mockAuth.availability }) },
      requestPasswordReset: {
        useMutation: () => ({
          mutate: mockResetMutate,
          isPending: false,
          isSuccess: false,
          isError: false,
        }),
      },
    },
  },
}));

beforeEach(() => {
  mockDeleteMutate.mockReset();
  mockAuth.linked = { hasPassword: true, identities: [] };
  mockAuth.availability = undefined;
  mockExportData.mockReset().mockResolvedValue({ user: { id: 'u1' } });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AccountDataCard sign out (FB7-02)', () => {
  it('has a Sign out button between Download and Delete that signs out', () => {
    render(<AccountDataCard />);
    const names = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    const iSignOut = names.findIndex((n) => /Sign out/.test(n));
    expect(iSignOut).toBeGreaterThan(names.findIndex((n) => /Download my data|Preparing/.test(n)));
    expect(iSignOut).toBeLessThan(names.findIndex((n) => /Delete/i.test(n)));
    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('AccountDataCard export (T-39.5)', () => {
  it('downloads a file named chefer-export-YYYY-MM-DD.json', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    let capturedFilename = '';
    // The generic string-tag overload is deprecated in favour of literal tag
    // names, but this helper needs to accept whatever tag the component asks for.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          Object.defineProperty(el, 'download', {
            set(value: string) {
              capturedFilename = value;
            },
            get() {
              return capturedFilename;
            },
          });
        }
        return el;
      });

    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Download my data'));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(capturedFilename).toMatch(/^chefer-export-\d{4}-\d{2}-\d{2}\.json$/);

    createElementSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('shows "Your export is ready." after a successful download', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Download my data'));

    await waitFor(() => expect(screen.getByText('Your export is ready.')).toBeTruthy());
  });

  it('shows an error and no toast when the export fails', async () => {
    mockExportData.mockRejectedValue(new Error('network'));
    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Download my data'));

    await waitFor(() =>
      expect(screen.getByText("Couldn't prepare your data. Please try again.")).toBeTruthy(),
    );
    expect(screen.queryByText('Your export is ready.')).toBeNull();
  });
});

describe('AccountDataCard delete sheet (R-24)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  it('"Forgot your password?" requests a reset link for the signed-in email', () => {
    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Delete account'));
    fireEvent.click(screen.getByTestId('delete-account-forgot-password'));
    expect(mockResetMutate).toHaveBeenCalledWith({ email: 'alice@chefer.dev' });
  });

  it('UX-ACC-11: the wrong-password error renders right under the password field', () => {
    mockDeleteState.isError = true;
    mockDeleteState.error = new Error('Incorrect password');
    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Delete account'));

    const error = screen.getByTestId('delete-account-error');
    expect(error.textContent).toBe('Incorrect password');
    const password = document.querySelector('input[type="password"]');
    expect(password?.getAttribute('aria-describedby')).toBe('delete-account-error');
    // Directly after the password label, before the DELETE field.
    expect(error.previousElementSibling?.querySelector('input[type="password"]')).toBe(password);
    mockDeleteState.isError = false;
    mockDeleteState.error = null;
  });

  it('UX-ACC-11: lands on sign-in with the one-time deleted notice flag', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Delete account'));
    mockDeleteState.onSuccess?.();
    expect(assign).toHaveBeenCalledWith('/login?deleted=1');
  });
});

describe('AccountDataCard delete sheet for an OAuth-only account (WP-22)', () => {
  const availability = {
    google: { enabled: false, webClientId: null, iosClientId: null, androidClientId: null },
    apple: {
      enabled: true,
      servicesId: 'dev.chefer.web',
      bundleId: 'com.popdan.chefer',
      redirectUri: 'https://chefer.example/login',
    },
  };
  const open = () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Delete account'));
  };

  it('a password account still sees the password field and no provider confirmation', () => {
    open();
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.queryByTestId('delete-account-reauth')).toBeNull();
    expect(screen.getByText('Delete my account')).toBeTruthy();
  });

  it('has no password field: it confirms with a fresh Apple sign-in once DELETE is typed', async () => {
    mockAuth.linked = { hasPassword: false, identities: [{ id: 'i1', provider: 'APPLE' }] };
    mockAuth.availability = availability;
    const signIn = vi.fn(() =>
      Promise.resolve({
        authorization: { id_token: 'a'.repeat(40), code: 'c-1' },
      }),
    );
    vi.stubGlobal('AppleID', { auth: { init: vi.fn(), signIn } });
    // The SDK script "loads" immediately.
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => {
        (node as HTMLScriptElement).onload?.(new Event('load'));
      });
      return node;
    });
    open();

    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByTestId('delete-account-reauth')).toBeTruthy();
    expect(screen.queryByText('Delete my account')).toBeNull();
    const confirmApple = screen.getByRole('button', { name: /confirm with apple and delete/i });
    expect((confirmApple as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    expect((confirmApple as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmApple);

    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalledTimes(1));
    expect(mockDeleteMutate).toHaveBeenCalledWith({
      reauth: { provider: 'APPLE', idToken: 'a'.repeat(40), nonce: expect.any(String) as string },
      confirm: 'DELETE',
    });
    append.mockRestore();
  });

  it('explains the way out when this browser cannot confirm with the linked account', () => {
    mockAuth.linked = { hasPassword: false, identities: [{ id: 'i1', provider: 'APPLE' }] };
    mockAuth.availability = undefined; // provider not offered on web
    open();
    expect(screen.getByTestId('delete-account-reauth-unavailable')).toBeTruthy();
    // The reset link doubles as "set a password".
    fireEvent.click(screen.getByTestId('delete-account-forgot-password'));
    expect(mockResetMutate).toHaveBeenCalledWith({ email: 'alice@chefer.dev' });
  });
});

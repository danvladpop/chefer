// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDataCard } from './AccountDataCard';

// T-39.5 (bug B-53): the download is a NAMED file (`chefer-export-YYYY-MM-DD.json`,
// not the old `chefer-data-...`), and confirms with "Your export is ready."

const mockExportData = vi.hoisted(() => vi.fn());
const mockResetMutate = vi.hoisted(() => vi.fn());
const mockDeleteState = vi.hoisted(() => ({
  isError: false,
  error: null as Error | null,
  onSuccess: undefined as (() => void) | undefined,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { exportData: { fetch: mockExportData } } }),
    user: {
      deleteSelf: {
        useMutation: (opts?: { onSuccess?: () => void }) => {
          mockDeleteState.onSuccess = opts?.onSuccess;
          return {
            mutate: vi.fn(),
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
    vi.stubGlobal('location', { ...window.location, assign });
    render(<AccountDataCard />);
    fireEvent.click(screen.getByText('Delete account'));
    mockDeleteState.onSuccess?.();
    expect(assign).toHaveBeenCalledWith('/login?deleted=1');
  });
});

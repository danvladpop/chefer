// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDataCard } from './AccountDataCard';

// T-39.5 (bug B-53): the download is a NAMED file (`chefer-export-YYYY-MM-DD.json`,
// not the old `chefer-data-...`), and confirms with "Your export is ready."

const mockExportData = vi.hoisted(() => vi.fn());

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { exportData: { fetch: mockExportData } } }),
    user: { deleteSelf: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
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

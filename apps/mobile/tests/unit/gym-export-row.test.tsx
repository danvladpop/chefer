import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GymExportRow } from '../../src/features/gym/export/export-row';

// T-39.5 (UX-39 AC5): the gym CSV goes through the shared shareExportFile
// helper as a named text/csv file (real filename from gym.export.csv) on both
// platforms; the large-export alert and error handling are unchanged.

const mockShareExportFile = jest.fn((_filename: string, _contents: string, _mime?: string) =>
  Promise.resolve(),
);
jest.mock('../../src/lib/share-file', () => ({
  CSV_MIME: 'text/csv',
  shareExportFile: (filename: string, contents: string, mime?: string) =>
    mockShareExportFile(filename, contents, mime),
}));

const mockFetch = jest.fn<Promise<{ filename: string; csv: string }>, []>();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ gym: { export: { csv: { fetch: () => mockFetch() } } } }),
  },
}));

const HEADER = 'date,exercise,weight';

function csvWithRows(count: number): string {
  return [HEADER, ...Array.from({ length: count }, (_, i) => `2026-09-${i},Squat,100`)].join(
    '\r\n',
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GymExportRow', () => {
  it('shares the CSV as a named text/csv file through the helper', async () => {
    mockFetch.mockResolvedValue({ filename: 'chefer-gym-2026-09-30.csv', csv: csvWithRows(3) });
    await render(<GymExportRow />);

    await fireEvent.press(screen.getByTestId('gym-settings-export-button'));

    await waitFor(() => expect(mockShareExportFile).toHaveBeenCalledTimes(1));
    expect(mockShareExportFile).toHaveBeenCalledWith(
      'chefer-gym-2026-09-30.csv',
      csvWithRows(3),
      'text/csv',
    );
  });

  it('asks before sharing a large export, and shares on "Share anyway"', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetch.mockResolvedValue({ filename: 'big.csv', csv: csvWithRows(2001) });
    await render(<GymExportRow />);

    await fireEvent.press(screen.getByTestId('gym-settings-export-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(mockShareExportFile).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.text === 'Share anyway')?.onPress?.();

    await waitFor(() =>
      expect(mockShareExportFile).toHaveBeenCalledWith('big.csv', csvWithRows(2001), 'text/csv'),
    );
  });

  it('shows the export-failed alert when the fetch fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('network'));
    await render(<GymExportRow />);

    await fireEvent.press(screen.getByTestId('gym-settings-export-button'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Export failed',
        "Couldn't export your training data — try again in a minute.",
      ),
    );
    expect(mockShareExportFile).not.toHaveBeenCalled();
  });

  it('swallows a share failure (e.g. the sheet dismissed) without an error alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetch.mockResolvedValue({ filename: 'a.csv', csv: csvWithRows(1) });
    mockShareExportFile.mockRejectedValueOnce(new Error('dismissed'));
    await render(<GymExportRow />);

    await fireEvent.press(screen.getByTestId('gym-settings-export-button'));

    await waitFor(() => expect(mockShareExportFile).toHaveBeenCalledTimes(1));
    expect(alertSpy).not.toHaveBeenCalled();
  });
  it('UX-ACC-27: the copy wraps instead of clipping the domain mid-word', async () => {
    await render(<GymExportRow />);
    const copy = String(screen.getByTestId('gym-settings-export-copy').props.className);
    expect(copy).toMatch(/\bw-full\b/);
    expect(copy).toMatch(/\bmin-w-0\b/);
    expect(String(screen.getByTestId('gym-settings-export').props.className)).toMatch(
      /\bmin-w-0\b/,
    );
  });
});

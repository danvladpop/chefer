import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccountDataCard } from '../../src/features/profile/account-data-card';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// T-39.5 (bug B-53): a real, named export file (`chefer-export-YYYY-MM-DD.json`)
// shared through shareExportFile, confirmed with the "Your export is ready."
// snackbar — not an unnamed text blob in the share sheet.

const mockShareExportFile = jest.fn((_filename: string, _contents: string) => Promise.resolve());
const mockShow = jest.fn();
const mockExportFetch = jest.fn(() => Promise.resolve({ user: { id: 'u1' } }));

// The wrapper (not a direct reference) is deliberate: jest.mock() factories
// run at first `require`, which happens at import time — BEFORE this file's
// own `const mockShareExportFile = …` has executed. Calling through a lazy
// arrow defers reading `mockShareExportFile` until the mocked function is
// actually invoked, by which point it's initialized.
jest.mock('../../src/lib/share-file', () => ({
  shareExportFile: (filename: string, contents: string) => mockShareExportFile(filename, contents),
}));

jest.mock('@chefer/ui-mobile', () => ({
  ...jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile'),
  useSnackbar: () => ({ show: mockShow }),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ user: { exportData: { fetch: mockExportFetch } } }),
    user: {
      deleteSelf: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));

let queryClient: QueryClient;

beforeEach(() => {
  mockShareExportFile.mockClear();
  mockShow.mockClear();
  mockExportFetch.mockClear();
  queryClient = new QueryClient();
});

function renderCard() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <AccountDataCard />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('mobile AccountDataCard export (T-39.5)', () => {
  it('shares a file named chefer-export-YYYY-MM-DD.json and shows the ready snackbar', async () => {
    await renderCard();

    await fireEvent.press(screen.getByText('Export my data'));

    await waitFor(() => expect(mockShareExportFile).toHaveBeenCalledTimes(1));
    const [filename] = mockShareExportFile.mock.calls.at(0) ?? [];
    expect(filename).toMatch(/^chefer-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mockShow).toHaveBeenCalledWith({ message: 'Your export is ready.', tone: 'success' });
  });

  it('shows an error and no snackbar when the export fetch fails', async () => {
    mockExportFetch.mockRejectedValueOnce(new Error('network'));
    await renderCard();

    await fireEvent.press(screen.getByText('Export my data'));

    await waitFor(() =>
      expect(screen.getByText("Couldn't prepare your data. Please try again.")).toBeTruthy(),
    );
    expect(mockShow).not.toHaveBeenCalled();
  });
});

import { View as MockView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { formatDate } from '@chefer/utils';
import { WeightEntriesList } from '../../src/features/coach/weight-entries-list';
import { WeightSparkline } from '../../src/features/coach/weight-sparkline';

// UX-FOOD-27: the Today weight card drew two flat blocks with no labels.
// UX-FOOD-28: one consent sheet per weigh-in row meant a Modal per row.

const mockRequest = jest.fn((run: () => void) => run());

jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: false,
    requestHealthConsent: mockRequest,
    // One element per call to the hook: counting them counts the sheets.
    healthConsentSheet: <MockView testID="consent-sheet" />,
  }),
}));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { weightHistory: { invalidate: jest.fn() } },
      gym: {
        stats: { bodyweight: { invalidate: jest.fn() } },
        bootstrap: { invalidate: jest.fn() },
      },
    }),
    tracker: {
      updateWeight: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      deleteWeight: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const entries = Array.from({ length: 6 }, (_, i) => ({
  id: `w${i}`,
  weightKg: 78.4 - i * 1.5,
  recordedAt: new Date(`2026-09-${String(10 + i).padStart(2, '0')}T08:00:00Z`),
}));

describe('WeightEntriesList consent (UX-FOOD-28)', () => {
  it('mounts ONE consent sheet for the whole list, not one per row', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightEntriesList entries={entries} />
      </SafeAreaProvider>,
    );
    expect(screen.getAllByTestId(/^weight-entry-w\d$/)).toHaveLength(6);
    expect(screen.getAllByTestId('consent-sheet')).toHaveLength(1);
  });

  it('a row save still goes through the shared consent guard', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightEntriesList entries={entries} />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('weight-entry-w1-edit'));
    await user.press(screen.getByTestId('weight-entry-w1-save'));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

describe('WeightSparkline (UX-FOOD-27)', () => {
  it('spells out the start and end values and draws a line, not blocks', async () => {
    await render(<WeightSparkline entries={entries} system="METRIC" />);
    // Oldest first: 78.4 at the start, 70.9 at the end.
    expect(screen.getByTestId('weight-sparkline-summary')).toHaveTextContent('78.4 → 70.9 kg');
    expect(screen.getByTestId('weight-sparkline')).toHaveAccessibleName(
      'Weight over the last 30 days: 78.4 → 70.9 kg',
    );
    // Axis dates follow the device locale (UX-X-15).
    expect(
      screen.getByText(formatDate(new Date('2026-09-10T08:00:00Z'), 'short')),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(formatDate(new Date('2026-09-15T08:00:00Z'), 'short')),
    ).toBeOnTheScreen();
  });

  it('shows values in the user’s unit', async () => {
    await render(
      <WeightSparkline
        entries={[
          { weightKg: 80, recordedAt: '2026-09-01T08:00:00Z' },
          { weightKg: 70, recordedAt: '2026-09-20T08:00:00Z' },
        ]}
        system="IMPERIAL"
      />,
    );
    expect(screen.getByTestId('weight-sparkline-summary')).toHaveTextContent(/→.*lb/);
  });

  it('draws nothing for a single weigh-in', async () => {
    await render(
      <WeightSparkline
        entries={[{ weightKg: 80, recordedAt: '2026-09-01T08:00:00Z' }]}
        system="METRIC"
      />,
    );
    expect(screen.queryByTestId('weight-sparkline')).toBeNull();
  });
});

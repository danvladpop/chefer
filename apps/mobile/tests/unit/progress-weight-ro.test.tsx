import { View as MockView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { CoachExplanation } from '@chefer/types';
import { CoachWhy } from '../../src/features/coach/coach-why';
import { WeightEntriesList } from '../../src/features/coach/weight-entries-list';
import { WeightSparkline } from '../../src/features/coach/weight-sparkline';
import { resetLocaleForTests } from '../../src/lib/i18n';

// Lane J phase 4: the weight sparkline, the weigh-in list and the coach's
// "why" in Romanian.

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: <MockView />,
  }),
}));
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

const EXPLANATION: CoachExplanation = {
  version: 1,
  reason: 'plateau',
  suggestedKcal: -100,
  goal: 'LOSE_WEIGHT',
  trend: {
    fromDate: '2026-09-28',
    toDate: '2026-10-18',
    fromKg: 82.4,
    toKg: 82.3,
    spanDays: 20,
    weighIns: 12,
    kgPerWeek: -0.03,
  },
  prevKgPerWeek: 0,
  intake: { avgKcal: 1850, completeDays: 5, incompleteDays: 1, targetKcal: 1900 },
};

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const entries = [
  { id: 'a', weightKg: 78.4, recordedAt: new Date('2026-09-10T08:00:00Z') },
  { id: 'b', weightKg: 77.5, recordedAt: new Date('2026-09-20T08:00:00Z') },
];

beforeEach(() => resetLocaleForTests(['ro-RO']));
afterAll(() => resetLocaleForTests(['en-US']));

describe('progress and weight in Romanian', () => {
  it('spells the sparkline in Romanian, with a decimal comma', async () => {
    await render(<WeightSparkline entries={entries} system="METRIC" />);
    expect(screen.getByTestId('weight-sparkline-summary')).toHaveTextContent('78,4 → 77,5 kg');
    expect(screen.getByTestId('weight-sparkline')).toHaveAccessibleName(
      'Greutatea în ultimele 30 de zile: 78,4 → 77,5 kg',
    );
  });

  it('labels the weigh-in actions in Romanian', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightEntriesList entries={entries} />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('weight-entry-b-edit')).toHaveAccessibleName(
      /^Editează 77.5 kg din /,
    );
    expect(screen.getByTestId('weight-entry-b-delete')).toHaveAccessibleName(
      /^Șterge 77.5 kg din /,
    );
  });

  it('explains the suggestion in Romanian', async () => {
    await render(<CoachWhy explanation={EXPLANATION} tier="premium" />);
    expect(screen.getByText('De ce această sugestie')).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId('coach-why-toggle'));
    expect(
      screen.getByText(
        'Tendința greutății tale a rămas stabilă, de la 82.4 kg la 82.3 kg, în 3 săptămâni.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(/îți sugerez −100 kcal pe zi/)).toBeOnTheScreen();
    expect(screen.getByText('Cântăriri')).toBeOnTheScreen();
  });
});

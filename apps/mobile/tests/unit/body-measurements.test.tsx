import { screen, userEvent, waitFor } from '@testing-library/react-native';
import type { BodyMeasurementDto } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { BodyMeasurements } from '../../src/features/body/body-measurements';
import { renderWithTrpc } from './friends-core-harness';

// Lane D3 (market review 2026-10): body measurements on Stats — one chart per
// measure in the user's units, an optional-field form that saves today's
// entry in cm, and entries with a labelled delete.

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
let mockSystem: 'METRIC' | 'IMPERIAL' = 'METRIC';
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => mockSystem }));
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const entry = (measuredOn: string, over: Partial<BodyMeasurementDto>): BodyMeasurementDto => ({
  id: measuredOn,
  measuredOn,
  waistCm: null,
  hipsCm: null,
  chestCm: null,
  upperArmCm: null,
  thighCm: null,
  bodyFatPct: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSystem = 'METRIC';
});

describe('BodyMeasurements', () => {
  it('invites a first entry when there is none', async () => {
    await renderWithTrpc(<BodyMeasurements />, { 'tracker.bodyMeasurements': () => [] });
    expect(await screen.findByTestId('measurements-empty')).toBeOnTheScreen();
  });

  it('charts the picked measure in the user’s unit with a neutral change line', async () => {
    mockSystem = 'IMPERIAL';
    const user = userEvent.setup();
    await renderWithTrpc(<BodyMeasurements />, {
      'tracker.bodyMeasurements': () => [
        entry('2026-09-01', { waistCm: 88.9, hipsCm: 100 }),
        entry('2026-10-01', { waistCm: 86.36 }),
      ],
    });
    expect(await screen.findByTestId('measure-change')).toHaveTextContent(
      '−1.0 in since your first entry',
    );
    expect(screen.getByTestId('measure-chart')).toBeOnTheScreen();
    await user.press(screen.getByTestId('measure-chip-hips'));
    expect(screen.getByTestId('measure-one-entry')).toBeOnTheScreen();
  });

  it('saves only the filled measures, in cm, for today', async () => {
    mockSystem = 'IMPERIAL';
    const calls: unknown[] = [];
    const user = userEvent.setup();
    await renderWithTrpc(<BodyMeasurements />, {
      'tracker.bodyMeasurements': () => [],
      'tracker.logBodyMeasurement': (input) => {
        calls.push(input);
        return entry('2026-10-23', { waistCm: 86.4 });
      },
    });
    await user.press(await screen.findByTestId('measurements-add'));
    await user.type(screen.getByTestId('measure-input-waist'), '34');
    await user.type(screen.getByTestId('measure-input-bodyFat'), '21,5');
    await user.press(screen.getByTestId('measurement-save'));
    await waitFor(() =>
      expect(calls).toEqual([{ date: localDateStr(), waistCm: 86.4, bodyFatPct: 21.5 }]),
    );
    expect(track).toHaveBeenCalledWith('body_measurement_logged', {
      measures: ['waist', 'bodyFat'],
      units: 'imperial',
    });
  });

  it('flags a bad field and needs at least one measure', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<BodyMeasurements />, { 'tracker.bodyMeasurements': () => [] });
    await user.press(await screen.findByTestId('measurements-add'));
    await user.press(screen.getByTestId('measurement-save'));
    expect(screen.getByTestId('measurement-form-error')).toHaveTextContent(
      'Enter at least one measurement.',
    );
    await user.type(screen.getByTestId('measure-input-chest'), '900');
    await user.press(screen.getByTestId('measurement-save'));
    expect(screen.getByTestId('measure-error-chest')).toHaveTextContent(
      'Must be between 10 and 250 cm.',
    );
  });

  it('deletes an entry from its labelled button', async () => {
    const deleted: unknown[] = [];
    const user = userEvent.setup();
    await renderWithTrpc(<BodyMeasurements />, {
      'tracker.bodyMeasurements': () => [entry('2026-10-01', { thighCm: 55 })],
      'tracker.deleteBodyMeasurement': (input) => {
        deleted.push(input);
        return { success: true };
      },
    });
    expect(await screen.findByText('Thigh 55 cm')).toBeOnTheScreen();
    await user.press(screen.getByTestId('measurement-delete-2026-10-01'));
    await waitFor(() => expect(deleted).toEqual([{ id: '2026-10-01' }]));
  });
});

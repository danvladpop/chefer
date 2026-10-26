import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ALL_FEATURE_FLAGS_OFF, type HealthSyncType } from '@chefer/types';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { setHealthStoreForTests, type HealthStore } from '../../src/features/health/health-store';
import { readHealthSettings } from '../../src/features/health/health-sync';
import { HealthSyncScreen } from '../../src/features/health/health-sync-screen';
import { renderWithTrpc } from './friends-core-harness';

// C2 owner decision 5: one switch per type is the consent step. On → the OS
// sheet for that type only (weigh-ins: Chefer's health consent first), then a
// HEALTH_SYNC consent event; off → stops at once. Hidden without the flag.

jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
const mockConsent = jest.fn((run: () => void) => run());
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => mockConsent(run),
    healthConsentSheet: null,
  }),
}));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

function fakeStore(grant: (types: readonly HealthSyncType[]) => HealthSyncType[]) {
  const requestAccess = jest.fn((types: readonly HealthSyncType[]) =>
    Promise.resolve(grant(types)),
  );
  const store: HealthStore = {
    platform: 'HEALTH_CONNECT',
    isAvailable: () => Promise.resolve(true),
    requestAccess,
    readWeights: () => Promise.resolve([]),
    readTodayActivity: () => Promise.resolve({ steps: null, activeKcal: null }),
    writeWorkout: () => Promise.resolve(),
    writeMeals: () => Promise.resolve(),
    deleteMeals: () => Promise.resolve(),
    openSettings: () => Promise.resolve(),
  };
  setHealthStoreForTests(store);
  return { requestAccess };
}

const flagsOn = () => ({ ...ALL_FEATURE_FLAGS_OFF, healthSync: true });

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
});
afterEach(() => setHealthStoreForTests(undefined));

describe('HealthSyncScreen', () => {
  it('turns one type on: OS sheet for it alone, then the consent event', async () => {
    const { requestAccess } = fakeStore((types) => [...types]);
    const recorded: unknown[] = [];
    await renderWithTrpc(<HealthSyncScreen />, {
      'profile.flags': flagsOn,
      'privacy.recordHealthSync': (input) => {
        recorded.push(input);
        return { ok: true };
      },
    });
    expect(await screen.findByTestId('health-title')).toHaveTextContent('Health Connect');
    await fireEvent(screen.getByTestId('health-steps'), 'valueChange', true);
    await waitFor(() => expect(readHealthSettings()?.types).toEqual(['steps']));
    expect(requestAccess).toHaveBeenCalledWith(['steps']);
    expect(recorded).toEqual([{ platform: 'HEALTH_CONNECT', types: ['steps'] }]);
    expect(mockConsent).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('health_sync_toggled', {
      platform: 'HEALTH_CONNECT',
      type: 'steps',
      on: true,
    });
  });

  it('asks for health consent before reading weigh-ins', async () => {
    fakeStore((types) => [...types]);
    await renderWithTrpc(<HealthSyncScreen />, {
      'profile.flags': flagsOn,
      'privacy.recordHealthSync': () => ({ ok: true }),
    });
    await fireEvent(await screen.findByTestId('health-weight'), 'valueChange', true);
    await waitFor(() => expect(readHealthSettings()?.types).toEqual(['weight']));
    expect(mockConsent).toHaveBeenCalledTimes(1);
  });

  it('leaves the switch off and points to the OS when access is refused', async () => {
    fakeStore(() => []);
    const recorded: unknown[] = [];
    await renderWithTrpc(<HealthSyncScreen />, {
      'profile.flags': flagsOn,
      'privacy.recordHealthSync': (input) => {
        recorded.push(input);
        return { ok: true };
      },
    });
    await fireEvent(await screen.findByTestId('health-workouts'), 'valueChange', true);
    expect(await screen.findByTestId('health-denied')).toBeOnTheScreen();
    expect(readHealthSettings()).toBeNull();
    expect(recorded).toEqual([]);
  });

  it('turns a type off at once and logs the new set', async () => {
    fakeStore((types) => [...types]);
    const recorded: unknown[] = [];
    await renderWithTrpc(<HealthSyncScreen />, {
      'profile.flags': flagsOn,
      'privacy.recordHealthSync': (input) => {
        recorded.push(input);
        return { ok: true };
      },
    });
    await fireEvent(await screen.findByTestId('health-nutrition'), 'valueChange', true);
    await waitFor(() => expect(readHealthSettings()?.types).toEqual(['nutrition']));
    await fireEvent(await screen.findByTestId('health-nutrition'), 'valueChange', false);
    await waitFor(() => expect(readHealthSettings()?.types).toEqual([]));
    await waitFor(() =>
      expect(recorded).toEqual([
        { platform: 'HEALTH_CONNECT', types: ['nutrition'] },
        { platform: 'HEALTH_CONNECT', types: [] },
      ]),
    );
  });

  it('says the store failed (not the connection) when the OS request throws', async () => {
    const { requestAccess } = fakeStore((types) => [...types]);
    requestAccess.mockImplementationOnce(() => Promise.reject(new Error('disallowed')));
    await renderWithTrpc(<HealthSyncScreen />, {
      'profile.flags': flagsOn,
      'privacy.recordHealthSync': () => ({ ok: true }),
    });
    await fireEvent(await screen.findByTestId('health-nutrition'), 'valueChange', true);
    expect(await screen.findByTestId('health-save-error')).toHaveTextContent(
      'Health Connect couldn’t turn that on. Try again in a moment.',
    );
    expect(readHealthSettings()).toBeNull();
  });

  it('shows nothing to switch without the healthSync flag', async () => {
    fakeStore((types) => [...types]);
    await renderWithTrpc(<HealthSyncScreen />, { 'profile.flags': () => ALL_FEATURE_FLAGS_OFF });
    expect(await screen.findByTestId('health-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('health-steps')).toBeNull();
  });
});

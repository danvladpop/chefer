import { Text } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';
import { ALL_FEATURE_FLAGS_OFF } from '@chefer/types';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  getShellMode,
  isTrainerModeAvailableCached,
  resetShellModeStoreForTests,
  setShellMode,
  setTrainerModeAvailableCache,
} from '../../src/features/trainer-mode/mode-store';
import { TrainerModeHost } from '../../src/features/trainer-mode/trainer-mode-host';
import {
  useTrainerBadges,
  useTrainerModeAvailability,
} from '../../src/features/trainer-mode/use-trainer-mode';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { settle } from './trainer-fixtures';
import { badges, trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer mode §5.1 / §7.1: who gets the mode (flag AND active trainer tools), asked as little as
// possible, cached for the next cold start, and the badge that only polls while the mode exists.

function Probe() {
  const available = useTrainerModeAvailability();
  const { requests, total } = useTrainerBadges();
  return <Text testID="probe">{`${String(available)}|${requests}|${total}`}</Text>;
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetShellModeStoreForTests();
  onlineManager.setOnline(true);
});

describe('useTrainerModeAvailability', () => {
  it('an active trainer with the flag on: available, cached, and the badge counts', async () => {
    const r = await renderWithTrpc(
      <Probe />,
      trainerModeHandlers({ 'trainer.badges': () => badges({ requests: 2 }) }),
    );
    await settle();
    expect(screen.getByTestId('probe')).toHaveTextContent('true|2|2');
    expect(isTrainerModeAvailableCached()).toBe(true);
    expect(r.paths()).toEqual(expect.arrayContaining(['trainer.status', 'trainer.badges']));
  });

  it('flag off: not available, and no trainer.* procedure is ever called', async () => {
    setTrainerModeAvailableCache(true);
    const r = await renderWithTrpc(
      <Probe />,
      trainerModeHandlers({
        'profile.flags': () => ({ ...ALL_FEATURE_FLAGS_OFF, coaching: true }),
      }),
    );
    await settle();
    expect(screen.getByTestId('probe')).toHaveTextContent('false|0|0');
    expect(isTrainerModeAvailableCached()).toBe(false);
    expect(r.paths().filter((p) => p.startsWith('trainer.'))).toEqual([]);
  });

  it('a user who may not be a trainer never asks trainer.status', async () => {
    const r = await renderWithTrpc(
      <Probe />,
      trainerModeHandlers({
        'coaching.availability': () => ({ enabled: true, canBeTrainer: false }),
      }),
    );
    await settle();
    expect(screen.getByTestId('probe')).toHaveTextContent('false|0|0');
    expect(r.paths()).not.toContain('trainer.status');
  });

  it('trainer tools not turned on: not available', async () => {
    await renderWithTrpc(
      <Probe />,
      trainerModeHandlers({
        'trainer.status': () => ({ canActivate: true, active: false, displayName: null }),
      }),
    );
    await settle();
    expect(screen.getByTestId('probe')).toHaveTextContent('false|0|0');
  });

  it('a failed status check is not an answer: the cached value stands', async () => {
    setTrainerModeAvailableCache(true);
    await renderWithTrpc(
      <Probe />,
      trainerModeHandlers({
        'trainer.status': () => {
          throw trpcError('INTERNAL_SERVER_ERROR', 500);
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('probe')).toHaveTextContent(/^true\|/);
    expect(isTrainerModeAvailableCached()).toBe(true);
  });
});

describe('TrainerModeHost (§5.1 "Losing trainer status")', () => {
  it('trainer tools gone: the remembered trainer mode falls back to personal', async () => {
    setShellMode('trainer');
    setTrainerModeAvailableCache(true);
    await renderWithTrpc(
      <TrainerModeHost signedIn />,
      trainerModeHandlers({
        'trainer.status': () => ({ canActivate: true, active: false, displayName: 'Ana' }),
      }),
    );
    await settle();
    expect(isTrainerModeAvailableCached()).toBe(false);
    expect(getShellMode()).toBe('personal');
  });

  it('still a trainer: the mode is kept and the answer cached', async () => {
    setShellMode('trainer');
    await renderWithTrpc(<TrainerModeHost signedIn />, trainerModeHandlers());
    await settle();
    expect(isTrainerModeAvailableCached()).toBe(true);
    expect(getShellMode()).toBe('trainer');
  });

  it('signed out: asks nothing', async () => {
    const r = await renderWithTrpc(<TrainerModeHost signedIn={false} />, trainerModeHandlers());
    await settle();
    expect(r.paths()).toEqual([]);
  });
});

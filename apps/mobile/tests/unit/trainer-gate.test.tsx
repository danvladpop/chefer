import { Platform, Text } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { TrainerGate } from '../../src/features/trainer/components/trainer-gate';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { settle, trainerHandlers } from './trainer-fixtures';

// WP-18 lane C: every /trainer route sits behind `coaching.availability` (never gated) and then
// `trainer.status` (spec §2.1, §11). Off means nothing renders and no `trainer.*` query runs.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const { router } = jest.requireMock<{ router: { back: jest.Mock } }>('expo-router');

function Page() {
  return <Text testID="trainer-page">Clients page</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});

describe('TrainerGate', () => {
  it('renders nothing and asks only coaching.availability while it is pending', async () => {
    const r = await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers({ 'coaching.availability': () => new Promise(() => undefined) }),
    );
    await settle(2);
    expect(screen.getByTestId('trainer-gate-loading')).toBeTruthy();
    expect(screen.queryByTestId('trainer-page')).toBeNull();
    expect(r.paths()).toEqual(['coaching.availability']);
  });

  it('flag off: "not available" with Go back, and no trainer.* call is made', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers({ 'coaching.availability': () => ({ enabled: false, canBeTrainer: false }) }),
    );
    await settle();
    expect(screen.getByTestId('trainer-unavailable')).toBeTruthy();
    expect(screen.getByText('Trainer tools aren’t available for your account yet.')).toBeTruthy();
    expect(screen.queryByTestId('trainer-page')).toBeNull();
    expect(r.paths().filter((p) => p.startsWith('trainer.'))).toEqual([]);
    await user.press(screen.getByTestId('trainer-unavailable-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('coaching on but not on the trainer allowlist: also unavailable', async () => {
    const r = await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers({ 'coaching.availability': () => ({ enabled: true, canBeTrainer: false }) }),
    );
    await settle();
    expect(screen.getByTestId('trainer-unavailable')).toBeTruthy();
    expect(r.paths().filter((p) => p.startsWith('trainer.'))).toEqual([]);
  });

  it('an old API (404) is an answer: off. A 5xx is not: it offers Retry', async () => {
    await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers({
        'coaching.availability': () => {
          throw trpcError('NOT_FOUND', 404);
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-unavailable')).toBeTruthy();
  });

  it('a server error shows Retry instead of "unavailable"', async () => {
    let fail = true;
    await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers({
        'coaching.availability': () => {
          if (fail) throw trpcError('INTERNAL_SERVER_ERROR', 500);
          return { enabled: true, canBeTrainer: true };
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-gate-error')).toBeTruthy();
    expect(screen.queryByTestId('trainer-unavailable')).toBeNull();
    fail = false;
    await fireEvent.press(screen.getByText('Try again'));
    await settle();
    await waitFor(() => expect(screen.getByTestId('trainer-page')).toBeTruthy());
  });

  it('offline with no answer yet: Retry, never "not available for your account"', async () => {
    onlineManager.setOnline(false);
    const r = await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers(),
    );
    await settle();
    expect(screen.getByTestId('trainer-gate-error')).toBeTruthy();
    expect(screen.queryByTestId('trainer-unavailable')).toBeNull();
    expect(r.paths()).toEqual([]);
    onlineManager.setOnline(true);
    await settle();
    await waitFor(() => expect(screen.getByTestId('trainer-page')).toBeTruthy());
  });

  it('trainer tools off: the turn-on card prefills the first name and activates', async () => {
    const user = userEvent.setup();
    let active = false;
    const r = await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers({
        'trainer.status': () => ({ canActivate: true, active, displayName: null }),
        'trainer.activate': () => {
          active = true;
          return { canActivate: true, active: true, displayName: 'Ana' };
        },
      }),
    );
    await settle();
    expect(screen.getByText('Coach clients in Chefer')).toBeTruthy();
    const input = screen.getByTestId('trainer-turn-on-name');
    expect(input.props.value).toBe('Ana');
    await user.press(screen.getByTestId('trainer-turn-on-submit'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.activate')?.input).toEqual({
      displayName: 'Ana',
    });
    await waitFor(() => expect(screen.getByTestId('trainer-page')).toBeTruthy());
  });

  it('a FORBIDDEN activation shows the server message inline', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers({
        'trainer.status': () => ({ canActivate: true, active: false, displayName: null }),
        'trainer.activate': () => {
          throw trpcError(
            'FORBIDDEN',
            403,
            {},
            'Trainer tools aren’t available for your account yet.',
          );
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-turn-on-submit'));
    await settle();
    expect(screen.getByTestId('trainer-turn-on-error')).toHaveTextContent(
      'Trainer tools aren’t available for your account yet.',
    );
  });

  it('active trainer: the page renders', async () => {
    await renderWithTrpc(
      <TrainerGate>
        <Page />
      </TrainerGate>,
      trainerHandlers(),
    );
    await settle();
    expect(screen.getByTestId('trainer-page')).toBeTruthy();
  });
});

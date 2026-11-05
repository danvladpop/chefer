import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { markPushRegistered } from '../../src/features/notifications/push/push-store';
import { useSignOut } from '../../src/features/settings/use-sign-out';
import { makeDoc } from './gym-fixtures';

// UX-ACC-12: signing out deletes workouts that never reached the server — so
// More / Settings warn first, and say how many.

const mockLogoutMutate = jest.fn();
const mockUnregister = jest.fn(
  (_input: unknown): Promise<unknown> => Promise.resolve({ ok: true }),
);
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    auth: { logout: { useMutation: () => ({ mutate: mockLogoutMutate, isPending: false }) } },
    useUtils: () => ({
      client: { notifications: { push: { unregister: { mutate: mockUnregister } } } },
    }),
  },
}));
jest.mock('../../src/lib/sign-out', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function Harness() {
  const signOut = useSignOut('so-warning');
  return (
    <>
      <Pressable testID="sign-out" onPress={signOut.request}>
        <Text>Sign out</Text>
      </Pressable>
      {signOut.confirmSheet}
    </>
  );
}

function renderHarness() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <Harness />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockLogoutMutate.mockClear();
  mockUnregister.mockClear();
  setKvBackendForTests(createMemoryKvBackend());
  outbox.reload();
  activeSessionStore.clear();
});

describe('useSignOut — unsynced workout warning (UX-ACC-12)', () => {
  it('asks first even when nothing would be lost, and signs out only on "Sign out" (UX-ACC-19)', async () => {
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));
    expect(mockLogoutMutate).not.toHaveBeenCalled();
    expect(await screen.findByTestId('so-warning-body')).toHaveTextContent(
      'You can sign back in any time.',
    );
    expect(screen.getByText('Sign out of Chefer?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('so-warning-confirm'));
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('"Cancel" on the plain confirm keeps the session', async () => {
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));
    await fireEvent.press(await screen.findByTestId('so-warning-cancel'));
    expect(mockLogoutMutate).not.toHaveBeenCalled();
  });

  it('warns first when a workout is in progress, and signs out only after "Sign out anyway"', async () => {
    activeSessionStore.set(makeDoc(1), 'user-a');
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));

    expect(mockLogoutMutate).not.toHaveBeenCalled();
    expect(await screen.findByTestId('so-warning-body')).toHaveTextContent(
      /1 workout hasn’t synced.*deletes it from this phone/,
    );

    await fireEvent.press(screen.getByTestId('so-warning-confirm'));
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('"Stay signed in" keeps the session', async () => {
    activeSessionStore.set(makeDoc(1), 'user-a');
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));
    await fireEvent.press(await screen.findByTestId('so-warning-cancel'));
    expect(mockLogoutMutate).not.toHaveBeenCalled();
  });

  it('counts queued uploads too', async () => {
    await act(() => {
      outbox.enqueue(makeDoc(2));
      outbox.enqueue(makeDoc(3));
    });
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));
    expect(await screen.findByTestId('so-warning-body')).toHaveTextContent(
      /2 workouts haven’t synced/,
    );
  });
});

describe('useSignOut — push token (trainer mode M4, §7.2)', () => {
  it('unregisters this device’s push token BEFORE the server logout (the session is still valid)', async () => {
    markPushRegistered('ExponentPushToken[abc123]');
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));
    await fireEvent.press(await screen.findByTestId('so-warning-confirm'));
    expect(mockUnregister).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc123]' });
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
    expect(mockUnregister.mock.invocationCallOrder[0]).toBeLessThan(
      mockLogoutMutate.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('best effort: a failed unregister never blocks the sign-out', async () => {
    markPushRegistered('ExponentPushToken[abc123]');
    mockUnregister.mockRejectedValueOnce(new Error('offline'));
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));
    await fireEvent.press(await screen.findByTestId('so-warning-confirm'));
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('no push token on this device: straight to the logout', async () => {
    await renderHarness();
    await fireEvent.press(screen.getByTestId('sign-out'));
    await fireEvent.press(await screen.findByTestId('so-warning-confirm'));
    expect(mockUnregister).not.toHaveBeenCalled();
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });
});

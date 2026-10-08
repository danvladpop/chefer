import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { activeSessionStore } from '../../src/features/gym/offline/active-session-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { outbox } from '../../src/features/gym/offline/outbox';
import { useSignOut } from '../../src/features/settings/use-sign-out';
import { makeDoc } from './gym-fixtures';

// UX-ACC-12: signing out deletes workouts that never reached the server — so
// More / Settings warn first, and say how many.

const mockLogoutMutate = jest.fn();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    auth: { logout: { useMutation: () => ({ mutate: mockLogoutMutate, isPending: false }) } },
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

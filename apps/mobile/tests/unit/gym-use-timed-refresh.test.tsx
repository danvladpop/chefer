import { Pressable, Text, View } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { useTimedRefresh } from '../../src/features/gym/today/use-timed-refresh';

// Bug B-26: a stuck spinner at the top of Gym Today after "Done" (> 10 s).
// `refreshing` must drop after the timeout regardless of whether `refetch`
// itself ever settles — the host-load scenario the bug was observed under.
// Exercised through a tiny harness component (renderHook has known quirks
// with this RNTL version's async `act`/fake-timer interaction) — same
// render + testID pattern as every other screen test in this suite.

function Harness({
  refetch,
  timeoutMs = 10_000,
}: {
  refetch: () => Promise<void>;
  timeoutMs?: number;
}) {
  const { refreshing, onRefresh } = useTimedRefresh(refetch, timeoutMs);
  return (
    <View>
      <Text testID="refreshing">{refreshing ? 'yes' : 'no'}</Text>
      <Pressable testID="pull" onPress={onRefresh} />
    </View>
  );
}

beforeEach(() => jest.useFakeTimers({ legacyFakeTimers: false }));
afterEach(() => jest.useRealTimers());

describe('useTimedRefresh', () => {
  it('starts not refreshing', async () => {
    await render(<Harness refetch={() => Promise.resolve()} />);
    expect(screen.getByTestId('refreshing')).toHaveTextContent('no');
  });

  it('drops the spinner after the timeout even when refetch never settles', async () => {
    const user = userEvent.setup();
    const refetch = jest.fn(() => new Promise<void>(() => undefined)); // never resolves
    await render(<Harness refetch={refetch} />);

    await user.press(screen.getByTestId('pull'));
    expect(screen.getByTestId('refreshing')).toHaveTextContent('yes');
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(() => jest.advanceTimersByTimeAsync(10_000));
    expect(screen.getByTestId('refreshing')).toHaveTextContent('no');
  });

  it('drops the spinner as soon as refetch settles, before the timeout', async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => undefined;
    const refetch = jest.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    await render(<Harness refetch={refetch} />);

    await user.press(screen.getByTestId('pull'));
    expect(screen.getByTestId('refreshing')).toHaveTextContent('yes');

    await act(async () => {
      resolve();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('refreshing')).toHaveTextContent('no');
  });

  it('a second pull re-arms the timeout', async () => {
    const user = userEvent.setup();
    const refetch = jest.fn(() => new Promise<void>(() => undefined));
    await render(<Harness refetch={refetch} />);

    await user.press(screen.getByTestId('pull'));
    await act(() => jest.advanceTimersByTimeAsync(6_000));
    expect(screen.getByTestId('refreshing')).toHaveTextContent('yes');

    await user.press(screen.getByTestId('pull')); // pulled again before the first timeout fired
    await act(() => jest.advanceTimersByTimeAsync(6_000)); // 12s since the 1st pull, 6s since the 2nd
    expect(screen.getByTestId('refreshing')).toHaveTextContent('yes');

    await act(() => jest.advanceTimersByTimeAsync(4_000)); // 10s since the 2nd pull
    expect(screen.getByTestId('refreshing')).toHaveTextContent('no');
  });
});

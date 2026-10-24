import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { localDateStr } from '@chefer/utils';
import { kv } from '../../src/features/gym/offline/kv';
import {
  COOK_QUEUE_KEY,
  COOK_QUEUE_MAX,
  enqueueCook,
  flushCookQueue,
  queuedCookCount,
} from '../../src/features/progress/cook-queue';
import { useFinishCook } from '../../src/features/progress/use-finish-cook';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { receiptFixture } from './progress-fixtures';

// The cook's one progress call (build-plan Lane C §3): once per cook, for EVERY
// user (the gate does not matter), and an offline finish waits in a queue that
// retries — idempotently, by the cook's UUID.

const cookInput = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  recipeId: 'salmon',
  localDate: '2026-10-22',
  startedAt: new Date('2026-10-22T18:30:00.000Z'),
  finishedAt: new Date('2026-10-22T19:00:00.000Z'),
  ...over,
});

// Jest has no native crypto: a fresh id per cook is what matters here.
let mockSeq = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `cook-uuid-${++mockSeq}` }));

beforeEach(() => kv.remove(COOK_QUEUE_KEY));

describe('cook queue', () => {
  it('parks a cook once, whatever the retries', () => {
    enqueueCook(cookInput('c1'));
    enqueueCook(cookInput('c1'));
    expect(queuedCookCount()).toBe(1);
  });

  it('sends the parked cooks in order and empties itself', async () => {
    enqueueCook(cookInput('c1'));
    enqueueCook(cookInput('c2', { recipeId: null }));
    const send = jest.fn((_input: { id: string; startedAt?: Date; finishedAt: Date }) =>
      Promise.resolve(),
    );
    await expect(flushCookQueue(send)).resolves.toBe(2);
    expect(send.mock.calls.map(([c]) => c.id)).toEqual(['c1', 'c2']);
    // Dates come back as Dates (the queue stores text).
    const first = send.mock.calls[0]?.[0];
    expect(first?.finishedAt).toEqual(new Date('2026-10-22T19:00:00.000Z'));
    expect(first?.startedAt).toBeInstanceOf(Date);
    expect(queuedCookCount()).toBe(0);
  });

  it('keeps everything from a transient failure on, and retries next time', async () => {
    enqueueCook(cookInput('c1'));
    enqueueCook(cookInput('c2'));
    const offline = jest.fn(() => Promise.reject(new Error('Network request failed')));
    await expect(flushCookQueue(offline)).resolves.toBe(0);
    expect(offline).toHaveBeenCalledTimes(1);
    expect(queuedCookCount()).toBe(2);

    const online = jest.fn(() => Promise.resolve());
    await expect(flushCookQueue(online)).resolves.toBe(2);
    expect(queuedCookCount()).toBe(0);
  });

  it('keeps going through a 5xx the server will recover from, but drops a request it rejects', async () => {
    enqueueCook(cookInput('c1'));
    enqueueCook(cookInput('c2'));
    const rejected = jest.fn((c: { id: string }) =>
      c.id === 'c1'
        ? Promise.reject(trpcError('BAD_REQUEST', 400))
        : Promise.reject(trpcError('INTERNAL_SERVER_ERROR', 500)),
    );
    await flushCookQueue(rejected);
    // c1 is gone for good; c2 hit a 5xx and stays.
    expect(queuedCookCount()).toBe(1);
  });

  it('never holds more than its cap', () => {
    for (let i = 0; i < COOK_QUEUE_MAX + 5; i += 1) enqueueCook(cookInput(`c${i}`));
    expect(queuedCookCount()).toBe(COOK_QUEUE_MAX);
  });

  it('overlapping flushes share one run (no double send)', async () => {
    enqueueCook(cookInput('c1'));
    const send = jest.fn(() => Promise.resolve());
    const [a, b] = await Promise.all([flushCookQueue(send), flushCookQueue(send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});

function Harness({ recipeId = 'salmon' }: { recipeId?: string }) {
  const [finished, setFinished] = useState(false);
  const { receipt, cookId } = useFinishCook({ finished, recipeId });
  return (
    <>
      <Pressable testID="finish" onPress={() => setFinished(true)} />
      <Pressable testID="finish-again" onPress={() => setFinished((f) => !f)} />
      <Text testID="cook-id">{cookId}</Text>
      <Text testID="receipt-xp">{receipt ? String(receipt.xp) : 'none'}</Text>
    </>
  );
}

describe('useFinishCook', () => {
  it('calls progress.finishCook once with the cook’s own UUID — with Kitchen progress OFF', async () => {
    const finishCook = jest.fn(() => ({ receipt: null, unlocks: [], levelUp: null }));
    // No flags handler at all: the gate is off for this user.
    const { paths } = await renderWithTrpc(<Harness />, { 'progress.finishCook': finishCook });
    expect(finishCook).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('finish'));
    await waitFor(() => expect(finishCook).toHaveBeenCalledTimes(1));
    const input = (finishCook.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(input).toMatchObject({ recipeId: 'salmon', localDate: localDateStr() });
    expect(input.id).toBe(screen.getByTestId('cook-id').props.children);
    expect(input.finishedAt).toBeInstanceOf(Date);
    expect(paths().filter((p) => p.startsWith('progress.'))).toEqual(['progress.finishCook']);
    expect(screen.getByTestId('receipt-xp')).toHaveTextContent('none');

    // Finishing "again" (toggling the state) never records a second cook.
    await fireEvent.press(screen.getByTestId('finish-again'));
    await fireEvent.press(screen.getByTestId('finish-again'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(finishCook).toHaveBeenCalledTimes(1);
  });

  it('hands back the receipt when the API gives one', async () => {
    await renderWithTrpc(<Harness />, {
      'progress.finishCook': () => ({ receipt: receiptFixture(), unlocks: [], levelUp: null }),
    });
    await fireEvent.press(screen.getByTestId('finish'));
    await waitFor(() => expect(screen.getByTestId('receipt-xp')).toHaveTextContent('45'));
  });

  it('parks the cook in the queue when the call fails', async () => {
    await renderWithTrpc(<Harness />, {
      'progress.finishCook': () => {
        throw new Error('Network request failed');
      },
    });
    await fireEvent.press(screen.getByTestId('finish'));
    await waitFor(() => expect(queuedCookCount()).toBe(1));
    const cookId = screen.getByTestId('cook-id').props.children as string;
    const stored = kv.getJSON(COOK_QUEUE_KEY) as { id: string }[];
    expect(stored[0]?.id).toBe(cookId);
  });
});

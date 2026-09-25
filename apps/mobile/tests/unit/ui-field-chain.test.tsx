import { Keyboard } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useFieldChain, type UseFieldChainResult } from '@chefer/ui-mobile';

// Gym dogfood #2: a list of similar fields (starting weights, one per
// exercise) should behave like a form — submitting one moves to the next,
// the last one dismisses the keyboard. `useFieldChain` is the plain-refs
// implementation of that; this file tests it head-on, without a device.

// RNTL v14: render is async (concurrent React) — always await it.

function ChainHarness({
  length,
  onReady,
}: {
  length: number;
  onReady: (chain: UseFieldChainResult) => void;
}) {
  const chain = useFieldChain(length);
  // Captured synchronously during render: this probe has no other purpose,
  // and a passive effect isn't guaranteed to have flushed by the time
  // `await render(...)` returns.
  onReady(chain);
  return null;
}

async function makeChain(length: number): Promise<UseFieldChainResult> {
  let chain: UseFieldChainResult | undefined;
  await render(
    <ChainHarness
      length={length}
      onReady={(c) => {
        chain = c;
      }}
    />,
  );
  if (!chain) throw new Error('useFieldChain never reported back');
  return chain;
}

describe('useFieldChain', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returnKeyType is "next" for every field but the last, "done" for the last', async () => {
    const chain = await makeChain(3);
    expect(chain.bind(0).returnKeyType).toBe('next');
    expect(chain.bind(1).returnKeyType).toBe('next');
    expect(chain.bind(2).returnKeyType).toBe('done');
  });

  it('submitting a field focuses the next one in the chain', async () => {
    const chain = await makeChain(3);
    const fields = [0, 1, 2].map(() => ({ focus: jest.fn() }));
    chain.bind(0).ref(fields[0] as never);
    chain.bind(1).ref(fields[1] as never);
    chain.bind(2).ref(fields[2] as never);

    chain.bind(0).onSubmitEditing();
    expect(fields[1]?.focus).toHaveBeenCalledTimes(1);
    expect(fields[2]?.focus).not.toHaveBeenCalled();

    chain.bind(1).onSubmitEditing();
    expect(fields[2]?.focus).toHaveBeenCalledTimes(1);
  });

  it('submitting the last field dismisses the keyboard instead of focusing past the end', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const chain = await makeChain(2);

    chain.bind(1).onSubmitEditing();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("hands bind()'s onFocus option the field's own instance, for scroll-into-view", async () => {
    const chain = await makeChain(2);
    const field = { focus: jest.fn(), measureLayout: jest.fn() };
    const onFocus = jest.fn();
    chain.bind(0, { onFocus }).ref(field as never);

    await act(() => {
      chain.bind(0, { onFocus }).onFocus();
    });
    expect(onFocus).toHaveBeenCalledWith(field);
  });

  it('tracks which field is focused, and reports the last one distinctly', async () => {
    // `focusedIndex` is React state, so — unlike `bind`'s other returned
    // callbacks, which close over stable refs — a snapshot of `chain` goes
    // stale the moment it updates. `current` is refreshed on every render.
    const current: { value: UseFieldChainResult | undefined } = { value: undefined };
    await render(
      <ChainHarness
        length={2}
        onReady={(c) => {
          current.value = c;
        }}
      />,
    );

    await act(() => {
      current.value?.bind(0).onFocus();
    });
    expect(current.value?.focusedIndex).toBe(0);
    expect(current.value?.isLastFocused).toBe(false);

    await act(() => {
      current.value?.bind(1).onFocus();
    });
    expect(current.value?.focusedIndex).toBe(1);
    expect(current.value?.isLastFocused).toBe(true);

    await act(() => {
      current.value?.bind(1).onBlur();
    });
    expect(current.value?.focusedIndex).toBeNull();
  });
});

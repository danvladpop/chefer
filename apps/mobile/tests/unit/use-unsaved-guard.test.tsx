import { BackHandler } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useUnsavedGuard, type UnsavedGuardOptions } from '../../src/lib/use-unsaved-guard';

// UX-X-01 / WP-01: the shared guard over React Navigation's usePreventRemove.
// The navigation layer is mocked: the mock records the latest
// (preventRemove, callback) pair, which is exactly what the real hook hands
// the navigator — `prevent === true` is what disables the iOS swipe-back.
// RNTL v14: renderHook / act are async — always await them.

type PreventRemoveCallback = (options: { data: { action: unknown } }) => void;
const mockPrevent: { value: boolean; callback: PreventRemoveCallback | null } = {
  value: false,
  callback: null,
};
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
let mockFocused = true;

jest.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack }),
  useIsFocused: () => mockFocused,
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, callback: PreventRemoveCallback) => {
    mockPrevent.value = prevent;
    mockPrevent.callback = callback;
  },
}));

const BACK_ACTION = { type: 'GO_BACK' };

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
const BACK_PRESS = { type: 'hardwareBackPress', timeStamp: 0 } as const;
/** Fires one hardware BACK press at a captured listener; true = it consumed the press. */
const pressBack = (listener: BackListener | undefined) => listener?.(BACK_PRESS) === true;

/** Captures the hardwareBackPress handler the hook registers. */
function spyOnBackHandler() {
  const handlers: BackListener[] = [];
  const remove = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler);
    return { remove };
  });
  return { handlers, remove };
}

beforeEach(() => {
  mockPrevent.value = false;
  mockPrevent.callback = null;
  mockFocused = true;
  mockDispatch.mockClear();
  mockGoBack.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
});

function setup(initialDirty: boolean, options?: UnsavedGuardOptions) {
  return renderHook(({ dirty }: { dirty: boolean }) => useUnsavedGuard(dirty, options), {
    initialProps: { dirty: initialDirty },
  });
}

const blockRemoval = async () => {
  await act(() => {
    mockPrevent.callback?.({ data: { action: BACK_ACTION } });
  });
};

describe('useUnsavedGuard — navigation removal', () => {
  it('clean: removal is not prevented and no confirm is queued', async () => {
    const { result } = await setup(false);
    expect(mockPrevent.value).toBe(false);
    expect(result.current.sheetProps.visible).toBe(false);
  });

  it('dirty: removal is prevented (this also disables the iOS swipe) and the confirm opens', async () => {
    const { result, rerender } = await setup(false);
    await rerender({ dirty: true });
    expect(mockPrevent.value).toBe(true);

    await blockRemoval();
    expect(result.current.sheetProps.visible).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('Discard dispatches the blocked action', async () => {
    const { result } = await setup(true);
    await blockRemoval();

    await act(() => {
      result.current.sheetProps.onConfirm();
    });
    expect(result.current.sheetProps.visible).toBe(false);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(BACK_ACTION);
    // The guard is lifted so the replayed action is not blocked again.
    expect(mockPrevent.value).toBe(false);
  });

  it('Keep editing closes the confirm and dispatches nothing', async () => {
    const { result } = await setup(true);
    await blockRemoval();

    await act(() => {
      result.current.sheetProps.onClose();
    });
    expect(result.current.sheetProps.visible).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockPrevent.value).toBe(true);
  });

  it('uses the supplied copy, and the house default otherwise', async () => {
    const custom = await setup(true, {
      title: 'Discard your changes?',
      message: 'You will lose this recipe.',
      discardLabel: 'Throw away',
      keepLabel: 'Stay',
    });
    expect(custom.result.current.sheetProps).toMatchObject({
      title: 'Discard your changes?',
      body: 'You will lose this recipe.',
      confirmLabel: 'Throw away',
      cancelLabel: 'Stay',
      destructive: true,
    });
    const plain = await setup(true);
    expect(plain.result.current.sheetProps).toMatchObject({
      title: 'Discard changes?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    });
  });

  it('release() lets a deliberate exit through without asking (after a save)', async () => {
    const { result } = await setup(true);
    await act(() => {
      result.current.release();
      // The navigation fires in the same tick, before React lifts the guard.
      mockPrevent.callback?.({ data: { action: BACK_ACTION } });
    });
    expect(result.current.sheetProps.visible).toBe(false);
    expect(mockDispatch).toHaveBeenCalledWith(BACK_ACTION);
    expect(mockPrevent.value).toBe(false);
  });
});

describe('useUnsavedGuard — onBack and Android hardware BACK', () => {
  it('registers no hardware-back handler without onBack (usePreventRemove covers removals)', async () => {
    const { handlers } = spyOnBackHandler();
    await setup(true);
    expect(handlers).toHaveLength(0);
  });

  it('onBack handling the press steps back inside the screen: no confirm, no leaving', async () => {
    const { handlers } = spyOnBackHandler();
    const onBack = jest.fn(() => true);
    const { result } = await setup(true, { onBack });

    expect(handlers).toHaveLength(1);
    let consumed = false;
    await act(() => {
      consumed = pressBack(handlers[0]);
    });
    expect(consumed).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(result.current.sheetProps.visible).toBe(false);

    // The same for a prevented header/swipe removal.
    await blockRemoval();
    expect(result.current.sheetProps.visible).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('dirty and not handled: BACK opens the confirm; Discard then goes back', async () => {
    const { handlers } = spyOnBackHandler();
    const { result } = await setup(true, { onBack: () => false });

    let consumed = false;
    await act(() => {
      consumed = pressBack(handlers[0]);
    });
    expect(consumed).toBe(true);
    expect(result.current.sheetProps.visible).toBe(true);

    await act(() => {
      result.current.sheetProps.onConfirm();
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('clean and not handled: BACK falls through to the default (leave)', async () => {
    const { handlers } = spyOnBackHandler();
    const { result } = await setup(false, { onBack: () => undefined });

    let consumed = true;
    await act(() => {
      consumed = pressBack(handlers[0]);
    });
    expect(consumed).toBe(false);
    expect(result.current.sheetProps.visible).toBe(false);
  });

  it('does not intercept BACK while the screen is not focused, and cleans up', async () => {
    mockFocused = false;
    const { handlers, remove } = spyOnBackHandler();
    await setup(true, { onBack: () => true });
    expect(handlers).toHaveLength(0);

    mockFocused = true;
    const focused = await setup(true, { onBack: () => true });
    expect(handlers).toHaveLength(1);
    await focused.unmount();
    expect(remove).toHaveBeenCalled();
  });
});

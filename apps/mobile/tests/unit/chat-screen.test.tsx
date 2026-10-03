import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { CHAT_ACTIONS_MARKER, type ChatAction } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import ChatScreen from '../../app/chat';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { ChatStreamError, type StreamChatOptions } from '../../src/lib/chat-stream';

// UX-FOOD-21 — the AI Chef screen: the thread survives leaving (per day),
// replies show View / Undo chips for what the chef did, failures read as
// sentences with a retry, Stop and leaving end the request, long replies fold,
// and an empty thread offers starter prompts. The AI stays mocked: streamChat
// is the seam.

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => true }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => 'token' }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));

const mockStream = jest.fn<Promise<unknown>, [StreamChatOptions]>();
jest.mock('../../src/lib/chat-stream', () => ({
  ...jest.requireActual<typeof import('../../src/lib/chat-stream')>('../../src/lib/chat-stream'),
  streamChat: (options: StreamChatOptions) => mockStream(options),
}));

const mockReplace = jest.fn().mockResolvedValue({});
const mockRemoveItem = jest.fn().mockResolvedValue({});
const mockDeleteEntries = jest.fn().mockResolvedValue({});
const mockGetDay = jest.fn<Promise<unknown>, unknown[]>();
const mockInvalidate = jest.fn();
jest.mock('../../src/lib/trpc', () => {
  const invalidate = (...args: unknown[]) => {
    mockInvalidate(...args);
  };
  return {
    trpc: {
      useUtils: () => ({
        mealPlan: { invalidate },
        dashboard: { summary: { invalidate } },
        shoppingList: { invalidate },
        tracker: {
          invalidate,
          getDay: { fetch: (...args: unknown[]) => mockGetDay(...args), invalidate },
          weeklySummary: { invalidate },
          monthlySummary: { invalidate },
          recents: { invalidate },
        },
      }),
      mealPlan: { replaceRecipe: { useMutation: () => ({ mutateAsync: mockReplace }) } },
      shoppingList: { removeCustomItem: { useMutation: () => ({ mutateAsync: mockRemoveItem }) } },
      tracker: { deleteEntries: { useMutation: () => ({ mutateAsync: mockDeleteEntries }) } },
    },
  };
});

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderChat = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ChatScreen />
    </SafeAreaProvider>,
  );

const reply = (text: string, actions: ChatAction[] = []) => {
  const raw = `${text}${actions.length > 0 ? `${CHAT_ACTIONS_MARKER}${JSON.stringify(actions)}` : ''}`;
  return (options: StreamChatOptions) => {
    options.onChunk?.(raw);
    return Promise.resolve({
      fullText: raw,
      quotaExhausted: false,
      healthTopic: false,
      safetyTopic: false,
    });
  };
};

const send = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByTestId('chat-input'), text);
  await user.press(screen.getByTestId('chat-send'));
};

const swap: ChatAction = {
  kind: 'swap',
  label: "Swapped Tuesday's lunch for Quinoa Bowl",
  planId: 'p1',
  dayOfWeek: 1,
  mealType: 'lunch',
  slotIndex: 1,
  previousRecipeId: 'r-old',
};

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  mockStream.mockReset();
});

describe('starters', () => {
  it('an empty thread offers the example prompts, and tapping one sends it', async () => {
    mockStream.mockImplementation(reply('Done.'));
    const user = userEvent.setup();
    await renderChat();
    expect(screen.getByTestId('chat-starter-0')).toHaveTextContent(
      "Swap tomorrow's lunch for something lighter",
    );
    await user.press(screen.getByTestId('chat-starter-1'));
    await waitFor(() => expect(mockStream).toHaveBeenCalled());
    expect(mockStream.mock.calls[0]?.[0].messages.at(-1)?.content).toBe(
      'I had a croissant for breakfast',
    );
    // Once there is a thread the starters are gone.
    expect(screen.queryByTestId('chat-starter-0')).toBeNull();
  });
});

describe('the thread survives leaving (per day)', () => {
  it('comes back when the screen is opened again the same day', async () => {
    mockStream.mockImplementation(reply('A roux is flour and fat.'));
    const user = userEvent.setup();
    const first = await renderChat();
    await send(user, 'what is a roux');
    expect(await screen.findByText('A roux is flour and fat.')).toBeOnTheScreen();
    await first.unmount();

    await renderChat();
    expect(screen.getByText('what is a roux')).toBeOnTheScreen();
    expect(screen.getByText('A roux is flour and fat.')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-empty')).toBeNull();
  });

  it('a thread from another day is not shown', async () => {
    kv.setJSON('chat.thread', {
      date: '2020-01-01',
      messages: [{ id: 1, role: 'user', content: 'old question' }],
    });
    await renderChat();
    expect(screen.queryByText('old question')).toBeNull();
    expect(screen.getByTestId('chat-empty')).toBeOnTheScreen();
  });

  it('"New chat" starts clean and stays clean after leaving', async () => {
    mockStream.mockImplementation(reply('Hello.'));
    const user = userEvent.setup();
    const first = await renderChat();
    await send(user, 'hi');
    await screen.findByText('Hello.');
    await user.press(screen.getByTestId('chat-new'));
    expect(screen.getByTestId('chat-empty')).toBeOnTheScreen();
    await first.unmount();
    await renderChat();
    expect(screen.getByTestId('chat-empty')).toBeOnTheScreen();
  });

  it('a question the app was closed on (never answered) comes back retryable', async () => {
    kv.setJSON('chat.thread', {
      date: localDateStr(),
      messages: [{ id: 1, role: 'user', content: 'swap my lunch' }],
    });
    await renderChat();
    expect(screen.getByTestId('chat-message-1-retry')).toBeOnTheScreen();
  });
});

describe('action chips', () => {
  it('shows what the chef did, hides the trailer, and View goes to that day in Plan', async () => {
    mockStream.mockImplementation(reply('Done, swapped it.', [swap]));
    const user = userEvent.setup();
    await renderChat();
    await send(user, "swap tuesday's lunch");

    expect(await screen.findByText('Done, swapped it.')).toBeOnTheScreen();
    expect(screen.queryByText(/CHEFER_ACTIONS/)).toBeNull();
    const label = screen.getByText(swap.label);
    expect(label).toBeOnTheScreen();

    await user.press(screen.getByLabelText(`View: ${swap.label}`));
    const [target] = router.push.mock.calls.at(-1) as [{ pathname: string; params: object }];
    expect(target).toMatchObject({
      pathname: '/(food)/meal-plan',
      params: { week: '0', day: '1' },
    });
  });

  it('Undo on a swap puts the previous recipe back, and the chip says Undone', async () => {
    mockStream.mockImplementation(reply('Swapped.', [swap]));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'swap');
    await user.press(await screen.findByLabelText(`Undo: ${swap.label}`));

    expect(mockReplace).toHaveBeenCalledWith({
      planId: 'p1',
      dayOfWeek: 1,
      mealType: 'lunch',
      slotIndex: 1,
      recipeId: 'r-old',
    });
    expect(await screen.findByText('Undone')).toBeOnTheScreen();
    expect(screen.queryByLabelText(`Undo: ${swap.label}`)).toBeNull();
  });

  it('Undo on a logged meal deletes the entry it created', async () => {
    const logged: ChatAction = {
      kind: 'logged',
      label: 'Logged croissant (270 kcal)',
      date: '2026-10-03',
      name: 'croissant',
      kcal: 270,
    };
    mockGetDay.mockResolvedValue({
      log: {
        loggedMeals: [
          { entryId: 'e1', custom: { name: 'tea' }, kcal: 10 },
          { entryId: 'e2', custom: { name: 'croissant' }, kcal: 270 },
        ],
      },
    });
    mockStream.mockImplementation(reply('Logged it.', [logged]));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'I had a croissant');
    await user.press(await screen.findByLabelText(`Undo: ${logged.label}`));
    await waitFor(() =>
      expect(mockDeleteEntries).toHaveBeenCalledWith({ date: '2026-10-03', entryIds: ['e2'] }),
    );
  });

  it('Undo on shopping-list items removes each one', async () => {
    const shopping: ChatAction = {
      kind: 'shopping',
      label: 'Added to your shopping list: Oat milk, Flour',
      planId: 'p1',
      keys: ['k1', 'k2'],
    };
    mockStream.mockImplementation(reply('Added.', [shopping]));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'add oat milk and flour');
    await user.press(await screen.findByLabelText(`Undo: ${shopping.label}`));
    await waitFor(() => expect(mockRemoveItem).toHaveBeenCalledTimes(2));
    expect(mockRemoveItem).toHaveBeenCalledWith({ planId: 'p1', key: 'k2' });
  });

  it('a failed Undo says so and can be tried again', async () => {
    mockReplace.mockRejectedValueOnce(new Error('boom'));
    mockStream.mockImplementation(reply('Swapped.', [swap]));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'swap');
    await user.press(await screen.findByLabelText(`Undo: ${swap.label}`));
    expect(await screen.findByText(/Couldn't undo that/)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Undo: ${swap.label}`)).toBeOnTheScreen();
  });

  it('an import has View but no Undo', async () => {
    const imported: ChatAction = { kind: 'imported', label: 'Imported Pad Thai', recipeId: 'rid' };
    mockStream.mockImplementation(reply('Imported.', [imported]));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'import https://x.test/r');
    await screen.findByText('Imported Pad Thai');
    expect(screen.queryByLabelText(`Undo: ${imported.label}`)).toBeNull();
    await user.press(screen.getByLabelText(`View: ${imported.label}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: 'rid' } });
  });

  it('never shows a half-arrived trailer while the reply streams', async () => {
    let finish: (() => void) | undefined;
    mockStream.mockImplementation(async (options) => {
      options.onChunk?.('Swapping now.');
      options.onChunk?.(CHAT_ACTIONS_MARKER.slice(0, 5));
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        fullText: 'Swapping now.',
        quotaExhausted: false,
        healthTopic: false,
        safetyTopic: false,
      };
    });
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'swap');
    expect(await screen.findByText('Swapping now.')).toBeOnTheScreen();
    expect(screen.queryByText(/CHEFER/)).toBeNull();
    await act(() => {
      finish?.();
    });
  });
});

describe('failures', () => {
  it('a 502 reads as a sentence, the question offers Tap to retry, and retry sends it again', async () => {
    mockStream.mockRejectedValueOnce(new ChatStreamError(502, null));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'what is a roux');

    expect(await screen.findByTestId('chat-error')).toHaveTextContent(
      'The chef is unavailable right now. Try again in a moment.',
    );
    expect(screen.queryByText(/Chat failed/)).toBeNull();

    mockStream.mockImplementationOnce(reply('A roux is flour and fat.'));
    await user.press(screen.getByTestId('chat-message-1-retry'));
    expect(await screen.findByText('A roux is flour and fat.')).toBeOnTheScreen();
    // One question on screen (the failed one was replaced), no error, and the
    // chef was asked exactly the question, once, without the failed copy.
    expect(screen.getAllByText('what is a roux')).toHaveLength(1);
    expect(screen.queryByTestId('chat-error')).toBeNull();
    expect(mockStream.mock.calls[1]?.[0].messages).toEqual([
      { role: 'user', content: 'what is a roux' },
    ]);
  });

  it('keeps the server’s own sentence, and never the bare "Unauthorized"', async () => {
    mockStream.mockRejectedValueOnce(
      new ChatStreamError(503, 'The chef is over capacity. Try again later.'),
    );
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'hello');
    expect(await screen.findByTestId('chat-error')).toHaveTextContent(
      'The chef is over capacity. Try again later.',
    );
  });

  it('a dropped connection reads as the shared offline sentence', async () => {
    mockStream.mockRejectedValueOnce(new TypeError('Network request failed'));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'hello');
    expect(await screen.findByTestId('chat-error')).toHaveTextContent(/Can't reach Chefer/);
  });
});

describe('Stop and leaving', () => {
  const hangUntilAborted = (partial: string) => async (options: StreamChatOptions) => {
    options.onChunk?.(partial);
    await new Promise<void>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
    return undefined;
  };

  it('Stop ends the reply, keeps what arrived and shows no error', async () => {
    mockStream.mockImplementation(hangUntilAborted('Let me think about'));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'swap');
    await user.press(await screen.findByTestId('chat-stop'));

    expect(await screen.findByText('Let me think about')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeOnTheScreen());
    expect(screen.getByText('Reply stopped.')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-error')).toBeNull();
  });

  it('Stop before anything arrived leaves no empty bubble', async () => {
    mockStream.mockImplementation(hangUntilAborted(''));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'swap');
    await user.press(await screen.findByTestId('chat-stop'));
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeOnTheScreen());
    expect(screen.queryByText('…')).toBeNull();
  });

  it('leaving the screen aborts the request', async () => {
    let signal: AbortSignal | undefined;
    mockStream.mockImplementation(async (options) => {
      signal = options.signal;
      return new Promise(() => undefined);
    });
    const user = userEvent.setup();
    const view = await renderChat();
    await send(user, 'swap');
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);
    await view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe('long replies', () => {
  const long = `${'The chef recommends a slow, patient approach to the sauce. '.repeat(12)}Enjoy.`;

  it('fold behind Show more, and unfold', async () => {
    mockStream.mockImplementation(reply(long));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'explain');
    const text = await screen.findByTestId('chat-message-2-text');
    expect(text.props.numberOfLines).toBe(6);
    await user.press(screen.getByTestId('chat-message-2-toggle'));
    expect(screen.getByTestId('chat-message-2-text').props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('chat-message-2-toggle')).toHaveTextContent('Show less');
  });

  it('a short reply is never folded', async () => {
    mockStream.mockImplementation(reply('Sure.'));
    const user = userEvent.setup();
    await renderChat();
    await send(user, 'ok');
    await screen.findByText('Sure.');
    expect(screen.queryByTestId('chat-message-2-toggle')).toBeNull();
  });
});

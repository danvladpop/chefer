// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_ACTIONS_MARKER, type ChatAction } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { ChatWidget } from './ChatWidget';

type ChatState = { messages: UIMessage[]; status: 'ready' | 'submitted' | 'streaming' | 'error' };
let chatState: ChatState = { messages: [], status: 'ready' };
const chat = vi.hoisted(() => ({
  stop: vi.fn(),
  regenerate: vi.fn(),
  setMessages: vi.fn(),
  clearError: vi.fn(),
  sendMessage: vi.fn(),
  options: undefined as { messages?: unknown[]; onError?: (e: unknown) => void } | undefined,
  transportConfig: undefined as { fetch?: typeof fetch } | undefined,
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { messages?: unknown[]; onError?: (e: unknown) => void }) => {
    chat.options = options;
    return {
      ...chatState,
      sendMessage: chat.sendMessage,
      stop: chat.stop,
      regenerate: chat.regenerate,
      setMessages: chat.setMessages,
      clearError: chat.clearError,
    };
  },
}));
vi.mock('ai', () => ({
  TextStreamChatTransport: vi.fn().mockImplementation((config: { fetch?: typeof fetch }) => {
    chat.transportConfig = config;
    return {};
  }),
}));
const trpcMocks = vi.hoisted(() => ({
  replace: vi.fn().mockResolvedValue({}),
  removeItem: vi.fn().mockResolvedValue({}),
  deleteEntries: vi.fn().mockResolvedValue({}),
  getDay: vi.fn(),
}));
vi.mock('@/lib/trpc', () => {
  const invalidate = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        mealPlan: { invalidate },
        dashboard: { summary: { invalidate } },
        shoppingList: { invalidate },
        tracker: {
          invalidate,
          getDay: { fetch: trpcMocks.getDay, invalidate },
          weeklySummary: { invalidate },
          monthlySummary: { invalidate },
          recents: { invalidate },
        },
      }),
      mealPlan: { replaceRecipe: { useMutation: () => ({ mutateAsync: trpcMocks.replace }) } },
      shoppingList: {
        removeCustomItem: { useMutation: () => ({ mutateAsync: trpcMocks.removeItem }) },
      },
      tracker: { deleteEntries: { useMutation: () => ({ mutateAsync: trpcMocks.deleteEntries }) } },
    },
  };
});
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => true }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
// Consent already on record: the guard runs the send straight away.
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  useAiConsentOpen: () => false,
}));
vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: () => <button type="button">Upgrade</button>,
}));

const msg = (id: string, role: 'user' | 'assistant', text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text }],
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  chat.options = undefined;
  chatState = { messages: [], status: 'ready' };
  // jsdom doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('ChatWidget (F-AI-1-4)', () => {
  it('opens as a labelled modal dialog with focus in the input', () => {
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Open AI Chef chat' }));

    const dialog = screen.getByRole('dialog', { name: 'Ask Your Chef' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Message the chef' }));
  });

  it('closes on Escape and returns focus to the FAB', () => {
    render(<ChatWidget />);
    const fab = screen.getByRole('button', { name: 'Open AI Chef chat' });
    fireEvent.click(fab);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(fab);
  });

  it('announces the assistant reply once streaming finishes', () => {
    const { rerender, container } = render(<ChatWidget />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('');

    chatState = {
      messages: [msg('1', 'user', 'Hi'), msg('2', 'assistant', 'Hel')],
      status: 'streaming',
    };
    rerender(<ChatWidget />);
    expect(live?.textContent).toBe('');

    chatState = {
      messages: [msg('1', 'user', 'Hi'), msg('2', 'assistant', 'Hello there!')],
      status: 'ready',
    };
    act(() => rerender(<ChatWidget />));
    expect(live?.textContent).toBe('Chef: Hello there!');
  });
});

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Open AI Chef chat' }));

const swap: ChatAction = {
  kind: 'swap',
  label: "Swapped Tuesday's lunch for Quinoa Bowl",
  planId: 'p1',
  dayOfWeek: 1,
  mealType: 'lunch',
  slotIndex: 1,
  previousRecipeId: 'r-old',
};
const withTrailer = (text: string, actions: ChatAction[]) =>
  `${text}${CHAT_ACTIONS_MARKER}${JSON.stringify(actions)}`;

// UX-FOOD-21 on web: the thread survives a reload (per day), replies carry
// View / Undo chips, failures read as sentences with Try again, Stop ends a
// reply, and long replies fold.
describe('ChatWidget (UX-FOOD-21)', () => {
  it('opts in to the action trailer on every request', async () => {
    render(<ChatWidget />);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await chat.transportConfig?.fetch?.('/api/chat', { method: 'POST' });
    const init = fetchSpy.mock.calls.at(0)?.[1];
    expect(new Headers(init?.headers).get('x-chefer-chat-actions')).toBe('1');
    fetchSpy.mockRestore();
  });

  it('shows what the chef did, hides the trailer, and Undo puts the recipe back', async () => {
    chatState = {
      messages: [
        msg('1', 'user', "swap tuesday's lunch"),
        msg('2', 'assistant', withTrailer('Done, swapped it.', [swap])),
      ],
      status: 'ready',
    };
    render(<ChatWidget />);
    open();
    expect(screen.getByText('Done, swapped it.')).toBeTruthy();
    expect(screen.queryByText(/CHEFER_ACTIONS/)).toBeNull();
    expect(screen.getByText(swap.label)).toBeTruthy();
    expect(screen.getByRole('link', { name: `View: ${swap.label}` }).getAttribute('href')).toBe(
      '/meal-plan?week=0&day=1',
    );

    fireEvent.click(screen.getByRole('button', { name: `Undo: ${swap.label}` }));
    await waitFor(() =>
      expect(trpcMocks.replace).toHaveBeenCalledWith({
        planId: 'p1',
        dayOfWeek: 1,
        mealType: 'lunch',
        slotIndex: 1,
        recipeId: 'r-old',
      }),
    );
    expect(await screen.findByText('Undone')).toBeTruthy();
  });

  it('an import has View but no Undo', () => {
    const imported: ChatAction = { kind: 'imported', label: 'Imported Pad Thai', recipeId: 'rid' };
    chatState = {
      messages: [msg('2', 'assistant', withTrailer('Imported.', [imported]))],
      status: 'ready',
    };
    render(<ChatWidget />);
    open();
    expect(screen.getByRole('link', { name: 'View: Imported Pad Thai' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('a failed request reads as a sentence with Try again, never "Chat failed (502)"', async () => {
    chatState = { messages: [msg('1', 'user', 'what is a roux')], status: 'error' };
    render(<ChatWidget />);
    open();
    // The transport saw a proxy 502 with no JSON body.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    await chat.transportConfig?.fetch?.('/api/chat', { method: 'POST' });
    act(() => chat.options?.onError?.(new Error('Bad gateway')));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'The chef is unavailable right now. Try again in a moment.',
    );
    expect(alert.textContent).not.toMatch(/502|Chat failed/);

    fireEvent.click(screen.getByTestId('chat-retry'));
    expect(chat.regenerate).toHaveBeenCalledTimes(1);
  });

  it('Stop replaces Send while the chef is answering', () => {
    chatState = { messages: [msg('1', 'user', 'hi')], status: 'streaming' };
    render(<ChatWidget />);
    open();
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(chat.stop).toHaveBeenCalledTimes(1);
  });

  it('folds a long reply behind Show more, and never a short one or the live one', () => {
    const long = 'The chef recommends a slow, patient approach to the sauce. '.repeat(12);
    chatState = {
      messages: [msg('1', 'user', 'explain'), msg('2', 'assistant', long)],
      status: 'ready',
    };
    const { rerender } = render(<ChatWidget />);
    open();
    expect(screen.getByTestId('chat-message-2-text').className).toContain('line-clamp-6');
    fireEvent.click(screen.getByTestId('chat-message-2-toggle'));
    expect(screen.getByTestId('chat-message-2-text').className).not.toContain('line-clamp-6');
    expect(screen.getByTestId('chat-message-2-toggle').textContent).toBe('Show less');
    expect(screen.queryByTestId('chat-message-1-toggle')).toBeNull();

    // Still streaming: shown in full.
    chatState = {
      messages: [msg('1', 'user', 'explain'), msg('3', 'assistant', long)],
      status: 'streaming',
    };
    rerender(<ChatWidget />);
    expect(screen.queryByTestId('chat-message-3-toggle')).toBeNull();
  });

  it('keeps today’s thread across a reload, and drops another day’s', () => {
    const stored = [msg('1', 'user', 'what is a roux'), msg('2', 'assistant', 'Flour and fat.')];
    window.sessionStorage.setItem(
      'chefer.chat.thread',
      JSON.stringify({ date: localDateStr(), messages: stored, undone: {} }),
    );
    render(<ChatWidget />);
    expect(chat.options?.messages).toEqual(stored);
    cleanup();

    window.sessionStorage.setItem(
      'chefer.chat.thread',
      JSON.stringify({ date: '2020-01-01', messages: stored, undone: {} }),
    );
    render(<ChatWidget />);
    expect(chat.options?.messages).toEqual([]);
  });

  it('saves the settled thread, and "New chat" clears it', () => {
    chatState = {
      messages: [msg('1', 'user', 'hi'), msg('2', 'assistant', 'Hello!')],
      status: 'ready',
    };
    const { rerender } = render(<ChatWidget />);
    expect(JSON.parse(window.sessionStorage.getItem('chefer.chat.thread') ?? 'null')).toMatchObject(
      {
        date: localDateStr(),
      },
    );
    open();
    fireEvent.click(screen.getByTestId('chat-new'));
    expect(chat.setMessages).toHaveBeenCalledWith([]);
    // The SDK empties the thread; nothing is saved for the empty one.
    chatState = { messages: [], status: 'ready' };
    rerender(<ChatWidget />);
    expect(window.sessionStorage.getItem('chefer.chat.thread')).toBeNull();
  });
});

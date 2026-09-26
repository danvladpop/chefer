// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWidget } from './ChatWidget';

type ChatState = { messages: UIMessage[]; status: 'ready' | 'submitted' | 'streaming' | 'error' };
let chatState: ChatState = { messages: [], status: 'ready' };

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({ ...chatState, sendMessage: vi.fn() }),
}));
vi.mock('ai', () => ({ TextStreamChatTransport: vi.fn() }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => true }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: () => <button type="button">Upgrade</button>,
}));

const msg = (id: string, role: 'user' | 'assistant', text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text }],
});

beforeEach(() => {
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

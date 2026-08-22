'use client';

import { useEffect, useRef, useState } from 'react';
import { capture } from '@/lib/analytics';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, type UIMessage } from 'ai';
import { MessageCircle, Send, X } from 'lucide-react';

// Showcase what the chat can actually DO with the user's real plan (P1-4).
const SUGGESTED_PROMPTS = [
  'How much protein am I eating today?',
  "Swap tomorrow's lunch for something else",
  "Scale tonight's dinner for 4 people",
];

function getMessageText(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('');
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [chatError, setChatError] = useState<string | null>(null);
  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({ api: '/api/chat' }),
    onError: () => setChatError('The chef is unavailable right now — please try again.'),
  });
  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue('');
    setChatError(null);
    capture('chat_message_sent');
    void sendMessage({ text });
  };

  const sendSuggested = (prompt: string) => {
    if (isLoading) return;
    setChatError(null);
    capture('chat_message_sent', { suggested: true });
    void sendMessage({ text: prompt });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* FAB — sits above the mobile tab bar, back in the corner at lg+ */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#944a00] text-white shadow-lg transition hover:scale-105 hover:bg-[#7a3d00] lg:bottom-6 lg:right-6"
        aria-label={open ? 'Close AI Chef chat' : 'Open AI Chef chat'}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel — full-width bottom sheet on phones (a 320px floating card
          overflows a 320px screen), floating card from sm up. */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border border-neutral-200 bg-white pb-safe shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-96 sm:rounded-2xl sm:pb-0">
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 rounded-t-2xl border-b bg-[#944a00] px-4 py-3">
            <span className="text-xl">🍳</span>
            <div>
              <p className="text-sm font-semibold text-white">Ask Your Chef</p>
              <p className="text-[10px] text-white/70">AI-powered cooking assistant</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex max-h-[55dvh] flex-col gap-3 overflow-y-auto overscroll-contain p-4 sm:max-h-80">
            {messages.length === 0 && (
              <div>
                <p className="mb-3 text-xs text-neutral-500">Try asking:</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendSuggested(prompt)}
                      className="rounded-xl border border-neutral-200 px-3 py-2.5 text-left text-sm text-neutral-600 transition-colors hover:border-[#944a00]/30 hover:bg-[#fff8f0] sm:text-xs"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m: UIMessage) => {
              const text = getMessageText(m);
              if (!text) return null;
              return (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <span className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#944a00] text-[10px] font-bold text-white">
                      C
                    </span>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'bg-[#944a00] text-white'
                        : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    {text}
                  </div>
                </div>
              );
            })}
            {chatError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {chatError}
              </div>
            )}
            {isLoading && (
              <div className="flex justify-start">
                <span className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#944a00] text-[10px] font-bold text-white">
                  C
                </span>
                <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex shrink-0 gap-2 border-t p-3">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your chef anything…"
              disabled={isLoading}
              className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-base focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00] disabled:opacity-50 sm:text-sm"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#944a00] text-white transition hover:bg-[#7a3d00] disabled:opacity-40 sm:h-9 sm:w-9"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

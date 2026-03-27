'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, type UIMessage } from 'ai';
import { MessageCircle, Send, X } from 'lucide-react';

const SUGGESTED_PROMPTS = [
  'What can I substitute for chicken?',
  'How do I meal prep quinoa?',
  'Make me a high-protein breakfast idea',
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

  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({ api: '/api/chat' }),
  });
  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue('');
    void sendMessage({ text });
  };

  const sendSuggested = (prompt: string) => {
    if (isLoading) return;
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
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#944a00] text-white shadow-lg transition hover:scale-105 hover:bg-[#7a3d00]"
        aria-label="Open AI Chef chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-80 flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl sm:w-96">
          {/* Header */}
          <div className="flex items-center gap-3 rounded-t-2xl border-b bg-[#944a00] px-4 py-3">
            <span className="text-xl">🍳</span>
            <div>
              <p className="text-sm font-semibold text-white">Ask Your Chef</p>
              <p className="text-[10px] text-white/70">AI-powered cooking assistant</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-white/80 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div>
                <p className="mb-3 text-xs text-neutral-400">Try asking:</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendSuggested(prompt)}
                      className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-xs text-neutral-600 transition-colors hover:border-[#944a00]/30 hover:bg-[#fff8f0]"
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
          <div className="flex gap-2 border-t p-3">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your chef anything…"
              disabled={isLoading}
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#944a00] text-white transition hover:bg-[#7a3d00] disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

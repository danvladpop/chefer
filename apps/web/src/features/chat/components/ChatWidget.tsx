'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAiConsent, useAiConsentOpen } from '@/features/ai-consent/AiConsentProvider';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useIsPremium } from '@/hooks/useIsPremium';
import { capture } from '@/lib/analytics';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, type UIMessage } from 'ai';
import { MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { LockedChatPreview } from './LockedChatPreview';

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const panelId = useId();
  // Screen readers hear the assistant's reply once, when streaming finishes —
  // a live region on the thread itself would re-read every streamed chunk.
  const [announcement, setAnnouncement] = useState('');

  const [chatError, setChatError] = useState<string | null>(null);

  // Over-quota is an upgrade moment, not an error: the API answers the last
  // free message with a 200 text reply plus this header, and the widget swaps
  // the input for the shared upgrade surface (PW-2's 10th touchpoint,
  // source: chat-quota — it was a bare text reply until now).
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const isPremium = useIsPremium();
  // Free tier: chat is premium-only — show the locked preview, no input.
  const locked = isPremium === false;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  useEffect(() => {
    if (isPremium) setQuotaExhausted(false);
  }, [isPremium]);

  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({
      api: '/api/chat',
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await fetch(input, init);
        if (res.headers.get('X-Chat-Quota-Exhausted') === '1') setQuotaExhausted(true);
        return res;
      },
    }),
    onError: () => setChatError('The chef is unavailable right now — please try again.'),
  });
  const isLoading = status === 'submitted' || status === 'streaming';

  // AI data consent (App Store 5.1.2(i)): the first message asks before
  // anything is sent. While the consent sheet is up, the panel's own focus
  // trap and Escape stand down so the sheet owns the keyboard.
  const requestAiConsent = useAiConsent();
  const consentOpen = useAiConsentOpen();
  const consentOpenRef = useRef(consentOpen);
  consentOpenRef.current = consentOpen;

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true;
      return;
    }
    if (!wasLoadingRef.current) return;
    wasLoadingRef.current = false;
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') setAnnouncement(getMessageText(last));
  }, [isLoading, messages]);

  const close = useCallback(() => {
    setOpen(false);
    fabRef.current?.focus();
  }, []);

  // Dialog behaviour (F-AI-1-4): focus the input on open, Escape closes and
  // returns focus to the FAB, Tab stays inside the panel.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const input = inputRef.current;
    // The input is display:none on the locked (free) preview.
    if (input && !input.disabled && !lockedRef.current) input.focus();
    else (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (consentOpenRef.current) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.getClientRects().length > 0,
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, close]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isLoading || quotaExhausted) return;
    requestAiConsent('chat', () => {
      setInputValue('');
      setChatError(null);
      capture('chat_message_sent');
      void sendMessage({ text });
    });
  };

  const sendSuggested = (prompt: string) => {
    if (isLoading || quotaExhausted) return;
    requestAiConsent('chat', () => {
      setChatError(null);
      capture('chat_message_sent', { suggested: true });
      void sendMessage({ text: prompt });
    });
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
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement ? `Chef: ${announcement}` : ''}
      </div>

      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#944a00] text-white shadow-lg transition hover:scale-105 hover:bg-[#7a3d00] lg:bottom-6 lg:right-6"
        aria-label={open ? 'Close AI Chef chat' : 'Open AI Chef chat'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        )}
      </button>

      {/* Panel — full-width bottom sheet on phones (a 320px floating card
          overflows a 320px screen), floating card from sm up. */}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col outline-none rounded-t-2xl border border-neutral-200 bg-white pb-safe shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-96 sm:rounded-2xl sm:pb-0"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 rounded-t-2xl border-b bg-[#944a00] px-4 py-3">
            <span className="text-xl" aria-hidden="true">
              🍳
            </span>
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-white">
                Ask Your Chef
              </h2>
              <p className="text-xs text-white/80">AI-powered cooking assistant</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close chat"
              className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex max-h-[55dvh] flex-col gap-3 overflow-y-auto overscroll-contain p-4 sm:max-h-80">
            {locked && <LockedChatPreview />}
            {!locked && messages.length === 0 && (
              <div>
                <p className="mb-3 text-xs text-neutral-500">Try asking:</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendSuggested(prompt)}
                      className="min-h-11 rounded-xl border border-neutral-200 px-3 py-2.5 text-left text-sm text-neutral-600 transition-colors hover:border-[#944a00]/30 hover:bg-[#fff8f0]"
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
                    <span
                      className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#944a00] text-xs font-bold text-white"
                      aria-hidden="true"
                    >
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
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                {chatError}
              </div>
            )}
            {quotaExhausted && (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="flex items-start gap-2 text-xs text-amber-900">
                  <Sparkles
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                  The AI chef is part of Premium — it can swap meals, log what you ate and build
                  your list for you.
                </p>
                <UpgradeButton className="min-h-11 w-full" source="chat-quota" />
              </div>
            )}
            {isLoading && (
              <div className="flex justify-start">
                <span
                  className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#944a00] text-xs font-bold text-white"
                  aria-hidden="true"
                >
                  C
                </span>
                <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={`${locked ? 'hidden' : 'flex'} shrink-0 gap-2 border-t p-3`}>
            <input
              ref={inputRef}
              aria-label="Message the chef"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                quotaExhausted ? 'Out of free messages today' : 'Ask your chef anything…'
              }
              disabled={isLoading || quotaExhausted}
              className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-base focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00] disabled:opacity-50 sm:text-sm"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#944a00] text-white transition hover:bg-[#7a3d00] disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

import { TRPCError } from '@trpc/server';
import express, {
  Router,
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { CHAT_ACTIONS_HEADER, CHAT_LIMITS, CHAT_MESSAGE_TOO_LONG_MESSAGE } from '@chefer/types';
import { isHealthTopic, isSafetyTopic } from '@chefer/utils';
import { chatService } from '../application/chat/chat.service.js';
import { rejectWithoutAiConsent } from '../lib/ai-consent-gate.js';
import { AI_OVER_CAPACITY_MESSAGE, isAiCapacityFailure } from '../lib/ai/friendly-error.js';
import type { ChatMessage } from '../lib/ai/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { authOnce } from '../lib/route-rate-limit.js';

// ─── AI chef chat endpoint (P1-4) ─────────────────────────────────────────────
// Plain-text streaming over POST — the web widget's TextStreamChatTransport
// posts the ai-sdk message array here and renders the raw text chunks. Lives
// on the API (not a Next route) so the chat reaches real services without
// apps/web touching Prisma (CLAUDE.md Architecture Rule 1); Caddy routes
// /api/chat to this app in production, a Next rewrite proxies it in dev.

/** The ai-sdk widget sends either parts-based or content-based messages. */
interface IncomingMessage {
  role: string;
  parts?: { type: string; text?: string }[];
  content?: string;
}

/**
 * The ai-sdk/mobile message array → what the model sees: text only, empty
 * messages dropped, the newest CHAT_LIMITS.historyMessages (12) kept, and
 * every earlier message cut to CHAT_LIMITS.maxHistoryMessageChars. The LAST
 * message (the one being sent) is left whole so the caller can reject it when
 * it is over the per-message cap, instead of silently cutting the question.
 */
export function toChatMessages(messages: IncomingMessage[]): ChatMessage[] {
  const kept = messages
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content:
        m.parts
          ?.filter((p) => p.type === 'text')
          .map((p) => p.text ?? '')
          .join('') ??
        m.content ??
        '',
    }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-CHAT_LIMITS.historyMessages); // bound the history the model sees
  return kept.map((m, i) =>
    i === kept.length - 1
      ? m
      : { ...m, content: m.content.slice(0, CHAT_LIMITS.maxHistoryMessageChars) },
  );
}

/** True when the message being sent is a user message over the per-message cap. */
export function isOverLongMessage(messages: ChatMessage[]): boolean {
  const last = messages.at(-1);
  return last?.role === 'user' && last.content.length > CHAT_LIMITS.maxMessageChars;
}

const CHAT_BODY_TOO_LARGE_MESSAGE =
  'This conversation is too long to send. Start a new chat and ask again.';

/**
 * POST /api/chat's own JSON body parser (64 KB, Phase 1 guardrails). index.ts
 * mounts it BEFORE the global `express.json({ limit: '10mb' })`: body-parser
 * skips a request whose body was already read, so the first parser that runs
 * sets the limit. The error handler rides in the same mount — a router's own
 * error middleware never sees a parser error raised outside it — and answers
 * the plain-string `{ error }` shape both chat clients show verbatim.
 */
export const chatBodyParser: (RequestHandler | ErrorRequestHandler)[] = [
  express.json({ limit: CHAT_LIMITS.maxBodyBytes }),
  ((err, _req, res, next) => {
    const type = typeof err === 'object' && err !== null ? (err as { type?: unknown }).type : null;
    if (type === 'entity.too.large') {
      res.status(413).json({ error: CHAT_BODY_TOO_LARGE_MESSAGE });
      return;
    }
    next(err);
  }) satisfies ErrorRequestHandler,
];

export const chatRouter: Router = Router();

chatRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = await authOnce(req, res);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // R-10 (App Store 5.1.2(i)): no AI-data consent on record → nothing is
    // sent. 403 + `reason` + X-AI-Consent-Required; clients open the consent
    // sheet, older ones show `error`.
    if (await rejectWithoutAiConsent(res, { userId: user.id })) return;

    const body = req.body as { messages?: IncomingMessage[] } | undefined;
    const messages = toChatMessages(body?.messages ?? []);
    if (messages.length === 0) {
      res.status(400).json({ error: 'No message provided.' });
      return;
    }
    // Phase 1 guardrails: one message is at most 2,000 characters. Rejected
    // before the quota is reserved, so it costs the user nothing.
    if (isOverLongMessage(messages)) {
      res.status(400).json({ error: CHAT_MESSAGE_TOO_LONG_MESSAGE });
      return;
    }

    // UX-22 (T-22.2, AC4): classify the LAST user message (pure keyword
    // match, `@chefer/utils`) and set the flag headers before streaming —
    // the plain-text stream has no "final event" to carry them on. The
    // client renders the matching disclaimer footer under the reply that
    // follows. Belt on top of the system-prompt guardrail, not the primary
    // control (a false negative just skips one footer, never the guardrail).
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage && isHealthTopic(lastUserMessage.content)) {
      res.setHeader('X-Chat-Health-Topic', '1');
    }
    if (lastUserMessage && isSafetyTopic(lastUserMessage.content)) {
      res.setHeader('X-Chat-Safety-Topic', '1');
    }

    let stream: ReadableStream;
    try {
      // UX-FOOD-21: only a client that asks gets the action trailer.
      stream = await chatService.chat(user, messages, {
        withActions: req.header(CHAT_ACTIONS_HEADER) === '1',
      });
    } catch (err) {
      // FORBIDDEN = chat is premium-only for this tier (per-user AI, owner
      // decision 2026-09-25). It rides the same 200 + quota-header path so
      // shipped mobile builds show their upgrade surface, plus a new header
      // for clients that render the locked preview.
      if (err instanceof TRPCError && err.code === 'FORBIDDEN') {
        res.setHeader('X-Chat-Upgrade-Required', '1');
      }
      if (
        err instanceof TRPCError &&
        (err.code === 'TOO_MANY_REQUESTS' || err.code === 'FORBIDDEN')
      ) {
        // Deliver the quota message as a normal chat reply (200 text stream)
        // — the widget renders it inline instead of a generic transport error.
        // The header is the machine-readable signal: the widget swaps its
        // input for the shared upgrade surface (source: chat-quota), so this
        // touchpoint feeds the PW-3 funnel like every other gate.
        res.setHeader('X-Chat-Quota-Exhausted', '1');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(err.message);
        return;
      }
      console.error('Chat failed:', err);
      // Every provider out of capacity (free-tier caps): the same calm
      // sentence as everywhere else — mobile shows `error` verbatim.
      if (isAiCapacityFailure(err)) {
        res.status(503).json({ error: AI_OVER_CAPACITY_MESSAGE });
        return;
      }
      res.status(500).json({ error: 'The chef is unavailable right now. Please try again.' });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
    }
  }),
);

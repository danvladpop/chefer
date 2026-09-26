import { TRPCError } from '@trpc/server';
import { Router, type Request, type Response } from 'express';
import { chatService } from '../application/chat/chat.service.js';
import { AI_OVER_CAPACITY_MESSAGE, isAiCapacityFailure } from '../lib/ai/friendly-error.js';
import type { ChatMessage } from '../lib/ai/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { resolveRequestAuth } from '../lib/session-auth.js';

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

function toChatMessages(messages: IncomingMessage[]): ChatMessage[] {
  return messages
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
    .slice(-20); // bound the history the model sees
}

export const chatRouter: Router = Router();

chatRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = await resolveRequestAuth(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as { messages?: IncomingMessage[] } | undefined;
    const messages = toChatMessages(body?.messages ?? []);
    if (messages.length === 0) {
      res.status(400).json({ error: 'No message provided.' });
      return;
    }

    let stream: ReadableStream;
    try {
      stream = await chatService.chat(user, messages);
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

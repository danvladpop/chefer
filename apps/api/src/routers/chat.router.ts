import { TRPCError } from '@trpc/server';
import { Router, type Request, type Response } from 'express';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { chatService } from '../application/chat/chat.service.js';
import type { ChatMessage } from '../lib/ai/index.js';
import { asyncHandler } from '../lib/async-handler.js';

// ─── AI chef chat endpoint (P1-4) ─────────────────────────────────────────────
// Plain-text streaming over POST — the web widget's TextStreamChatTransport
// posts the ai-sdk message array here and renders the raw text chunks. Lives
// on the API (not a Next route) so the chat reaches real services without
// apps/web touching Prisma (CLAUDE.md Architecture Rule 1); Caddy routes
// /api/chat to this app in production, a Next rewrite proxies it in dev.

// Inlined session lookup (same pattern as the uploads/SSE routers).
function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('chefer_session='));
  return cookie ? (cookie.split('=')[1] ?? null) : null;
}

async function resolveUser(cookieHeader: string | undefined): Promise<UserProfile | null> {
  const token = extractSessionToken(cookieHeader);
  if (!token) return null;
  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            role: true,
            planTier: true,
            image: true,
          },
        },
      },
    });
    if (!session || session.expires < new Date()) return null;
    return session.user;
  } catch {
    return null;
  }
}

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
    const user = await resolveUser(req.headers.cookie);
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
      if (err instanceof TRPCError && err.code === 'TOO_MANY_REQUESTS') {
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

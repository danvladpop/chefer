import { Router, type Request, type Response } from 'express';
import { prisma, ImageStatus } from '@chefer/database';
import {
  recipeImageEventEmitter,
  type RecipeImageEvent,
} from '../lib/sse/recipe-image-emitter.js';

const MAX_IDS = 50;

// ─── Auth helpers (inlined from auth.middleware to avoid circular imports) ────

function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const sessionCookieName = 'chefer_session';
  const cookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${sessionCookieName}=`));
  return cookie ? (cookie.split('=')[1] ?? null) : null;
}

async function resolveUserId(cookieHeader: string | undefined): Promise<string | null> {
  const token = extractSessionToken(cookieHeader);
  if (!token) return null;
  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      select: { userId: true, expires: true },
    });
    if (!session || session.expires < new Date()) return null;
    return session.userId;
  } catch {
    return null;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const recipeImagesSseRouter = Router();

recipeImagesSseRouter.get('/stream', async (req: Request, res: Response) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const userId = await resolveUserId(req.headers.cookie);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const raw = req.query['recipeIds'];
  const recipeIds: string[] =
    typeof raw === 'string'
      ? raw
          .split(',')
          .filter((id) => id.trim().length > 0)
          .slice(0, MAX_IDS)
      : [];

  if (recipeIds.length === 0) {
    res.status(400).json({ error: 'recipeIds query param required (max 50, comma-separated)' });
    return;
  }

  // ── SSE headers ───────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
  res.flushHeaders();

  let closed = false;
  const send = (recipeId: string, payload: RecipeImageEvent) => {
    if (closed || res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify({ recipeId, ...payload })}\n\n`);
    } catch {
      // Client disconnected between the guard check and the write — safe to ignore
    }
  };

  // ── 1. Immediately flush already-resolved recipes ────────────────────────
  // Fetch both DONE and FAILED so the client knows the final state right away
  // and does not register listeners for IDs that will never emit.
  const resolved = await prisma.recipe.findMany({
    where: {
      id: { in: recipeIds },
      imageStatus: { in: [ImageStatus.DONE, ImageStatus.FAILED] },
    },
    select: { id: true, imageUrl: true, imageStatus: true },
  });

  const resolvedIds = new Set<string>();
  for (const r of resolved) {
    const isDone = r.imageStatus === ImageStatus.DONE;
    send(r.id, { imageUrl: isDone ? r.imageUrl : null, status: isDone ? 'DONE' : 'FAILED' });
    resolvedIds.add(r.id);
  }

  // ── 2. Register listeners for still-pending recipes ───────────────────────
  const pendingIds = recipeIds.filter((id) => !resolvedIds.has(id));
  const listeners = new Map<string, (payload: RecipeImageEvent) => void>();

  for (const recipeId of pendingIds) {
    const listener = (payload: RecipeImageEvent) => {
      send(recipeId, payload);
      recipeImageEventEmitter.off(recipeId, listener);
      listeners.delete(recipeId);
    };
    listeners.set(recipeId, listener);
    recipeImageEventEmitter.on(recipeId, listener);
  }

  // ── Keep-alive ping (prevents proxy/LB timeout on idle connections) ───────
  const ping = setInterval(() => {
    if (closed || res.writableEnded) {
      clearInterval(ping);
      return;
    }
    res.write(': ping\n\n');
  }, 15_000);

  // ── Cleanup on client disconnect ──────────────────────────────────────────
  req.on('close', () => {
    closed = true;
    clearInterval(ping);
    for (const [recipeId, listener] of listeners) {
      recipeImageEventEmitter.off(recipeId, listener);
    }
    listeners.clear();
  });
});

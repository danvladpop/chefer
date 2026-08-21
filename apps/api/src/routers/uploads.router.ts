import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { Router, type Request, type Response } from 'express';
import { prisma } from '@chefer/database';
import { asyncHandler } from '../lib/async-handler.js';

// ─── Image uploads ────────────────────────────────────────────────────────────
// Session-authenticated raw-body upload (no multipart, no extra deps): the
// client PUTs/POSTs the file bytes with its image/* content-type. Files land
// in apps/api/uploads/ and are served statically at /uploads/* (see index.ts).

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Inlined session lookup (same pattern as the SSE router — avoids circular imports)
function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('chefer_session='));
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

export const uploadsRouter: Router = Router();

uploadsRouter.post(
  '/image',
  express.raw({ type: 'image/*', limit: MAX_BYTES }),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await resolveUserId(req.headers.cookie);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const mime = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
    const ext = EXT_BY_MIME[mime];
    if (!ext) {
      res.status(415).json({ error: `Unsupported image type: ${mime || 'unknown'}` });
      return;
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Empty upload body' });
      return;
    }

    const filename = `${randomUUID()}.${ext}`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(path.join(UPLOADS_DIR, filename), body);

    // Absolute URL built from the (proxy-aware) request origin. With
    // `trust proxy` + Caddy forwarding Host/X-Forwarded-Proto this yields the
    // public https URL in prod and the direct localhost URL in dev.
    const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
    res.status(201).json({ url });
  }),
);

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { sniffImageMime } from '../lib/image-sniff.js';
import { consume } from '../lib/rate-limit.js';
import { resolveRequestAuth } from '../lib/session-auth.js';

// ─── Image uploads ────────────────────────────────────────────────────────────
// Session-authenticated raw-body upload (no multipart, no extra deps): the
// client PUTs/POSTs the file bytes with its image/* content-type. Files land
// in apps/api/uploads/ and are served statically at /uploads/* (see index.ts).

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// Per-user daily cap: without one, disk could be filled at 5 MB a request
// (audit F-X-4-7). Generous for real use (recipe photos, avatars).
const MAX_UPLOADS_PER_DAY = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

export const uploadsRouter: Router = Router();

uploadsRouter.post(
  '/image',
  express.raw({ type: 'image/*', limit: MAX_BYTES }),
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = await resolveRequestAuth(req);
    const userId = user?.id ?? null;
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

    // The bytes must really be the declared image type.
    if (sniffImageMime(body) !== mime) {
      res.status(415).json({ error: 'The file is not a valid image of that type' });
      return;
    }

    if (!consume(`uploads.image:${userId}`, MAX_UPLOADS_PER_DAY, DAY_MS)) {
      res.status(429).json({ error: 'Daily upload limit reached — try again tomorrow' });
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

import { TRPCError } from '@trpc/server';
import express, { Router, type Request, type Response } from 'express';
import { scanService } from '../application/tracker/scan.service.js';
import { asyncHandler } from '../lib/async-handler.js';
import { resolveRequestAuth } from '../lib/session-auth.js';

// ─── Meal photo scan endpoint (F4 Snap-to-Log) ────────────────────────────────
// Session-authenticated raw-body image POST (same transport as the uploads
// router — the client sends the file bytes with its image/* content-type, no
// multipart parser needed). Lives on the API so the vision call reaches the
// quota/metering layer without apps/web touching Prisma; Caddy routes
// /api/scan-meal here in production, a Next rewrite proxies it in dev.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

export const scanRouter: Router = Router();

scanRouter.post(
  '/',
  express.raw({ type: 'image/*', limit: MAX_BYTES }),
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = await resolveRequestAuth(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const mime = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
    if (!SUPPORTED_MIME.has(mime)) {
      res.status(415).json({ error: `Unsupported image type: ${mime || 'unknown'}` });
      return;
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Empty upload body' });
      return;
    }

    try {
      const estimate = await scanService.analyzeMealPhoto(user, body.toString('base64'), mime);
      res.json({ estimate });
    } catch (err) {
      if (err instanceof TRPCError && err.code === 'FORBIDDEN') {
        // Machine-readable premium gate — the web client swaps the scan UI
        // for the shared upgrade surface (source: snap-scan, PW-3 funnel).
        res.status(403).json({ error: err.message, upgradeRequired: true });
        return;
      }
      if (err instanceof TRPCError && err.code === 'TOO_MANY_REQUESTS') {
        res.status(429).json({ error: err.message });
        return;
      }
      if (err instanceof TRPCError && err.code === 'SERVICE_UNAVAILABLE') {
        // Upstream AI capacity failure, already mapped to a friendly message
        // by the scan service (§4.5.2) — raw error is in the server log.
        res.status(503).json({ error: err.message });
        return;
      }
      console.error('Meal scan failed:', err);
      res
        .status(500)
        .json({ error: "The chef couldn't read that photo. Try again with a clearer shot." });
    }
  }),
);

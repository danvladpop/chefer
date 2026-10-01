import { TRPCError } from '@trpc/server';
import express, { Router, type Request, type Response } from 'express';
import { scanService } from '../application/tracker/scan.service.js';
import { rejectWithoutAiConsent } from '../lib/ai-consent-gate.js';
import { runWithAiCallContext } from '../lib/ai/call-context.js';
import { asyncHandler } from '../lib/async-handler.js';
import { isPremiumUser } from '../lib/entitlements.js';
import { resolveRequestAuth } from '../lib/session-auth.js';

// ─── Meal photo scan endpoint (F4 Snap-to-Log) ────────────────────────────────
// Session-authenticated raw-body image POST (same transport as the uploads
// router — the client sends the file bytes with its image/* content-type, no
// multipart parser needed). Lives on the API so the vision call reaches the
// quota/metering layer without apps/web touching Prisma; Caddy routes
// /api/scan-meal here in production, a Next rewrite proxies it in dev.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — unchanged by T-BUG-O1 (uploads went to 10 MB, scan stays 5 MB)

const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

// Same sentence the mobile/web clients fall back to for a 413 (UX-40 photo
// states) — sent as a plain string so an installed binary that still does
// `new Error(data.error)` shows real copy instead of "[object Object]".
const PHOTO_TOO_BIG_MESSAGE = 'That photo is too big. Choose another, or use a screenshot of it.';

function isPayloadTooLargeError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    ('type' in err ? (err as { type?: unknown }).type === 'entity.too.large' : false)
  );
}

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

    // R-10 (App Store 5.1.2(i)): the photo goes to the AI provider — refuse
    // it without AI-data consent on record (403 + `reason`, no upgradeRequired).
    if (await rejectWithoutAiConsent(res, { userId: user.id })) return;

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
      // AI call context: lets shadow mode see a premium user's own request.
      const estimate = await runWithAiCallContext(
        { userId: user.id, premium: isPremiumUser(user) },
        () => scanService.analyzeMealPhoto(user, body.toString('base64'), mime),
      );
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

// T-BUG-O1 (O-18): same fix as uploads.router.ts — an oversize body's
// PayloadTooLargeError bypasses asyncHandler entirely and previously fell
// through to the global 500 handler's `{ error: { code, message } }` shape.
scanRouter.use((err: unknown, _req: Request, res: Response, next: (err?: unknown) => void) => {
  if (isPayloadTooLargeError(err)) {
    res.status(413).json({ error: PHOTO_TOO_BIG_MESSAGE });
    return;
  }
  next(err);
});

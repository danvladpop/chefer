import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { UPLOAD_LIMITS } from '@chefer/types';
import { UploadRejectedError, uploadService } from '../application/uploads/upload.service.js';
import { asyncHandler } from '../lib/async-handler.js';
import { UPLOADS_DIR } from '../lib/image-cdn/local.js';
import { authOnce } from '../lib/route-rate-limit.js';

// ─── Image uploads ────────────────────────────────────────────────────────────
// Session-authenticated raw-body upload (no multipart, no extra deps): the
// client POSTs the file bytes with its image/* content-type. The photo is
// resized and re-encoded server-side (application/uploads/upload.service.ts),
// recorded in the uploaded_files ledger (daily cap + storage quota, DB-backed)
// and written into apps/api/uploads/, served statically at /uploads/*.
//
// Phase 1 guardrails: the session is checked BEFORE express.raw buffers the
// body — an anonymous request is answered 401 without the server reading (or
// holding in memory) a single byte of it — and the body limit is 5 MB
// (UPLOAD_LIMITS.maxBytes; the clients resize to 1600 px first, so a real
// photo arrives at a few hundred KB). Keep the clients' own pre-send checks in
// sync: apps/mobile/src/lib/media-client.ts and apps/web/src/lib/upload-image.ts
// both read the same shared constant.

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

// The directory lives in lib/image-cdn/local.ts (generated recipe images share
// it); re-exported for index.ts's static route.
export { UPLOADS_DIR };

/**
 * 401 before the body is read. `Connection: close` tells the client not to
 * keep streaming a body nobody will read; Node drops the rest of it with the
 * socket once the response is out.
 */
const requireSession = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { user } = await authOnce(req, res);
  if (!user) {
    res.setHeader('Connection', 'close');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

export const uploadsRouter: Router = Router();

uploadsRouter.post(
  '/image',
  requireSession,
  express.raw({ type: 'image/*', limit: UPLOAD_LIMITS.maxBytes }),
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = await authOnce(req, res);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const mime = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    try {
      const { fileName } = await uploadService.storeImage(user, mime, body);
      // Absolute URL built from the (proxy-aware) request origin. With
      // `trust proxy` + Caddy forwarding Host/X-Forwarded-Proto this yields the
      // public https URL in prod and the direct localhost URL in dev.
      const url = `${req.protocol}://${req.get('host')}/uploads/${fileName}`;
      res.status(201).json({ url });
    } catch (err) {
      if (err instanceof UploadRejectedError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

// T-BUG-O1 (O-18): express.raw's PayloadTooLargeError is thrown before the
// handler above runs, so it never hits asyncHandler and previously fell
// through to the global 500 handler's `{ error: { code, message } }` shape —
// the mobile client stringified that into the literal text "[object
// Object]". Router-level error middleware answers it as a plain-string 413
// instead; every other error still falls through to the global handler.
uploadsRouter.use((err: unknown, _req: Request, res: Response, next: (err?: unknown) => void) => {
  if (isPayloadTooLargeError(err)) {
    res.status(413).json({ error: PHOTO_TOO_BIG_MESSAGE });
    return;
  }
  next(err);
});

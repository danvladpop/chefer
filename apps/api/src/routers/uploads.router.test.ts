import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uploadsRouter } from './uploads.router.js';

// T-BUG-O1 (O-18): an oversize body throws express.raw's PayloadTooLargeError
// before the handler (and therefore before asyncHandler) ever runs. With no
// router-level error middleware it used to fall through to the global 500
// handler's `{ error: { code, message } }` shape (apps/api/src/index.ts
// L204-211), which the mobile client stringified into the literal text
// "[object Object]". This exercises the real Express body-size limit end to
// end (no DB needed — the raw-body limit rejects before resolveRequestAuth
// runs), mounting only uploadsRouter plus a global handler that mirrors
// index.ts's shape, to prove the 413 never reaches it.

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use('/api/uploads', uploadsRouter);
  // Mirrors apps/api/src/index.ts's global handler shape — proves the 413
  // is answered by the router's own middleware, not this fallback.
  app.use(
    (_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res
        .status(500)
        .json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'nope' } });
    },
  );
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('T-BUG-O1 uploadsRouter — oversize body (413)', () => {
  it('answers a body over the 10 MB limit with 413 and a plain string error', async () => {
    const body = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await fetch(`${baseUrl}/api/uploads/image`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body,
    });

    expect(res.status).toBe(413);
    const data = (await res.json()) as { error?: unknown };
    expect(typeof data.error).toBe('string');
    expect(data.error).toBe('That photo is too big. Choose another, or use a screenshot of it.');
  });

  it('does not fall through to the global 500 handler for the oversize case', async () => {
    const body = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await fetch(`${baseUrl}/api/uploads/image`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body,
    });

    expect(res.status).not.toBe(500);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data['success']).toBeUndefined();
    expect(data['code']).toBeUndefined();
  });

  it('a body at the 10 MB limit reaches the handler (401 without a session, not 413)', async () => {
    const res = await fetch(`${baseUrl}/api/uploads/image`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array(10 * 1024 * 1024),
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as { error?: unknown };
    expect(typeof data.error).toBe('string');
  });
});

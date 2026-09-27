import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// T-BUG-O1 (O-18): same fix as uploads.router.ts — an oversize body's
// PayloadTooLargeError bypasses asyncHandler entirely and used to fall
// through to the global 500 handler's `{ error: { code, message } }` shape.
// scan.router.ts transitively imports the AI service factory (lib/ai/index),
// which validates the full env schema at import time — stub the minimum it
// needs (AI defaults to MockAIService, no real provider/DB call happens on
// this oversize path) before importing it dynamically.

type ScanRouterModule = typeof import('./scan.router.js');
let scanRouter: ScanRouterModule['scanRouter'];
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://nobody:x@127.0.0.1:1/none');
  vi.stubEnv('JWT_SECRET', 'j'.repeat(32));
  vi.stubEnv('REFRESH_TOKEN_SECRET', 'r'.repeat(32));
  ({ scanRouter } = await import('./scan.router.js'));
  vi.unstubAllEnvs();

  const app = express();
  app.use('/api/scan-meal', scanRouter);
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

describe('T-BUG-O1 scanRouter — oversize body (413)', () => {
  it('answers a body over the 5 MB scan limit with 413 and a plain string error', async () => {
    const body = new Uint8Array(5 * 1024 * 1024 + 1);
    const res = await fetch(`${baseUrl}/api/scan-meal`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body,
    });

    expect(res.status).toBe(413);
    const data = (await res.json()) as { error?: unknown };
    expect(typeof data.error).toBe('string');
    expect(data.error).toBe('That photo is too big. Choose another, or use a screenshot of it.');
  });

  it('does not fall through to the global 500 handler for the oversize case', async () => {
    const body = new Uint8Array(5 * 1024 * 1024 + 1);
    const res = await fetch(`${baseUrl}/api/scan-meal`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body,
    });

    expect(res.status).not.toBe(500);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data['success']).toBeUndefined();
  });

  it('a body at the 5 MB limit reaches the handler (401 without a session, not 413)', async () => {
    const res = await fetch(`${baseUrl}/api/scan-meal`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: new Uint8Array(5 * 1024 * 1024),
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as { error?: unknown };
    expect(typeof data.error).toBe('string');
  });
});

import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// T-BUG-O1 (O-18): an oversize body throws express.raw's PayloadTooLargeError
// before the handler (and therefore before asyncHandler) ever runs. With no
// router-level error middleware it used to fall through to the global 500
// handler's `{ error: { code, message } }` shape (apps/api/src/index.ts), which
// the mobile client stringified into the literal text "[object Object]".
// Phase 1 guardrails: the session is checked BEFORE the body is read, and the
// limit is 5 MB. These exercise the real Express stack end to end (no DB: the
// session lookup and the storing service are mocked), mounting only
// uploadsRouter plus a global handler that mirrors index.ts's shape.

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/session-auth.js', () => ({
  resolveRequestAuth: vi.fn(async (req: express.Request) =>
    req.headers.authorization === 'Bearer good'
      ? { user: { id: 'u1', planTier: 'FREE', role: 'USER' }, sessionToken: 'good' }
      : { user: null, sessionToken: null },
  ),
}));

vi.mock('../application/uploads/upload.service.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../application/uploads/upload.service.js')>();
  return { ...mod, uploadService: { storeImage: vi.fn() } };
});

const { uploadsRouter } = await import('./uploads.router.js');
const { uploadService, UploadRejectedError } =
  await import('../application/uploads/upload.service.js');

const LIMIT = 5 * 1024 * 1024;
const AUTH = { authorization: 'Bearer good' };

let server: Server;
let baseUrl: string;
let port: number;

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
  port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.mocked(uploadService.storeImage)
    .mockReset()
    .mockResolvedValue({ fileName: 'f.jpg', bytes: 10 });
});

function upload(body: Uint8Array, headers: Record<string, string> = AUTH) {
  return fetch(`${baseUrl}/api/uploads/image`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', ...headers },
    body,
  });
}

describe('uploadsRouter — authentication before the body (Phase 1 guardrails)', () => {
  it('answers 401 while the body is still being sent — the server never waits for it', async () => {
    // Headers plus one chunk, then nothing: a server that read the body before
    // checking the session would hang here until the test timed out.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/uploads/image',
        headers: { 'content-type': 'image/png', 'content-length': String(LIMIT) },
      });
      req.on('response', (res) => {
        resolve(res.statusCode ?? 0);
        req.destroy();
      });
      req.on('error', reject);
      req.write(Buffer.alloc(64 * 1024));
    });
    expect(status).toBe(401);
    expect(uploadService.storeImage).not.toHaveBeenCalled();
  });

  it('answers a signed-out upload 401 with a plain string error, even when it is oversize', async () => {
    const res = await upload(new Uint8Array(LIMIT + 1), {});
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error?: unknown };
    expect(typeof data.error).toBe('string');
  });
});

describe('T-BUG-O1 uploadsRouter — oversize body (413)', () => {
  it('answers a body over the 5 MB limit with 413 and a plain string error', async () => {
    const res = await upload(new Uint8Array(LIMIT + 1));

    expect(res.status).toBe(413);
    const data = (await res.json()) as { error?: unknown };
    expect(typeof data.error).toBe('string');
    expect(data.error).toBe('That photo is too big. Choose another, or use a screenshot of it.');
    expect(uploadService.storeImage).not.toHaveBeenCalled();
  });

  it('does not fall through to the global 500 handler for the oversize case', async () => {
    const res = await upload(new Uint8Array(LIMIT + 1));

    expect(res.status).not.toBe(500);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data['success']).toBeUndefined();
    expect(data['code']).toBeUndefined();
  });

  it('a body at the 5 MB limit reaches the service and answers the stored URL', async () => {
    const res = await upload(new Uint8Array(LIMIT));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ url: `${baseUrl}/uploads/f.jpg` });
    const [user, mime, body] = vi.mocked(uploadService.storeImage).mock.calls[0] ?? [];
    expect(user).toMatchObject({ id: 'u1' });
    expect(mime).toBe('image/png');
    expect(body?.length).toBe(LIMIT);
  });
});

describe('uploadsRouter — refusals from the service', () => {
  it('answers a full storage quota as 403 { error: string }', async () => {
    vi.mocked(uploadService.storeImage).mockRejectedValue(
      new UploadRejectedError(403, "You've used your 200 MB of photo storage."),
    );
    const res = await upload(new Uint8Array(100));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You've used your 200 MB of photo storage." });
  });

  it('answers the daily cap as 429', async () => {
    vi.mocked(uploadService.storeImage).mockRejectedValue(
      new UploadRejectedError(429, 'Daily upload limit reached — try again tomorrow'),
    );
    const res = await upload(new Uint8Array(100));
    expect(res.status).toBe(429);
  });
});

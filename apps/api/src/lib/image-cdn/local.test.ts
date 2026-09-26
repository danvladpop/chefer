import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalImageStore, resolveMediaBaseUrl, UPLOADS_DIR } from './local.js';

// A 1×1 PNG (smallest valid file) and a JPEG signature stub.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG_STUB = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString('base64');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'chefer-media-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createLocalImageStore', () => {
  it('writes the bytes under recipes/ and returns the public /uploads URL', async () => {
    const store = createLocalImageStore({ dir, publicBaseUrl: 'https://chefer.example' });
    const url = await store(PNG_1X1, 'image/png', 'rec_123');

    expect(url).toMatch(/^https:\/\/chefer\.example\/uploads\/recipes\/rec_123-[0-9a-f]{12}\.png$/);
    const files = await readdir(path.join(dir, 'recipes'));
    expect(files).toHaveLength(1);
    const written = await readFile(path.join(dir, 'recipes', files[0]!));
    expect(written.equals(Buffer.from(PNG_1X1, 'base64'))).toBe(true);
  });

  it('names by sniffed type, not the provider label', async () => {
    const store = createLocalImageStore({ dir, publicBaseUrl: 'http://localhost:3001' });
    // Cloudflare labels JSON-mode images image/jpeg — here the bytes are PNG.
    await expect(store(PNG_1X1, 'image/jpeg', 'r1')).resolves.toMatch(/\.png$/);
    await expect(store(JPEG_STUB, 'image/png', 'r2')).resolves.toMatch(/\.jpg$/);
  });

  it('gives different content a different URL (the route is served immutable)', async () => {
    const store = createLocalImageStore({ dir, publicBaseUrl: 'http://x' });
    const a = await store(PNG_1X1, 'image/png', 'same');
    const b = await store(JPEG_STUB, 'image/jpeg', 'same');
    expect(a).not.toBe(b);
    // Same bytes → same name (idempotent).
    await expect(store(PNG_1X1, 'image/png', 'same')).resolves.toBe(a);
  });

  it('never lets the key escape the folder', async () => {
    const store = createLocalImageStore({ dir, publicBaseUrl: 'http://x' });
    const url = await store(PNG_1X1, 'image/png', '../../etc/passwd');
    expect(url).not.toContain('..');
    expect(await readdir(path.join(dir, 'recipes'))).toHaveLength(1);
  });

  it('rejects bytes that are not an image', async () => {
    const store = createLocalImageStore({ dir, publicBaseUrl: 'http://x' });
    const html = Buffer.from('<html>nope</html>').toString('base64');
    await expect(store(html, 'image/png', 'r1')).rejects.toThrow(/not a recognised image/);
  });
});

describe('resolveMediaBaseUrl', () => {
  const base = { nodeEnv: 'production', appUrl: 'https://chefer.duckdns.org', port: 3001 };

  it('uses API_PUBLIC_URL when set (trailing slash trimmed)', () => {
    expect(resolveMediaBaseUrl({ ...base, apiPublicUrl: 'https://api.example/' })).toBe(
      'https://api.example',
    );
  });

  it('falls back to APP_URL in production (single-origin deploy)', () => {
    expect(resolveMediaBaseUrl(base)).toBe('https://chefer.duckdns.org');
  });

  it('uses the API port on localhost in development', () => {
    expect(resolveMediaBaseUrl({ ...base, nodeEnv: 'development' })).toBe('http://localhost:3001');
  });
});

describe('UPLOADS_DIR', () => {
  it('is the same folder the uploads volume mounts (/app/uploads when cwd is /app)', () => {
    expect(UPLOADS_DIR).toBe(path.resolve(process.cwd(), 'uploads'));
  });
});

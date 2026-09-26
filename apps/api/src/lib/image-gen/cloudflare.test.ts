import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareImageService } from './cloudflare.js';
import { ImagenRateLimitError } from './errors.js';

// Fixture responses only — no live calls (§8 AI-cost rule).

const INPUT = { recipeId: 'r1', recipeName: 'Shakshuka', cuisineType: 'Middle Eastern' };

function service(upload = vi.fn().mockResolvedValue('https://cdn/r1.jpg')) {
  return {
    upload,
    svc: new CloudflareImageService({
      accountId: 'acc',
      apiToken: 'tok',
      model: '@cf/black-forest-labs/flux-1-schnell',
      upload,
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CloudflareImageService', () => {
  it('posts the recipe prompt and uploads the returned base64 image', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: { image: 'aGVsbG8=' } }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { svc, upload } = service();

    await expect(svc.generate(INPUT)).resolves.toBe('https://cdn/r1.jpg');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/black-forest-labs/flux-1-schnell',
    );
    expect(JSON.parse(init.body as string).prompt).toContain('Shakshuka');
    expect(upload).toHaveBeenCalledWith('aGVsbG8=', 'image/jpeg', 'r1');
  });

  it('accepts raw image bytes from models that return them', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
        ),
    );
    const { svc, upload } = service();
    await svc.generate(INPUT);
    expect(upload).toHaveBeenCalledWith('AQID', 'image/png', 'r1');
  });

  it('maps 429 to the worker back-off error (no retry burned)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('slow down', { status: 429 })));
    await expect(service().svc.generate(INPUT)).rejects.toBeInstanceOf(ImagenRateLimitError);
  });

  it('fails loudly on other errors and on a missing image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    await expect(service().svc.generate(INPUT)).rejects.toThrow(/500/);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, result: {} }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(service().svc.generate(INPUT)).rejects.toThrow(/no image/);
  });
});

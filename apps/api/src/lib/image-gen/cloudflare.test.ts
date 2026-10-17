import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudflareNeuronLedger } from '../ai/cloudflare-budget.js';
import { CloudflareImageService, imageNeuronEstimate, isDailyQuotaError } from './cloudflare.js';
import { ImagenRateLimitError, ImageQuotaExhaustedError, ImageStorageError } from './errors.js';

// Fixture responses only — no live calls (§8 AI-cost rule).

const INPUT = { recipeId: 'r1', recipeName: 'Shakshuka', cuisineType: 'Middle Eastern' };

const SCHNELL = '@cf/black-forest-labs/flux-1-schnell';
const KLEIN = '@cf/black-forest-labs/flux-2-klein-4b';

function service(upload = vi.fn().mockResolvedValue('https://cdn/r1.jpg'), model = SCHNELL) {
  return {
    upload,
    svc: new CloudflareImageService({ accountId: 'acc', apiToken: 'tok', model, upload }),
  };
}

const imageJson = () =>
  new Response(JSON.stringify({ success: true, result: { image: 'aGVsbG8=' } }), {
    headers: { 'content-type': 'application/json' },
  });

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

  it('maps the daily-free-allocation 429 to the quota error, not the short back-off', async () => {
    const body =
      '{"success":false,"errors":[{"code":3036,"message":"You have used up your daily free allocation of 10,000 neurons."}]}';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 429 })));
    await expect(service().svc.generate(INPUT)).rejects.toBeInstanceOf(ImageQuotaExhaustedError);
  });

  it('recognises the quota answer by code or wording', () => {
    expect(isDailyQuotaError('{"errors":[{"code":3036,"message":"x"}]}')).toBe(true);
    expect(isDailyQuotaError('AiError: 4006: {"code": 4006}')).toBe(true);
    expect(isDailyQuotaError('you have used up your daily free allocation of 10,000 neurons')).toBe(
      true,
    );
    expect(
      isDailyQuotaError('{"errors":[{"code":3040,"message":"Capacity temporarily exceeded"}]}'),
    ).toBe(false);
    expect(isDailyQuotaError('slow down')).toBe(false);
  });

  it('wraps an upload failure as a storage error (the image was already paid for)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, result: { image: 'aGVsbG8=' } }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const upload = vi.fn().mockRejectedValue(
      Object.assign(new Error("EACCES: permission denied, mkdir '/app/uploads/recipes'"), {
        code: 'EACCES',
      }),
    );
    const err = await service(upload)
      .svc.generate(INPUT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImageStorageError);
    expect((err as Error).message).toMatch(/EACCES/);
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

  it('asks flux-2-klein for a 4:3 1024×768 image as multipart form fields (F3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(imageJson());
    vi.stubGlobal('fetch', fetchMock);
    const { svc, upload } = service(undefined, KLEIN);

    await expect(svc.generate(INPUT)).resolves.toBe('https://cdn/r1.jpg');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-4b$/);
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('prompt')).toContain('Shakshuka');
    expect(form.get('width')).toBe('1024');
    expect(form.get('height')).toBe('768');
    // fetch sets the multipart boundary itself; a hand-set content-type would drop it.
    expect(new Headers(init.headers).get('content-type')).toBeNull();
    expect(upload).toHaveBeenCalledWith('aGVsbG8=', 'image/jpeg', 'r1');
  });

  it("counts the model's own neuron estimate when Cloudflare reports none", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(imageJson())),
    );
    expect(imageNeuronEstimate(SCHNELL)).toBeCloseTo(57.6);
    // 1024×768 bills as 4 output tiles at 26.05 (pricing page, 2026-10-17).
    expect(imageNeuronEstimate(KLEIN)).toBeCloseTo(104.2);

    const before = cloudflareNeuronLedger.usedToday();
    await service(undefined, KLEIN).svc.generate(INPUT);
    expect(cloudflareNeuronLedger.usedToday() - before).toBeCloseTo(104.2);
  });
});

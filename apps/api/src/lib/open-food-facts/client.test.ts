import { describe, expect, it, vi } from 'vitest';
import { OffUnavailableError, OpenFoodFactsClient } from './client.js';

vi.mock('../env.js', () => ({
  env: { OFF_BASE_URL: 'https://off.test', OFF_USER_AGENT: 'Chefer-test/1.0' },
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(fetchImpl: ReturnType<typeof vi.fn>, now = () => 1_000_000) {
  return new OpenFoodFactsClient({
    baseUrl: 'https://off.test/',
    userAgent: 'Chefer-test/1.0',
    fetchImpl: fetchImpl as never,
    now,
  });
}

describe('OpenFoodFactsClient.lookup', () => {
  it('asks the v2 product endpoint with a named User-Agent and normalises the hit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, { status: 1, product: { product_name: 'Oat drink', nutriments: { 'energy-kcal_100g': 46 } } }),
    );
    const result = await client(fetchImpl).lookup('7394376616037');
    expect(result).toMatchObject({ found: true, product: { name: 'Oat drink', kcalPer100g: 46 } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toMatch(/^https:\/\/off\.test\/api\/v2\/product\/7394376616037\?fields=/);
    expect(init.headers['User-Agent']).toBe('Chefer-test/1.0');
  });

  it('treats 404 / status 0 as not found, and remembers the miss for a day', async () => {
    let t = 1_000_000;
    const fetchImpl = vi.fn().mockResolvedValue(json(404, { status: 0 }));
    const off = client(fetchImpl, () => t);
    expect(await off.lookup('12345670')).toEqual({ found: false });
    expect(await off.lookup('12345670')).toEqual({ found: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 25 * 60 * 60 * 1000;
    await off.lookup('12345670');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws OffUnavailableError on 429, 5xx and network errors', async () => {
    await expect(client(vi.fn().mockResolvedValue(json(429, {}))).lookup('12345670')).rejects.toBeInstanceOf(
      OffUnavailableError,
    );
    await expect(client(vi.fn().mockResolvedValue(json(503, {}))).lookup('12345670')).rejects.toBeInstanceOf(
      OffUnavailableError,
    );
    await expect(
      client(vi.fn().mockRejectedValue(new TypeError('fetch failed'))).lookup('12345670'),
    ).rejects.toBeInstanceOf(OffUnavailableError);
  });

  it('stays under 60 calls a minute without calling OFF for the 61st', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { status: 1, product: {} }));
    const off = client(fetchImpl);
    for (let i = 0; i < 60; i++) await off.lookup(String(10000000 + i));
    await expect(off.lookup('99999995')).rejects.toBeInstanceOf(OffUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(60);
  });
});

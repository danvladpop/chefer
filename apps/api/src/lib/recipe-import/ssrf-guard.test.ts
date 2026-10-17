import type { LookupAddress } from 'node:dns';
import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeRemoteUrl,
  guardedLookup,
  isForbiddenAddress,
  SSRF_BLOCKED_CODE,
} from './ssrf-guard.js';

// DNS is mocked so no test ever performs a live lookup.
const { lookupMock, lookupCallbackMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  lookupCallbackMock: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));
vi.mock('node:dns', () => ({ lookup: lookupCallbackMock }));

describe('isForbiddenAddress', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.1.1', // CGNAT
    '127.0.0.1',
    '127.8.9.10',
    '169.254.169.254', // cloud metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.192',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1', // multicast
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1', // ULA
    'fd12:3456::1',
    'fe80::1', // link-local
    'fe80::1%eth0', // zone index stripped
    'ff02::1', // multicast
    '::ffff:127.0.0.1', // v4-mapped loopback
    '::ffff:10.0.0.5', // v4-mapped private
    '::ffff:7f00:1', // v4-mapped loopback, hex form
    '::ffff:a00:5', // v4-mapped private, hex form
    '::ffff:a9fe:a9fe', // v4-mapped metadata, hex form
    '0:0:0:0:0:ffff:7f00:1', // v4-mapped, uncompressed
    '::ffff:0:a9fe:a9fe', // v4-translated metadata
    '::7f00:1', // v4-compatible loopback
    '::127.0.0.1', // v4-compatible loopback, dotted
    '64:ff9b::a9fe:a9fe', // NAT64 to metadata
    '64:ff9b::5db8:d822', // NAT64 — blocked even to a public v4
    '64:ff9b:1::1', // local-use NAT64
    '2002:7f00:1::', // 6to4 of 127.0.0.1
    '2002:5db8:d822::1', // 6to4 — blocked as a range
    '2001:0:4136:e378:8000:63bf:3fff:fdd2', // Teredo
    '2001:db8::1', // documentation
    '100::1', // discard
    'fec0::1', // deprecated site-local
    'not-an-ip', // unparseable → fail closed
  ])('blocks %s', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(true);
  });

  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '172.15.0.1', // just below the private /12
    '172.32.0.1', // just above the private /12
    '11.0.0.1',
    '2606:2800:220:1:248:1893:25c8:1946',
    '::ffff:93.184.216.34', // v4-mapped public
    '::ffff:5db8:d822', // v4-mapped public, hex form
    '2a00:1450:4001:80b::200e',
  ])('allows public %s', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(false);
  });
});

describe('assertSafeRemoteUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    for (const url of ['ftp://example.com/x', 'file:///etc/passwd', 'gopher://example.com']) {
      await expect(assertSafeRemoteUrl(url)).rejects.toThrow(/http/i);
    }
  });

  it('rejects non-standard ports', async () => {
    await expect(assertSafeRemoteUrl('http://example.com:8080/recipe')).rejects.toThrow(/port/i);
    await expect(assertSafeRemoteUrl('https://example.com:6379/')).rejects.toThrow(/port/i);
  });

  it('rejects embedded credentials', async () => {
    await expect(assertSafeRemoteUrl('https://user:pass@example.com/')).rejects.toThrow(
      /credential/i,
    );
  });

  it('rejects localhost and literal private IPs without a DNS call', async () => {
    lookupMock.mockClear();
    await expect(assertSafeRemoteUrl('http://localhost/x')).rejects.toThrow();
    await expect(assertSafeRemoteUrl('http://127.0.0.1/x')).rejects.toThrow();
    await expect(assertSafeRemoteUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    await expect(assertSafeRemoteUrl('http://[::1]/x')).rejects.toThrow();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/latest/meta-data',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a00:5]/',
    'http://[::ffff:a9fe:a9fe]/',
    'http://[0:0:0:0:0:ffff:10.0.0.5]/',
    'http://[::127.0.0.1]/',
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://[2002:a9fe:a9fe::]/',
    'http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/',
  ])('rejects the IPv6 literal %s (any embedded-IPv4 form)', async (url) => {
    lookupMock.mockClear();
    await expect(assertSafeRemoteUrl(url)).rejects.toThrow(/cannot be imported/i);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('accepts a public IPv4-mapped literal', async () => {
    const url = await assertSafeRemoteUrl('http://[::ffff:93.184.216.34]/recipe');
    expect(url.hostname).toBe('[::ffff:5db8:d822]');
  });

  it('rejects a hostname that resolves to a private address', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '10.1.2.3', family: 4 }]);
    await expect(assertSafeRemoteUrl('https://internal.example.com/recipe')).rejects.toThrow(
      /cannot be imported/i,
    );
  });

  it('rejects when ANY resolved address is private (DNS rebinding mix)', async () => {
    lookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.0.10', family: 4 },
    ]);
    await expect(assertSafeRemoteUrl('https://evil.example.com/recipe')).rejects.toThrow();
  });

  it('accepts a public hostname', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    const url = await assertSafeRemoteUrl('https://example.com/best-pasta');
    expect(url.hostname).toBe('example.com');
  });
});

describe('guardedLookup (connect-time check)', () => {
  type LookupCb = (err: Error | null, address: string | LookupAddress[], family?: number) => void;
  const answer = (addresses: LookupAddress[]): void => {
    lookupCallbackMock.mockImplementationOnce((_host: string, _opts: unknown, cb: LookupCb) =>
      cb(null, addresses),
    );
  };
  const run = (all: boolean) =>
    new Promise<{
      err: NodeJS.ErrnoException | null;
      address: unknown;
      family?: number | undefined;
    }>((resolve) => {
      guardedLookup('rebind.example.com', { all }, (err, address, family) =>
        resolve({ err, address, family }),
      );
    });

  it('passes public addresses through in both callback shapes', async () => {
    answer([{ address: '93.184.216.34', family: 4 }]);
    expect(await run(false)).toEqual({ err: null, address: '93.184.216.34', family: 4 });
    answer([{ address: '93.184.216.34', family: 4 }]);
    const all = await run(true);
    expect(all.err).toBeNull();
    expect(all.address).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('refuses when the socket-time resolution returns a private address', async () => {
    answer([{ address: '127.0.0.1', family: 4 }]);
    expect((await run(false)).err?.code).toBe(SSRF_BLOCKED_CODE);
    answer([
      { address: '93.184.216.34', family: 4 },
      { address: '::ffff:a9fe:a9fe', family: 6 },
    ]);
    expect((await run(true)).err?.code).toBe(SSRF_BLOCKED_CODE);
  });
});

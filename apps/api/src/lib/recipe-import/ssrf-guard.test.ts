import { describe, expect, it, vi } from 'vitest';
import { assertSafeRemoteUrl, isForbiddenAddress } from './ssrf-guard.js';

// DNS is mocked so no test ever performs a live lookup.
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

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

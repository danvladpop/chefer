import { buildAuthHeaders, isExpectedFailure } from '../../src/lib/trpc-links';

describe('buildAuthHeaders', () => {
  it('always identifies as the mobile client', () => {
    const headers = buildAuthHeaders(() => null);
    expect(headers['x-chefer-client']).toBe('mobile');
    expect(headers.authorization).toBeUndefined();
  });

  it('adds the Bearer header when a token is present', () => {
    const headers = buildAuthHeaders(() => 'tok-123');
    expect(headers.authorization).toBe('Bearer tok-123');
    expect(headers['x-chefer-client']).toBe('mobile');
  });
});

describe('isExpectedFailure (dogfood #7 — no LogBox toast for offline)', () => {
  it('treats network and auth failures as expected', () => {
    expect(
      isExpectedFailure([
        '<< query',
        { result: new Error('fetch failed: Could not connect to the server.') },
      ]),
    ).toBe(true);
    expect(isExpectedFailure([new Error('Network request failed')])).toBe(true);
    expect(isExpectedFailure([{ result: new Error('UNAUTHORIZED') }])).toBe(true);
  });
  it('keeps real server errors loud', () => {
    expect(isExpectedFailure([{ result: new Error('INTERNAL_SERVER_ERROR: boom') }])).toBe(false);
    expect(isExpectedFailure(['<< mutation', { result: 'nope' }])).toBe(false);
  });
});

import { buildAuthHeaders } from '../../src/lib/trpc-links';

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

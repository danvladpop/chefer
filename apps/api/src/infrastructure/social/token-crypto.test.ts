import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './token-crypto.js';

describe('token crypto', () => {
  it('round-trips and never stores the plaintext', () => {
    const stored = encryptToken('r.refresh-token-123', 'a-secret-of-sufficient-length-0123');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('refresh-token');
    expect(decryptToken(stored, 'a-secret-of-sufficient-length-0123')).toBe('r.refresh-token-123');
  });

  it('uses a fresh IV each time', () => {
    const a = encryptToken('same', 'secret-secret-secret-secret-1234');
    const b = encryptToken('same', 'secret-secret-secret-secret-1234');
    expect(a).not.toBe(b);
  });

  it('returns null for a wrong secret, tampering or garbage (never throws)', () => {
    const stored = encryptToken('tok', 'secret-secret-secret-secret-1234');
    expect(decryptToken(stored, 'another-secret-another-secret-12')).toBeNull();
    const parts = stored.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(decryptToken(parts.join('.'), 'secret-secret-secret-secret-1234')).toBeNull();
    expect(decryptToken('garbage', 'secret-secret-secret-secret-1234')).toBeNull();
    expect(decryptToken('', 'secret-secret-secret-secret-1234')).toBeNull();
  });
});

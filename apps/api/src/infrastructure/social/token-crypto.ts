import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// ─── Encrypting stored provider tokens (WP-22) ───────────────────────────────
// The Apple refresh token is kept only so the grant can be revoked when the
// account is deleted. AES-256-GCM, key = SHA-256 of a domain-separated secret.
// Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).

const keyFor = (secret: string): Buffer =>
  createHash('sha256').update(`chefer:social-token:v1:${secret}`).digest();

export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), body]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Returns null when the value is malformed or the secret changed (never throws). */
export function decryptToken(stored: string, secret: string): string | null {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

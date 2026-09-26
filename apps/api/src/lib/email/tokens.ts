import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

// ─── Signed email-link tokens (audit P2-5) ────────────────────────────────────
// Stateless HMAC-SHA256 tokens for links that must work WITHOUT a session:
//
// - unsubscribe: flips one weekly-email flag (or both). No expiry — a link in
//   a months-old email must still work. Replaying it only re-applies the
//   user's own choice, so there is nothing to protect with single use.
// - verify: confirms the address. Bound to the address it was sent to and
//   valid for 7 days.
//
// Format: base64url(JSON payload) + "." + base64url(HMAC). The key is
// EMAIL_TOKEN_SECRET, or one derived from JWT_SECRET when that is unset.

export type UnsubscribeScope = 'WEEK_READY' | 'WEEKLY_RECAP' | 'ALL';

const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TokenPayload =
  | { v: 1; p: 'unsub'; u: string; s: UnsubscribeScope }
  | { v: 1; p: 'verify'; u: string; e: string; x: number };

const SCOPES: readonly UnsubscribeScope[] = ['WEEK_READY', 'WEEKLY_RECAP', 'ALL'];

function tokenKey(): string {
  if (env.EMAIL_TOKEN_SECRET) return env.EMAIL_TOKEN_SECRET;
  // Domain-separated from session/JWT use of the same secret.
  return createHmac('sha256', env.JWT_SECRET).update('chefer:email-tokens:v1').digest('hex');
}

function mac(body: string, key: string): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

export function signEmailToken(payload: TokenPayload, key: string = tokenKey()): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, key)}`;
}

function isPayload(value: unknown): value is TokenPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v['v'] !== 1 || typeof v['u'] !== 'string' || v['u'].length === 0) return false;
  if (v['p'] === 'unsub') return SCOPES.includes(v['s'] as UnsubscribeScope);
  if (v['p'] === 'verify') return typeof v['e'] === 'string' && typeof v['x'] === 'number';
  return false;
}

/** The payload when the signature checks out, else null (never throws). */
export function readEmailToken(token: string, key: string = tokenKey()): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  const expected = Buffer.from(mac(body, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return isPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createUnsubscribeToken(
  userId: string,
  scope: UnsubscribeScope,
  key?: string,
): string {
  return signEmailToken({ v: 1, p: 'unsub', u: userId, s: scope }, key);
}

export function readUnsubscribeToken(
  token: string,
  key?: string,
): { userId: string; scope: UnsubscribeScope } | null {
  const payload = readEmailToken(token, key);
  return payload?.p === 'unsub' ? { userId: payload.u, scope: payload.s } : null;
}

export function createVerifyEmailToken(
  userId: string,
  email: string,
  now: Date = new Date(),
  key?: string,
): string {
  return signEmailToken(
    { v: 1, p: 'verify', u: userId, e: email, x: now.getTime() + VERIFY_TTL_MS },
    key,
  );
}

export function readVerifyEmailToken(
  token: string,
  now: Date = new Date(),
  key?: string,
): { userId: string; email: string } | null {
  const payload = readEmailToken(token, key);
  if (payload?.p !== 'verify' || payload.x < now.getTime()) return null;
  return { userId: payload.u, email: payload.e };
}

/** Web URLs the emails link to (APP_URL is the web app). */
export function unsubscribeUrl(userId: string, scope: UnsubscribeScope): string {
  return `${env.APP_URL}/unsubscribe?token=${createUnsubscribeToken(userId, scope)}`;
}

export function verifyEmailUrl(userId: string, email: string, now?: Date): string {
  return `${env.APP_URL}/verify-email?token=${createVerifyEmailToken(userId, email, now)}`;
}

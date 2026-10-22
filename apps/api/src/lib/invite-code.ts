import { randomBytes } from 'node:crypto';
import { COACHING_LIMITS } from '@chefer/types';

// ─── Invite codes (coaching invites, household invites) ──────────────────────
// The code is the only secret: Crockford base32 from crypto random (10 chars =
// 50 bits; the rate limits on preview/join make guessing hopeless). No env
// import, so any service can use it without loading the validated env.

/** Crockford base32: no I, L, O, U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `length` characters of Crockford base32 from crypto random (32 symbols: a byte's low 5 bits, no modulo bias). */
export function generateInviteCode(
  length: number = COACHING_LIMITS.inviteCodeLength,
  bytes: (n: number) => Uint8Array = randomBytes,
): string {
  const random = bytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) code += ALPHABET.charAt((random[i] ?? 0) & 31);
  return code;
}

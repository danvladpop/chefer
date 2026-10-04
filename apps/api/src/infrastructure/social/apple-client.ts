import { importPKCS8, SignJWT } from 'jose';
import type { AppleCredentials } from './social-config.js';

// ─── Sign in with Apple REST client (WP-22) ──────────────────────────────────
// Exchanges the one-time authorization code for a refresh token and revokes it
// again when the account is deleted or the identity unlinked (App Store
// 5.1.1(v)). Both calls authenticate with a short-lived ES256 client-secret JWT
// signed with the team's Sign in with Apple key.

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class AppleClient {
  constructor(
    private readonly credentials: () => AppleCredentials | null,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  /** The ES256 client secret for `clientId` (the bundle id or Services ID the token belongs to). */
  async clientSecret(clientId: string): Promise<string> {
    const creds = this.credentials();
    if (!creds) throw new Error('Apple credentials are not configured');
    const key = await importPKCS8(creds.privateKey, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: creds.keyId })
      .setIssuer(creds.teamId)
      .setSubject(clientId)
      .setAudience(APPLE_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(key);
  }

  /** code -> refresh token. Null when Apple rejects the code (already used, expired, wrong client). */
  async exchangeCode(input: {
    code: string;
    clientId: string;
    redirectUri?: string | null;
  }): Promise<string | null> {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: await this.clientSecret(input.clientId),
      code: input.code,
      grant_type: 'authorization_code',
      ...(input.redirectUri ? { redirect_uri: input.redirectUri } : {}),
    });
    const res = await this.fetchImpl(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const token =
      typeof json === 'object' && json !== null && 'refresh_token' in json
        ? json.refresh_token
        : null;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }

  /** Revokes a refresh token. Returns whether Apple accepted it. */
  async revoke(input: { refreshToken: string; clientId: string }): Promise<boolean> {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: await this.clientSecret(input.clientId),
      token: input.refreshToken,
      token_type_hint: 'refresh_token',
    });
    const res = await this.fetchImpl(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return res.ok;
  }
}

import { createHash } from 'node:crypto';
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { SocialCredential, SocialProvider } from '@chefer/types';

// ─── ID-token verification (WP-22) ───────────────────────────────────────────
// Verifies a Google/Apple OIDC ID token the way their docs prescribe: RS256
// signature against the provider's JWKS, `iss`, `aud` (one of OUR client ids),
// `exp`, and the nonce. The key source is injectable so tests can sign tokens
// with a locally generated key — the checks themselves are never bypassed.

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

const ISSUERS: Record<SocialProvider, string[]> = {
  GOOGLE: ['https://accounts.google.com', 'accounts.google.com'],
  APPLE: ['https://appleid.apple.com'],
};

/** A token that fails verification, for any reason (the API answers UNAUTHORIZED). */
export class SocialTokenError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid' | 'expired' | 'audience' | 'nonce' | 'issuer',
  ) {
    super(message);
    this.name = 'SocialTokenError';
  }
}

export type VerifiedIdentity = {
  provider: SocialProvider;
  /** The provider's stable user id (`sub`). */
  subject: string;
  /** Lower-cased; null when the token carries none (Apple after the first sign-in can omit it). */
  email: string | null;
  emailVerified: boolean;
  /** The configured client id the token was issued to (`aud`). */
  audience: string;
  givenName: string | null;
  familyName: string | null;
};

export type VerifyOptions = {
  /** Reject tokens issued longer ago than this (re-authentication needs a fresh sign-in). */
  maxTokenAgeSeconds?: number;
};

export type KeyResolvers = Record<SocialProvider, JWTVerifyGetKey>;

export function remoteKeyResolvers(): KeyResolvers {
  return {
    GOOGLE: createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), { cooldownDuration: 30_000 }),
    APPLE: createRemoteJWKSet(new URL(APPLE_JWKS_URL), { cooldownDuration: 30_000 }),
  };
}

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Claims such as `email_verified` arrive as a boolean (Google) or the string "true" (Apple). */
function claimTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

function stringClaim(payload: JWTPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The token's nonce must be the raw nonce or its SHA-256 hex; Apple always needs one. */
function checkNonce(provider: SocialProvider, claim: string | null, raw: string | undefined): void {
  if (claim === null) {
    if (provider === 'APPLE' || raw !== undefined) {
      throw new SocialTokenError('Token carries no nonce', 'nonce');
    }
    return;
  }
  if (raw === undefined) throw new SocialTokenError('Nonce was not supplied', 'nonce');
  const ok = claim === raw || claim.toLowerCase() === sha256Hex(raw);
  if (!ok) throw new SocialTokenError('Nonce mismatch', 'nonce');
}

export class SocialTokenVerifier {
  constructor(
    private readonly keys: KeyResolvers,
    /** Accepted audiences per provider (our configured client ids). */
    private readonly audiences: () => Record<SocialProvider, string[]>,
  ) {}

  async verify(
    credential: SocialCredential,
    options: VerifyOptions = {},
  ): Promise<VerifiedIdentity> {
    const { provider, idToken, nonce } = credential;
    const audience = this.audiences()[provider];
    if (audience.length === 0) throw new SocialTokenError('Provider not configured', 'audience');

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.keys[provider], {
        algorithms: ['RS256'],
        issuer: ISSUERS[provider],
        audience,
        clockTolerance: 30,
        requiredClaims: ['sub', 'exp', 'iat'],
        ...(options.maxTokenAgeSeconds !== undefined && {
          maxTokenAge: options.maxTokenAgeSeconds,
        }),
      }));
    } catch (err) {
      if (err instanceof errors.JWTExpired) throw new SocialTokenError('Token expired', 'expired');
      if (err instanceof errors.JWTClaimValidationFailed) {
        const reason =
          err.claim === 'aud' ? 'audience' : err.claim === 'iss' ? 'issuer' : 'invalid';
        throw new SocialTokenError(`Token claim rejected: ${err.claim}`, reason);
      }
      throw new SocialTokenError('Token could not be verified', 'invalid');
    }

    checkNonce(provider, stringClaim(payload, 'nonce'), nonce);

    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const matchedAudience = aud.find(
      (a): a is string => typeof a === 'string' && audience.includes(a),
    );
    const subject = payload.sub;
    if (!matchedAudience || !subject) throw new SocialTokenError('Token invalid', 'invalid');

    const email = stringClaim(payload, 'email');
    return {
      provider,
      subject,
      email: email ? email.toLowerCase().trim() : null,
      emailVerified: email !== null && claimTrue(payload['email_verified']),
      audience: matchedAudience,
      givenName: stringClaim(payload, 'given_name'),
      familyName: stringClaim(payload, 'family_name'),
    };
  }
}

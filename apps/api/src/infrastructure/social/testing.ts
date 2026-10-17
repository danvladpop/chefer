import { exportPKCS8, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import type { SocialProvider } from '@chefer/types';
import type { KeyResolvers } from './token-verifier.js';

// Test helpers: sign provider-shaped ID tokens with a locally generated key and
// serve the matching public key as the "JWKS". Used by tests only — production
// code always resolves keys from the providers' real JWKS endpoints.

export type TestKeys = {
  resolvers: KeyResolvers;
  sign: (
    provider: SocialProvider,
    claims: Record<string, unknown>,
    opts?: SignOptions,
  ) => Promise<string>;
  /** A token signed by a DIFFERENT key (signature must be rejected). */
  signWithForeignKey: (
    provider: SocialProvider,
    claims: Record<string, unknown>,
  ) => Promise<string>;
};

export type SignOptions = {
  /** Seconds relative to now. */
  iat?: number;
  exp?: number;
  alg?: string;
};

const ISSUER: Record<SocialProvider, string> = {
  GOOGLE: 'https://accounts.google.com',
  APPLE: 'https://appleid.apple.com',
};

export async function createTestKeys(): Promise<TestKeys> {
  const pair = await generateKeyPair('RS256', { extractable: true });
  const foreign = await generateKeyPair('RS256');
  const getKey: JWTVerifyGetKey = async () => pair.publicKey;
  const make =
    (privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']) =>
    async (provider: SocialProvider, claims: Record<string, unknown>, opts: SignOptions = {}) => {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(ISSUER[provider])
        .setIssuedAt(now + (opts.iat ?? 0))
        .setExpirationTime(now + (opts.exp ?? 3600))
        .sign(privateKey);
    };
  const sign = make(pair.privateKey);
  const signForeign = make(foreign.privateKey);
  return {
    resolvers: { GOOGLE: getKey, APPLE: getKey },
    sign,
    signWithForeignKey: (provider, claims) => signForeign(provider, claims),
  };
}

/** A fresh ES256 PKCS#8 PEM, like Apple's .p8 file. */
export async function createApplePrivateKeyPem(): Promise<string> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return exportPKCS8(privateKey);
}

/** The form fields of a request the Apple client sent through a mocked fetch. */
export function formBody(init: RequestInit | undefined): URLSearchParams {
  return init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
}

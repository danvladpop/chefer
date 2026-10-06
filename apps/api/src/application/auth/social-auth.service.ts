import { TRPCError } from '@trpc/server';
import type { Response } from 'express';
import {
  authIdentityRepository,
  type AuthIdentity,
  type IAuthIdentityRepository,
  type User,
} from '@chefer/database';
import {
  CURRENT_TERMS_VERSION,
  SOCIAL_AUTH_MESSAGES,
  type AuthResult,
  type LinkedIdentities,
  type LinkIdentityInput,
  type SocialAvailability,
  type SocialCredential,
  type SocialProvider,
  type SocialSignInFlags,
  type SocialSignInInput,
  type UnlinkIdentityInput,
} from '@chefer/types';
import { defaultsForRegion } from '@chefer/utils';
import { AppleClient } from '../../infrastructure/social/apple-client.js';
import {
  availabilityFromConfig,
  isProviderEnabled,
  socialConfigFromEnv,
  type SocialConfig,
} from '../../infrastructure/social/social-config.js';
import { decryptToken, encryptToken } from '../../infrastructure/social/token-crypto.js';
import {
  remoteKeyResolvers,
  SocialTokenError,
  SocialTokenVerifier,
  type VerifiedIdentity,
} from '../../infrastructure/social/token-verifier.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { authService, type AuthService } from './auth.service.js';

// ─── Sign in with Google / Apple (WP-22) ─────────────────────────────────────
// Verifies a provider ID token, then: known identity → sign in; same VERIFIED
// email → link + sign in; otherwise create a password-less account (the caller
// must have agreed to the Terms/Privacy and the age line). Sessions are issued
// by AuthService so web (cookie) and mobile (token in body) behave exactly as
// for `auth.login`.

export type SocialAuthOptions = {
  includeSession: boolean;
  consentSource: 'web' | 'mobile';
};

/** A re-authentication token must have been issued this recently (seconds). */
const REAUTH_MAX_TOKEN_AGE_SECONDS = 10 * 60;

export type SocialAuthDeps = {
  repo: IAuthIdentityRepository;
  verifier: SocialTokenVerifier;
  apple: AppleClient;
  config: () => SocialConfig;
  auth: Pick<AuthService, 'createSession' | 'recordRegistrationConsent' | 'authResult'>;
};

const unavailable = () =>
  new TRPCError({ code: 'PRECONDITION_FAILED', message: SOCIAL_AUTH_MESSAGES.unavailable });

export class SocialAuthService {
  constructor(private readonly deps: SocialAuthDeps) {}

  availability(): SocialAvailability {
    return availabilityFromConfig(this.deps.config());
  }

  async signIn(
    input: SocialSignInInput,
    res: Response,
    options: SocialAuthOptions,
  ): Promise<AuthResult & SocialSignInFlags> {
    const verified = await this.verify(input);
    const { repo, auth } = this.deps;

    let user: User;
    let identity: AuthIdentity;
    let isNewUser = false;
    let linkedExistingAccount = false;

    const known = await repo.findByProviderSubject(verified.provider, verified.subject);
    if (known) {
      user = known.user;
      identity = await repo.update(known.id, {
        lastSignInAt: new Date(),
        ...(verified.email && { email: verified.email, emailVerified: verified.emailVerified }),
      });
    } else {
      const existing = verified.email ? await repo.findUserByEmail(verified.email) : null;
      if (existing) {
        // Linking by email is only safe when the PROVIDER vouches for the address.
        if (!verified.emailVerified) {
          throw new TRPCError({ code: 'CONFLICT', message: SOCIAL_AUTH_MESSAGES.emailUnverified });
        }
        if (await repo.findByUserProvider(existing.id, verified.provider)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: SOCIAL_AUTH_MESSAGES.providerAlreadyLinked,
          });
        }
        const data = identityData(verified);
        identity = existing.emailVerified
          ? await repo.createIdentity(existing.id, data)
          : await repo.createIdentityAndSecureUnverifiedUser(existing.id, data);
        user = existing.emailVerified
          ? existing
          : { ...existing, passwordHash: null, emailVerified: new Date() };
        linkedExistingAccount = true;
      } else {
        if (input.acceptLegal !== true) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: SOCIAL_AUTH_MESSAGES.legalRequired });
        }
        if (!verified.email) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: SOCIAL_AUTH_MESSAGES.emailMissing });
        }
        if (!verified.emailVerified) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: SOCIAL_AUTH_MESSAGES.emailNotVerified,
          });
        }
        const termsVersion = input.acceptedTermsVersion ?? CURRENT_TERMS_VERSION;
        ({ user, identity } = await repo.createUserWithIdentity(
          this.newUserData(verified, input, termsVersion),
          identityData(verified),
        ));
        isNewUser = true;
        // Same consent log as `auth.register` — best effort, never fails the sign-up.
        await auth
          .recordRegistrationConsent(user.id, {
            acceptedTerms: true,
            ageConfirmed: true,
            acceptedTermsVersion: termsVersion,
            source: options.consentSource,
          })
          .catch((err: unknown) => {
            logger.error({ err }, 'Failed to record social sign-up consent');
          });
      }
    }

    await this.storeAppleGrant(identity, verified, input.authorizationCode);

    const session = await auth.createSession(user.id, res);
    return {
      ...auth.authResult(user, session, options.includeSession),
      isNewUser,
      linkedExistingAccount,
    };
  }

  async listIdentities(userId: string): Promise<LinkedIdentities> {
    const [user, identities] = await Promise.all([
      this.deps.repo.findUserById(userId),
      this.deps.repo.listByUser(userId),
    ]);
    return {
      hasPassword: Boolean(user?.passwordHash),
      identities: identities.map((i) => ({
        id: i.id,
        provider: asProvider(i.provider),
        email: i.email,
        linkedAt: i.createdAt,
      })),
    };
  }

  async link(userId: string, input: LinkIdentityInput): Promise<LinkedIdentities> {
    const verified = await this.verify(input, { invalidCode: 'BAD_REQUEST' });
    const { repo } = this.deps;
    const known = await repo.findByProviderSubject(verified.provider, verified.subject);
    if (known) {
      if (known.userId !== userId) {
        throw new TRPCError({ code: 'CONFLICT', message: SOCIAL_AUTH_MESSAGES.identityTaken });
      }
      await this.storeAppleGrant(known, verified, input.authorizationCode);
      return this.listIdentities(userId);
    }
    if (await repo.findByUserProvider(userId, verified.provider)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: SOCIAL_AUTH_MESSAGES.providerAlreadyLinked,
      });
    }
    const identity = await repo.createIdentity(userId, identityData(verified));
    await this.storeAppleGrant(identity, verified, input.authorizationCode);
    return this.listIdentities(userId);
  }

  async unlink(userId: string, input: UnlinkIdentityInput): Promise<LinkedIdentities> {
    const { repo } = this.deps;
    const [user, identities] = await Promise.all([
      repo.findUserById(userId),
      repo.listByUser(userId),
    ]);
    const target = identities.find((i) => i.provider === input.provider);
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: SOCIAL_AUTH_MESSAGES.notLinked });
    }
    if (!user?.passwordHash && identities.length <= 1) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: SOCIAL_AUTH_MESSAGES.lastSignInMethod });
    }
    await repo.delete(target.id);
    await this.revokeAppleGrants([target]);
    return this.listIdentities(userId);
  }

  /**
   * Account deletion without a password: a FRESH (≤10 min old) token for an
   * identity that is linked to `userId`. Throws FORBIDDEN otherwise.
   */
  async assertReauthenticated(userId: string, credential: SocialCredential): Promise<void> {
    const forbidden = () =>
      new TRPCError({ code: 'FORBIDDEN', message: SOCIAL_AUTH_MESSAGES.deleteNeedsReauth });
    let verified: VerifiedIdentity;
    try {
      verified = await this.verify(credential, {
        maxTokenAgeSeconds: REAUTH_MAX_TOKEN_AGE_SECONDS,
      });
    } catch (err) {
      if (err instanceof TRPCError && err.code === 'UNAUTHORIZED') throw forbidden();
      throw err;
    }
    const known = await this.deps.repo.findByProviderSubject(verified.provider, verified.subject);
    if (known?.userId !== userId) throw forbidden();
  }

  /**
   * Revokes the stored Apple refresh tokens (App Store 5.1.1(v)). Best effort:
   * never throws — a failure is logged and the deletion/unlink still proceeds.
   * Call it with the identity rows read BEFORE they are deleted.
   */
  async revokeAppleGrants(identities: AuthIdentity[]): Promise<void> {
    for (const identity of identities) {
      if (identity.provider !== 'APPLE' || !identity.refreshTokenEnc || !identity.tokenClientId) {
        continue;
      }
      try {
        const token = decryptToken(identity.refreshTokenEnc, this.deps.config().tokenSecret);
        if (!token) {
          logger.warn({ identityId: identity.id }, 'Apple refresh token could not be decrypted');
          continue;
        }
        const ok = await this.deps.apple.revoke({
          refreshToken: token,
          clientId: identity.tokenClientId,
        });
        if (!ok) logger.warn({ identityId: identity.id }, 'Apple token revocation was rejected');
      } catch (err) {
        logger.warn({ err, identityId: identity.id }, 'Apple token revocation failed');
      }
    }
  }

  /** The user's identity rows, for deletion to read before the cascade. */
  identitiesForDeletion(userId: string): Promise<AuthIdentity[]> {
    return this.deps.repo.listByUser(userId);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async verify(
    credential: SocialCredential,
    options?: { maxTokenAgeSeconds?: number; invalidCode?: 'UNAUTHORIZED' | 'BAD_REQUEST' },
  ): Promise<VerifiedIdentity> {
    if (!isProviderEnabled(this.deps.config(), credential.provider)) throw unavailable();
    try {
      return await this.deps.verifier.verify(
        credential,
        options?.maxTokenAgeSeconds === undefined
          ? {}
          : { maxTokenAgeSeconds: options.maxTokenAgeSeconds },
      );
    } catch (err) {
      if (err instanceof SocialTokenError) {
        logger.info({ provider: credential.provider, reason: err.reason }, 'social token rejected');
        // A signed-in caller (link) must never get UNAUTHORIZED for a bad PROVIDER
        // token: clients treat 401 as "your Chefer session ended" and sign out.
        throw new TRPCError({
          code: options?.invalidCode ?? 'UNAUTHORIZED',
          message: SOCIAL_AUTH_MESSAGES.invalidToken,
        });
      }
      throw err;
    }
  }

  private newUserData(verified: VerifiedIdentity, input: SocialSignInInput, termsVersion: string) {
    const firstName = input.givenName ?? verified.givenName ?? null;
    const lastName = input.familyName ?? verified.familyName ?? null;
    const display = input.region ? defaultsForRegion(input.region) : null;
    return {
      email: verified.email ?? '',
      passwordHash: null,
      emailVerified: new Date(),
      firstName,
      lastName,
      name: [firstName, lastName].filter(Boolean).join(' ') || null,
      // Same as `auth.register`: weekly emails start off for every new account.
      weeklyEmailReady: false,
      weeklyEmailRecap: false,
      termsAcceptedVersion: termsVersion,
      ...(display && {
        chefProfile: {
          create: { preferredUnits: display.preferredUnits, deliveryCurrency: display.currency },
        },
      }),
    };
  }

  /**
   * Apple only: swaps the one-time authorization code for a refresh token and
   * stores it encrypted, so deletion can revoke the grant. Best effort — a bad
   * or missing code never blocks sign-in (the grant simply can't be revoked).
   */
  private async storeAppleGrant(
    identity: AuthIdentity,
    verified: VerifiedIdentity,
    authorizationCode: string | undefined,
  ): Promise<void> {
    if (verified.provider !== 'APPLE' || !authorizationCode) return;
    const config = this.deps.config();
    try {
      const refreshToken = await this.deps.apple.exchangeCode({
        code: authorizationCode,
        clientId: verified.audience,
        // The web flow's code is bound to the redirect URI; native codes have none.
        redirectUri:
          verified.audience === config.apple.servicesId ? config.apple.redirectUri : null,
      });
      if (!refreshToken) {
        logger.warn({ identityId: identity.id }, 'Apple rejected the authorization code');
        return;
      }
      await this.deps.repo.update(identity.id, {
        refreshTokenEnc: encryptToken(refreshToken, config.tokenSecret),
        tokenClientId: verified.audience,
      });
    } catch (err) {
      logger.warn({ err, identityId: identity.id }, 'Apple code exchange failed');
    }
  }
}

function identityData(verified: VerifiedIdentity) {
  return {
    provider: verified.provider,
    subject: verified.subject,
    email: verified.email,
    emailVerified: verified.emailVerified,
  };
}

function asProvider(value: string): SocialProvider {
  return value === 'APPLE' ? 'APPLE' : 'GOOGLE';
}

const config = () => socialConfigFromEnv(env);

export const socialAuthService = new SocialAuthService({
  repo: authIdentityRepository,
  verifier: new SocialTokenVerifier(remoteKeyResolvers(), () => ({
    GOOGLE: config().google.audiences,
    APPLE: config().apple.audiences,
  })),
  apple: new AppleClient(() => config().apple.credentials),
  config,
  auth: authService,
});

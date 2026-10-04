import { TRPCError } from '@trpc/server';
import type { Response } from 'express';
import type {
  AuthResult,
  LinkedIdentities,
  LinkIdentityInput,
  SocialAvailability,
  SocialCredential,
  SocialSignInFlags,
  SocialSignInInput,
  UnlinkIdentityInput,
} from '@chefer/types';

// Contract stub (WP-22 step 1) — the real implementation lands in the next commit.

export type SocialAuthOptions = {
  includeSession: boolean;
  consentSource: 'web' | 'mobile';
};

const notImplemented = (): never => {
  throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Not implemented yet' });
};

export class SocialAuthService {
  availability(): SocialAvailability {
    return {
      google: { enabled: false, webClientId: null, iosClientId: null, androidClientId: null },
      apple: { enabled: false, servicesId: null, bundleId: null, redirectUri: null },
    };
  }

  async signIn(
    _input: SocialSignInInput,
    _res: Response,
    _options: SocialAuthOptions,
  ): Promise<AuthResult & SocialSignInFlags> {
    return notImplemented();
  }

  /** Throws FORBIDDEN unless `credential` is a fresh, valid token for an identity linked to `userId`. */
  async assertReauthenticated(_userId: string, _credential: SocialCredential): Promise<void> {
    return notImplemented();
  }

  async listIdentities(_userId: string): Promise<LinkedIdentities> {
    return notImplemented();
  }

  async link(_userId: string, _input: LinkIdentityInput): Promise<LinkedIdentities> {
    return notImplemented();
  }

  async unlink(_userId: string, _input: UnlinkIdentityInput): Promise<LinkedIdentities> {
    return notImplemented();
  }
}

export const socialAuthService = new SocialAuthService();

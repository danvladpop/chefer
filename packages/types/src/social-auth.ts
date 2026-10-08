import { z } from 'zod';
import { regionCodeSchema } from './preferences';

// ─── Sign in with Google / Apple (WP-22) ─────────────────────────────────────
// Shared by the API (apps/api/src/routers/auth.router.ts) and both clients.
// The client obtains an OIDC ID token from the provider SDK and posts it to
// `auth.socialSignIn`; the API verifies it against the provider's JWKS. Every
// provider is env-driven and disabled when unconfigured: clients ask
// `auth.socialAvailability` and hide the button when `enabled` is false.

export const SOCIAL_PROVIDERS = ['GOOGLE', 'APPLE'] as const;
export const socialProviderSchema = z.enum(SOCIAL_PROVIDERS);
export type SocialProvider = z.infer<typeof socialProviderSchema>;

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  GOOGLE: 'Google',
  APPLE: 'Apple',
};

/** A provider ID token (JWT) plus the context the API needs to verify it. */
export const socialCredentialSchema = z.object({
  provider: socialProviderSchema,
  /** The provider's signed OIDC ID token (a JWT). */
  idToken: z.string().min(20).max(8192),
  /**
   * The RAW nonce the client generated for this attempt. The API accepts a
   * token whose `nonce` claim is this value or its lowercase-hex SHA-256 — so
   * pass the SHA-256 to Apple/Google and the raw value here (Apple REQUIRES a
   * nonce; for Google it is checked only when the token carries one).
   */
  nonce: z.string().min(8).max(256).optional(),
});
export type SocialCredential = z.infer<typeof socialCredentialSchema>;

export const socialSignInInputSchema = socialCredentialSchema.extend({
  /**
   * Apple only, optional. The one-time `authorizationCode` from the Apple
   * sheet/popup. The API exchanges it for a refresh token (stored encrypted)
   * so the Apple grant can be revoked when the account is deleted (App Store
   * 5.1.1(v)). Without it sign-in still works; revocation is then skipped.
   */
  authorizationCode: z.string().min(1).max(2048).optional(),
  /** Apple sends the user's name ONCE, on the first authorization only, outside the token. */
  givenName: z.string().trim().min(1).max(50).optional(),
  familyName: z.string().trim().min(1).max(50).optional(),
  /**
   * "By continuing you agree to the Terms and Privacy Policy and confirm you
   * are 16 or older." REQUIRED (true) when the sign-in would create a new
   * account; ignored for an existing identity or account.
   */
  acceptLegal: z.boolean().optional(),
  /** The `CURRENT_TERMS_VERSION` the consent line referred to (defaults to the API's current one). */
  acceptedTermsVersion: z.string().min(1).max(40).optional(),
  /** Device region (ISO-3166 alpha-2), as for `auth.register`; only used for a new account. */
  region: regionCodeSchema.optional(),
});
export type SocialSignInInput = z.infer<typeof socialSignInInputSchema>;

/** `auth.linkIdentity` — a signed-in user connects another sign-in method. */
export const linkIdentityInputSchema = socialCredentialSchema.extend({
  authorizationCode: z.string().min(1).max(2048).optional(),
});
export type LinkIdentityInput = z.infer<typeof linkIdentityInputSchema>;

export const unlinkIdentityInputSchema = z.object({ provider: socialProviderSchema });
export type UnlinkIdentityInput = z.infer<typeof unlinkIdentityInputSchema>;

/**
 * `auth.socialAvailability` (public query). A provider is `enabled` only when
 * the server is fully configured for it; the ids are what the client SDK needs.
 * Google: `enabled` = at least one client id is set — the client checks that
 * the id for ITS platform is non-null. Apple: `enabled` also requires the
 * Team ID/Key ID/private key (needed to revoke on account deletion).
 */
export type SocialAvailability = {
  google: {
    enabled: boolean;
    webClientId: string | null;
    iosClientId: string | null;
    androidClientId: string | null;
  };
  apple: {
    enabled: boolean;
    /** Web Services ID (the `clientId` of Apple's JS SDK). */
    servicesId: string | null;
    /** The iOS app's bundle id (the audience of native tokens). */
    bundleId: string | null;
    /** Redirect URI registered for the Services ID (Apple JS SDK `redirectURI`). */
    redirectUri: string | null;
  };
};

/** Session result of `auth.socialSignIn` — identical to `auth.login`'s, plus two flags. */
export type SocialSignInFlags = {
  /** An account was created by this call (the client runs normal onboarding). */
  isNewUser: boolean;
  /** An existing password account with the same verified email was linked to this provider. */
  linkedExistingAccount: boolean;
};

export type LinkedIdentity = {
  id: string;
  provider: SocialProvider;
  /** The email the provider reported (an Apple private-relay address stays as is). */
  email: string | null;
  linkedAt: Date;
};

export type LinkedIdentities = {
  /** Whether the account has a password (false = OAuth-only). */
  hasPassword: boolean;
  identities: LinkedIdentity[];
};

/** Messages the clients can recognise (stable text; tRPC `message`). */
export const SOCIAL_AUTH_MESSAGES = {
  /** BAD_REQUEST — a NEW account needs `acceptLegal: true`. */
  legalRequired:
    'To create your account, please agree to the Terms and Privacy Policy and confirm you are 16 or older.',
  /** UNAUTHORIZED — bad signature/audience/issuer/expiry/nonce. */
  invalidToken: 'We couldn’t verify your sign-in. Please try again.',
  /** PRECONDITION_FAILED — provider not configured on this server. */
  unavailable: 'This sign-in option isn’t available right now.',
  /** BAD_REQUEST — a new account needs an email and the provider gave none. */
  emailMissing:
    'We couldn’t get an email address from your account. Share your email, or sign up with email instead.',
  /** BAD_REQUEST — the provider reports the email as unverified, so no account is created. */
  emailNotVerified:
    'Your email address isn’t verified with this account. Verify it with the provider, or sign up with email instead.',
  /** CONFLICT — same email, but the provider has not verified it. */
  emailUnverified:
    'An account with this email already exists. Sign in with your password, then connect this account from your profile.',
  /** CONFLICT — identity already linked to another Chefer account. */
  identityTaken: 'This account is already connected to a different Chefer account.',
  /** CONFLICT — the user already has a different account of this provider linked. */
  providerAlreadyLinked: 'You already have a different account of this type connected.',
  /** BAD_REQUEST — unlinking the only way to sign in. */
  lastSignInMethod:
    'This is your only way to sign in. Set a password first (use “Forgot password”), then disconnect it.',
  /** NOT_FOUND — nothing linked for that provider. */
  notLinked: 'That sign-in method isn’t connected to your account.',
  /** FORBIDDEN — account deletion needs a password or a fresh provider sign-in. */
  deleteNeedsReauth:
    'Confirm it’s you: enter your password, or sign in with Google/Apple again to delete your account.',
} as const;

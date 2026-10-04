import { createHash } from 'node:crypto';
import type { Response as ExpressResponse } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthIdentity, IAuthIdentityRepository, User } from '@chefer/database';
import { SOCIAL_AUTH_MESSAGES, type SocialSignInInput } from '@chefer/types';
import { AppleClient } from '../../infrastructure/social/apple-client.js';
import {
  socialConfigFromEnv,
  type SocialConfig,
} from '../../infrastructure/social/social-config.js';
import {
  createApplePrivateKeyPem,
  createTestKeys,
  formBody,
  type TestKeys,
} from '../../infrastructure/social/testing.js';
import { decryptToken } from '../../infrastructure/social/token-crypto.js';
import { SocialTokenVerifier } from '../../infrastructure/social/token-verifier.js';
import { AuthService } from './auth.service.js';
import { SocialAuthService } from './social-auth.service.js';

// The module graph reaches lib/env (validated at import) and the logger.
vi.mock('../../lib/env.js', () => ({ env: {} }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../privacy/consent.service.js', () => ({
  consentService: { record: vi.fn().mockResolvedValue({}) },
}));

// ─── In-memory repository ─────────────────────────────────────────────────────

class FakeRepo implements IAuthIdentityRepository {
  users: User[] = [];
  identities: AuthIdentity[] = [];
  sessionsRevokedFor: string[] = [];
  private seq = 0;

  private identity(userId: string, d: Parameters<IAuthIdentityRepository['createIdentity']>[1]) {
    const row: AuthIdentity = {
      id: `i${++this.seq}`,
      userId,
      provider: d.provider,
      subject: d.subject,
      email: d.email,
      emailVerified: d.emailVerified,
      refreshTokenEnc: d.refreshTokenEnc ?? null,
      tokenClientId: d.tokenClientId ?? null,
      createdAt: new Date(),
      lastSignInAt: new Date(),
    };
    this.identities.push(row);
    return row;
  }
  async findByProviderSubject(provider: string, subject: string) {
    const identity = this.identities.find((i) => i.provider === provider && i.subject === subject);
    const user = identity && this.users.find((u) => u.id === identity.userId);
    return identity && user ? { ...identity, user } : null;
  }
  async findByUserProvider(userId: string, provider: string) {
    return this.identities.find((i) => i.userId === userId && i.provider === provider) ?? null;
  }
  async listByUser(userId: string) {
    return this.identities.filter((i) => i.userId === userId);
  }
  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async createUserWithIdentity(
    data: Parameters<IAuthIdentityRepository['createUserWithIdentity']>[0],
    identity: Parameters<IAuthIdentityRepository['createIdentity']>[1],
  ) {
    const user = makeUser({
      id: `u${++this.seq}`,
      email: data.email,
      passwordHash: null,
      emailVerified: data.emailVerified as Date,
      firstName: (data.firstName as string | null) ?? null,
      lastName: (data.lastName as string | null) ?? null,
      name: (data.name as string | null) ?? null,
      termsAcceptedVersion: (data.termsAcceptedVersion as string | null) ?? null,
    });
    this.users.push(user);
    return { user, identity: this.identity(user.id, identity) };
  }
  async createIdentity(
    userId: string,
    data: Parameters<IAuthIdentityRepository['createIdentity']>[1],
  ) {
    return this.identity(userId, data);
  }
  async createIdentityAndSecureUnverifiedUser(
    userId: string,
    data: Parameters<IAuthIdentityRepository['createIdentity']>[1],
  ) {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.passwordHash = null;
      user.emailVerified = new Date();
    }
    this.sessionsRevokedFor.push(userId);
    return this.identity(userId, data);
  }
  async update(id: string, data: Parameters<IAuthIdentityRepository['update']>[1]) {
    const row = this.identities.find((i) => i.id === id);
    if (!row) throw new Error('missing');
    Object.assign(row, data);
    return row;
  }
  async delete(id: string) {
    this.identities = this.identities.filter((i) => i.id !== id);
  }
}

function makeUser(overrides: Partial<User>): User {
  return {
    id: 'u0',
    email: 'x@test.dev',
    emailVerified: null,
    name: null,
    firstName: null,
    lastName: null,
    image: null,
    role: 'USER',
    planTier: 'FREE',
    passwordHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    termsAcceptedVersion: null,
    ...overrides,
  } as User;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GOOGLE_AUD = 'google-web.apps.googleusercontent.com';
const APPLE_BUNDLE = 'com.popdan.chefer';
const APPLE_SERVICES = 'dev.chefer.web';
const sha256Hex = (v: string) => createHash('sha256').update(v).digest('hex');

let keys: TestKeys;
let applePem: string;
let config: SocialConfig;
let repo: FakeRepo;
let fetchImpl: Mock<[string, RequestInit], Promise<Response>>;
let auth: {
  createSession: Mock<[], Promise<{ token: string; expires: Date }>>;
  recordRegistrationConsent: Mock<[], Promise<void>>;
  authResult: AuthService['authResult'];
};
let service: SocialAuthService;
const firstUser = (): User => {
  const user = repo.users[0];
  if (!user) throw new Error('no user created');
  return user;
};

const mockRes = () => ({ setHeader: vi.fn() }) as unknown as ExpressResponse;
const OPTIONS = { includeSession: true, consentSource: 'mobile' as const };

function buildEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    GOOGLE_CLIENT_ID_WEB: GOOGLE_AUD,
    GOOGLE_CLIENT_ID_IOS: undefined,
    GOOGLE_CLIENT_ID_ANDROID: undefined,
    APPLE_SERVICES_ID: APPLE_SERVICES,
    APPLE_BUNDLE_ID: APPLE_BUNDLE,
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: applePem,
    APPLE_WEB_REDIRECT_URI: undefined,
    SOCIAL_TOKEN_SECRET: 's'.repeat(40),
    JWT_SECRET: 'j'.repeat(32),
    APP_URL: 'https://chefer.example',
    ...overrides,
  };
}

function build(envOverrides?: Record<string, string | undefined>) {
  config = socialConfigFromEnv(buildEnv(envOverrides));
  service = new SocialAuthService({
    repo,
    verifier: new SocialTokenVerifier(keys.resolvers, () => ({
      GOOGLE: config.google.audiences,
      APPLE: config.apple.audiences,
    })),
    apple: new AppleClient(
      () => config.apple.credentials,
      (url, init) => fetchImpl(url, init),
    ),
    config: () => config,
    auth,
  });
}

beforeAll(async () => {
  keys = await createTestKeys();
  applePem = await createApplePrivateKeyPem();
});

beforeEach(() => {
  repo = new FakeRepo();
  fetchImpl = vi.fn<[string, RequestInit], Promise<Response>>(
    async () => new Response(JSON.stringify({ refresh_token: 'apple-refresh-1' })),
  );
  auth = {
    createSession: vi.fn<[], Promise<{ token: string; expires: Date }>>(async () => ({
      token: 'sess-token',
      expires: new Date(Date.now() + 1e9),
    })),
    recordRegistrationConsent: vi.fn<[], Promise<void>>(() => Promise.resolve()),
    authResult: new AuthService().authResult.bind(new AuthService()),
  };
  build();
});

async function googleToken(claims: Record<string, unknown> = {}, nonce?: string) {
  return keys.sign('GOOGLE', {
    sub: 'g-sub-1',
    aud: GOOGLE_AUD,
    email: 'alice@gmail.com',
    email_verified: true,
    given_name: 'Alice',
    family_name: 'Doe',
    ...(nonce && { nonce }),
    ...claims,
  });
}

async function appleToken(raw: string, claims: Record<string, unknown> = {}) {
  return keys.sign('APPLE', {
    sub: 'a-sub-1',
    aud: APPLE_BUNDLE,
    email: 'alice@icloud.com',
    email_verified: 'true',
    nonce: sha256Hex(raw),
    ...claims,
  });
}

const googleInput = async (extra: Partial<SocialSignInInput> = {}): Promise<SocialSignInInput> => ({
  provider: 'GOOGLE',
  idToken: await googleToken(),
  acceptLegal: true,
  ...extra,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('availability / disabled provider', () => {
  it('reports the configured providers', () => {
    expect(service.availability()).toMatchObject({
      google: { enabled: true, webClientId: GOOGLE_AUD },
      apple: { enabled: true, servicesId: APPLE_SERVICES, bundleId: APPLE_BUNDLE },
    });
  });

  it('answers PRECONDITION_FAILED for a provider that is not configured (no crash)', async () => {
    build({ GOOGLE_CLIENT_ID_WEB: undefined });
    expect(service.availability().google.enabled).toBe(false);
    await expect(service.signIn(await googleInput(), mockRes(), OPTIONS)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: SOCIAL_AUTH_MESSAGES.unavailable,
    });
    expect(repo.users).toHaveLength(0);
  });

  it('keeps Apple disabled without the key material, so a grant could never be revoked', async () => {
    build({ APPLE_PRIVATE_KEY: undefined });
    expect(service.availability().apple.enabled).toBe(false);
    await expect(
      service.signIn(
        {
          provider: 'APPLE',
          idToken: await appleToken('raw-nonce-123456'),
          nonce: 'raw-nonce-123456',
          acceptLegal: true,
        },
        mockRes(),
        OPTIONS,
      ),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('socialSignIn: invalid tokens', () => {
  it('maps any verification failure to UNAUTHORIZED with the shared message', async () => {
    const idToken = await keys.signWithForeignKey('GOOGLE', { sub: 'x', aud: GOOGLE_AUD });
    await expect(
      service.signIn({ provider: 'GOOGLE', idToken, acceptLegal: true }, mockRes(), OPTIONS),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: SOCIAL_AUTH_MESSAGES.invalidToken });
    expect(auth.createSession).not.toHaveBeenCalled();
  });
});

describe('socialSignIn: new account', () => {
  it('requires acceptLegal for a NEW user and creates nothing without it', async () => {
    await expect(
      service.signIn(await googleInput({ acceptLegal: false }), mockRes(), OPTIONS),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: SOCIAL_AUTH_MESSAGES.legalRequired });
    await expect(
      service.signIn({ provider: 'GOOGLE', idToken: await googleToken() }, mockRes(), OPTIONS),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repo.users).toHaveLength(0);
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it('creates a password-less verified account, records the consents and returns the login shape + flags', async () => {
    const res = mockRes();
    const result = await service.signIn(
      await googleInput({ acceptedTermsVersion: '2026-09-30' }),
      res,
      OPTIONS,
    );

    expect(result).toMatchObject({
      email: 'alice@gmail.com',
      firstName: 'Alice',
      name: 'Alice Doe',
      role: 'USER',
      planTier: 'FREE',
      session: { token: 'sess-token' },
      isNewUser: true,
      linkedExistingAccount: false,
    });
    const user = repo.users[0];
    expect(user).toMatchObject({ passwordHash: null, termsAcceptedVersion: '2026-09-30' });
    expect(user?.emailVerified).toBeInstanceOf(Date);
    expect(repo.identities[0]).toMatchObject({ provider: 'GOOGLE', subject: 'g-sub-1' });
    expect(auth.recordRegistrationConsent).toHaveBeenCalledWith(user?.id, {
      acceptedTerms: true,
      ageConfirmed: true,
      acceptedTermsVersion: '2026-09-30',
      source: 'mobile',
    });
    expect(auth.createSession).toHaveBeenCalledWith(user?.id, res);
  });

  it('omits the session token for web clients (cookie only)', async () => {
    const result = await service.signIn(await googleInput(), mockRes(), {
      includeSession: false,
      consentSource: 'web',
    });
    expect(result).not.toHaveProperty('session');
    expect(auth.recordRegistrationConsent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ source: 'web' }),
    );
  });

  it('does not fail the sign-up when the consent log write fails', async () => {
    auth.recordRegistrationConsent.mockRejectedValue(new Error('db'));
    await expect(service.signIn(await googleInput(), mockRes(), OPTIONS)).resolves.toMatchObject({
      isNewUser: true,
    });
  });

  it('refuses to create an account for an unverified provider email, or no email at all', async () => {
    await expect(
      service.signIn(
        {
          provider: 'GOOGLE',
          idToken: await googleToken({ email_verified: false }),
          acceptLegal: true,
        },
        mockRes(),
        OPTIONS,
      ),
    ).rejects.toMatchObject({ message: SOCIAL_AUTH_MESSAGES.emailNotVerified });
    const raw = 'raw-nonce-123456';
    await expect(
      service.signIn(
        {
          provider: 'APPLE',
          idToken: await keys.sign('APPLE', {
            sub: 'a-9',
            aud: APPLE_BUNDLE,
            nonce: sha256Hex(raw),
          }),
          nonce: raw,
          acceptLegal: true,
        },
        mockRes(),
        OPTIONS,
      ),
    ).rejects.toMatchObject({ message: SOCIAL_AUTH_MESSAGES.emailMissing });
    expect(repo.users).toHaveLength(0);
  });

  it('uses the name Apple sends outside the token and creates a private-relay account', async () => {
    const raw = 'raw-nonce-123456';
    const result = await service.signIn(
      {
        provider: 'APPLE',
        idToken: await appleToken(raw, { email: 'abc123@privaterelay.appleid.com' }),
        nonce: raw,
        givenName: 'Ann',
        familyName: 'Lee',
        acceptLegal: true,
      },
      mockRes(),
      OPTIONS,
    );
    expect(result).toMatchObject({
      email: 'abc123@privaterelay.appleid.com',
      name: 'Ann Lee',
      isNewUser: true,
    });
  });
});

describe('socialSignIn: existing identities and linking', () => {
  it('signs a known identity in without any consent and without creating users', async () => {
    await service.signIn(await googleInput(), mockRes(), OPTIONS);
    auth.recordRegistrationConsent.mockClear();

    const result = await service.signIn(
      { provider: 'GOOGLE', idToken: await googleToken() },
      mockRes(),
      OPTIONS,
    );
    expect(result).toMatchObject({ isNewUser: false, linkedExistingAccount: false });
    expect(repo.users).toHaveLength(1);
    expect(auth.recordRegistrationConsent).not.toHaveBeenCalled();
  });

  it("links an existing account with the same VERIFIED email, keeping a verified account's password", async () => {
    repo.users.push(
      makeUser({
        id: 'u-existing',
        email: 'alice@gmail.com',
        passwordHash: 'hash',
        emailVerified: new Date(),
      }),
    );
    const result = await service.signIn(
      { provider: 'GOOGLE', idToken: await googleToken() },
      mockRes(),
      OPTIONS,
    );
    expect(result).toMatchObject({
      id: 'u-existing',
      isNewUser: false,
      linkedExistingAccount: true,
    });
    expect(repo.users).toHaveLength(1);
    expect(repo.users[0]?.passwordHash).toBe('hash');
    expect(repo.sessionsRevokedFor).toEqual([]);
    expect(repo.identities[0]).toMatchObject({ userId: 'u-existing' });
    // The existing user never has to accept anything again.
    expect(auth.recordRegistrationConsent).not.toHaveBeenCalled();
  });

  it('pre-hijacking guard: linking an account whose email was never verified clears its password and revokes sessions', async () => {
    repo.users.push(
      makeUser({
        id: 'u-squat',
        email: 'alice@gmail.com',
        passwordHash: 'attacker-hash',
        emailVerified: null,
      }),
    );
    await service.signIn({ provider: 'GOOGLE', idToken: await googleToken() }, mockRes(), OPTIONS);
    expect(repo.users[0]?.passwordHash).toBeNull();
    expect(repo.users[0]?.emailVerified).toBeInstanceOf(Date);
    expect(repo.sessionsRevokedFor).toEqual(['u-squat']);
  });

  it('never links by an email the provider has not verified', async () => {
    repo.users.push(makeUser({ id: 'u-existing', email: 'alice@gmail.com', passwordHash: 'h' }));
    await expect(
      service.signIn(
        { provider: 'GOOGLE', idToken: await googleToken({ email_verified: false }) },
        mockRes(),
        OPTIONS,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: SOCIAL_AUTH_MESSAGES.emailUnverified });
    expect(repo.identities).toHaveLength(0);
  });

  it('matches the email case-insensitively', async () => {
    repo.users.push(
      makeUser({ id: 'u-existing', email: 'alice@gmail.com', emailVerified: new Date() }),
    );
    const result = await service.signIn(
      { provider: 'GOOGLE', idToken: await googleToken({ email: 'ALICE@Gmail.com' }) },
      mockRes(),
      OPTIONS,
    );
    expect(result.id).toBe('u-existing');
  });
});

describe('Apple authorization code and revocation', () => {
  const raw = 'raw-nonce-123456';

  it('stores the exchanged refresh token ENCRYPTED with the audience it was issued to', async () => {
    await service.signIn(
      {
        provider: 'APPLE',
        idToken: await appleToken(raw),
        nonce: raw,
        authorizationCode: 'code-1',
        acceptLegal: true,
      },
      mockRes(),
      OPTIONS,
    );
    const identity = repo.identities[0];
    expect(identity?.tokenClientId).toBe(APPLE_BUNDLE);
    expect(identity?.refreshTokenEnc).toBeTruthy();
    expect(identity?.refreshTokenEnc).not.toContain('apple-refresh-1');
    expect(decryptToken(identity?.refreshTokenEnc ?? '', config.tokenSecret)).toBe(
      'apple-refresh-1',
    );
    const body = formBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.get('code')).toBe('code-1');
    expect(body.has('redirect_uri')).toBe(false); // native audience
  });

  it('sends the registered redirect URI for web (Services ID) codes', async () => {
    await service.signIn(
      {
        provider: 'APPLE',
        idToken: await appleToken(raw, { aud: APPLE_SERVICES }),
        nonce: raw,
        authorizationCode: 'code-web',
        acceptLegal: true,
      },
      mockRes(),
      OPTIONS,
    );
    const body = formBody(fetchImpl.mock.calls[0]?.[1]);
    expect(body.get('client_id')).toBe(APPLE_SERVICES);
    expect(body.get('redirect_uri')).toBe('https://chefer.example/login');
    expect(repo.identities[0]?.tokenClientId).toBe(APPLE_SERVICES);
  });

  it('still signs in when the code exchange fails', async () => {
    fetchImpl.mockResolvedValue(new Response('{}', { status: 400 }));
    const result = await service.signIn(
      {
        provider: 'APPLE',
        idToken: await appleToken(raw),
        nonce: raw,
        authorizationCode: 'stale',
        acceptLegal: true,
      },
      mockRes(),
      OPTIONS,
    );
    expect(result.isNewUser).toBe(true);
    expect(repo.identities[0]?.refreshTokenEnc).toBeNull();
  });

  it('revokeAppleGrants posts the decrypted token with the stored client id, and never throws', async () => {
    await service.signIn(
      {
        provider: 'APPLE',
        idToken: await appleToken(raw),
        nonce: raw,
        authorizationCode: 'code-1',
        acceptLegal: true,
      },
      mockRes(),
      OPTIONS,
    );
    fetchImpl.mockClear();
    await service.revokeAppleGrants(repo.identities);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toContain('appleid.apple.com/auth/revoke');
    const body = formBody(init);
    expect(body.get('token')).toBe('apple-refresh-1');
    expect(body.get('client_id')).toBe(APPLE_BUNDLE);

    fetchImpl.mockRejectedValue(new Error('network down'));
    await expect(service.revokeAppleGrants(repo.identities)).resolves.toBeUndefined();
  });

  it('skips Google identities and identities without a stored token', async () => {
    await service.signIn(await googleInput(), mockRes(), OPTIONS);
    await service.revokeAppleGrants(repo.identities);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('linked identities: list / link / unlink', () => {
  async function signedUpWithGoogle() {
    await service.signIn(await googleInput(), mockRes(), OPTIONS);
    return firstUser();
  }

  it('lists identities and whether a password exists', async () => {
    const user = await signedUpWithGoogle();
    expect(await service.listIdentities(user.id)).toMatchObject({
      hasPassword: false,
      identities: [{ provider: 'GOOGLE', email: 'alice@gmail.com' }],
    });
  });

  it('refuses to unlink the last way to sign in when there is no password', async () => {
    const user = await signedUpWithGoogle();
    await expect(service.unlink(user.id, { provider: 'GOOGLE' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: SOCIAL_AUTH_MESSAGES.lastSignInMethod,
    });
    expect(repo.identities).toHaveLength(1);
  });

  it('allows unlinking when a password exists, or when another identity remains', async () => {
    const user = await signedUpWithGoogle();
    user.passwordHash = 'hash';
    await expect(service.unlink(user.id, { provider: 'GOOGLE' })).resolves.toMatchObject({
      hasPassword: true,
      identities: [],
    });

    // OAuth-only with two identities: one may go.
    const second = makeUser({ id: 'u-2', email: 'b@test.dev', passwordHash: null });
    repo.users.push(second);
    await repo.createIdentity('u-2', {
      provider: 'GOOGLE',
      subject: 'g2',
      email: null,
      emailVerified: true,
    });
    await repo.createIdentity('u-2', {
      provider: 'APPLE',
      subject: 'a2',
      email: null,
      emailVerified: true,
    });
    const left = await service.unlink('u-2', { provider: 'APPLE' });
    expect(left.identities.map((i) => i.provider)).toEqual(['GOOGLE']);
  });

  it('revokes the Apple grant when an Apple identity is unlinked', async () => {
    const raw = 'raw-nonce-123456';
    await service.signIn(
      {
        provider: 'APPLE',
        idToken: await appleToken(raw),
        nonce: raw,
        authorizationCode: 'c',
        acceptLegal: true,
      },
      mockRes(),
      OPTIONS,
    );
    const user = firstUser();
    user.passwordHash = 'hash';
    fetchImpl.mockClear();
    await service.unlink(user.id, { provider: 'APPLE' });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/auth/revoke');
  });

  it('NOT_FOUND when unlinking a provider that is not connected', async () => {
    const user = await signedUpWithGoogle();
    user.passwordHash = 'hash';
    await expect(service.unlink(user.id, { provider: 'APPLE' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('links a provider to the signed-in user, and refuses an identity owned by someone else', async () => {
    const user = await signedUpWithGoogle();
    const raw = 'raw-nonce-123456';
    const linked = await service.link(user.id, {
      provider: 'APPLE',
      idToken: await appleToken(raw),
      nonce: raw,
    });
    expect(linked.identities.map((i) => i.provider)).toEqual(['GOOGLE', 'APPLE']);

    repo.users.push(makeUser({ id: 'u-other', email: 'o@test.dev' }));
    await expect(
      service.link('u-other', { provider: 'APPLE', idToken: await appleToken(raw), nonce: raw }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: SOCIAL_AUTH_MESSAGES.identityTaken });
  });

  it('refuses a second, different account of the same provider', async () => {
    const user = await signedUpWithGoogle();
    await expect(
      service.link(user.id, {
        provider: 'GOOGLE',
        idToken: await googleToken({ sub: 'another-google-account' }),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: SOCIAL_AUTH_MESSAGES.providerAlreadyLinked,
    });
  });
});

describe('assertReauthenticated (account deletion without a password)', () => {
  it('accepts a fresh token for an identity linked to the user', async () => {
    await service.signIn(await googleInput(), mockRes(), OPTIONS);
    const user = firstUser();
    await expect(
      service.assertReauthenticated(user.id, { provider: 'GOOGLE', idToken: await googleToken() }),
    ).resolves.toBeUndefined();
  });

  it("rejects a token for someone else's identity, an unknown identity, a stale token and a bad token with FORBIDDEN", async () => {
    await service.signIn(await googleInput(), mockRes(), OPTIONS);
    repo.users.push(makeUser({ id: 'u-other', email: 'o@test.dev' }));

    const forbidden = { code: 'FORBIDDEN', message: SOCIAL_AUTH_MESSAGES.deleteNeedsReauth };
    // Valid token, but it belongs to the first user.
    await expect(
      service.assertReauthenticated('u-other', {
        provider: 'GOOGLE',
        idToken: await googleToken(),
      }),
    ).rejects.toMatchObject(forbidden);
    // Unknown subject.
    await expect(
      service.assertReauthenticated(repo.users[0]?.id ?? '', {
        provider: 'GOOGLE',
        idToken: await googleToken({ sub: 'nobody' }),
      }),
    ).rejects.toMatchObject(forbidden);
    // Issued 30 minutes ago: not a re-authentication.
    const stale = await keys.sign(
      'GOOGLE',
      { sub: 'g-sub-1', aud: GOOGLE_AUD, email: 'alice@gmail.com', email_verified: true },
      { iat: -1800 },
    );
    await expect(
      service.assertReauthenticated(repo.users[0]?.id ?? '', {
        provider: 'GOOGLE',
        idToken: stale,
      }),
    ).rejects.toMatchObject(forbidden);
    // Garbage.
    await expect(
      service.assertReauthenticated(repo.users[0]?.id ?? '', {
        provider: 'GOOGLE',
        idToken: 'garbage-garbage-garbage-1',
      }),
    ).rejects.toMatchObject(forbidden);
  });
});

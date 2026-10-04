import { TRPCError } from '@trpc/server';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_AUTH_MESSAGES, type UserProfile } from '@chefer/types';
import { authRouter } from './auth.router.js';
import { userRouter } from './user.router.js';

// WP-22: the router-level contract lane B (mobile) and the web build rely on.
// Services are mocked; what is pinned here is wiring, inputs and the
// backward-compatible shape of `user.deleteSelf`.

vi.mock('../lib/env.js', () => ({ env: { AUTH_RATE_LIMIT_MAX: 1000 } }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const social = vi.hoisted(() => ({
  availability: vi.fn(),
  signIn: vi.fn(),
  listIdentities: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  assertReauthenticated: vi.fn(),
}));
vi.mock('../application/auth/social-auth.service.js', () => ({ socialAuthService: social }));

const deletion = vi.hoisted(() => ({ deleteAccount: vi.fn(), exportAccountData: vi.fn() }));
vi.mock('../application/user/account-data.service.js', () => deletion);

const authSvc = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../application/auth/auth.service.js', () => ({ authService: authSvc }));
vi.mock('../application/auth/password-reset.service.js', () => ({ passwordResetService: {} }));
vi.mock('../application/notifications/email-preferences.service.js', () => ({
  emailPreferencesService: { sendConfirmationInBackground: vi.fn() },
}));

const users = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
  countAdmins: vi.fn(),
}));
vi.mock('../application/user/user.service.js', () => ({
  UserService: vi.fn(() => users),
}));
vi.mock('../infrastructure/prisma/prisma-user.repository.js', () => ({
  PrismaUserRepository: vi.fn(),
}));

const user: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const ctx = (overrides: Record<string, unknown> = {}) => ({
  user,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: 'tok',
  isMobileClient: true,
  clientApiLevel: 5,
  res: {} as Response,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  users.verifyPassword.mockResolvedValue(true);
  users.countAdmins.mockResolvedValue(2);
});

describe('auth.socialAvailability / socialSignIn', () => {
  it('is public and returns the service availability', async () => {
    const disabled = {
      google: { enabled: false, webClientId: null, iosClientId: null, androidClientId: null },
      apple: { enabled: false, servicesId: null, bundleId: null, redirectUri: null },
    };
    social.availability.mockReturnValue(disabled);
    await expect(
      authRouter.createCaller(ctx({ user: null })).socialAvailability(),
    ).resolves.toEqual(disabled);
  });

  it('passes the client kind through: session body for mobile, cookie-only for web', async () => {
    social.signIn.mockResolvedValue({ id: 'u1' });
    const input = { provider: 'GOOGLE' as const, idToken: 'x'.repeat(30), acceptLegal: true };
    await authRouter.createCaller(ctx({ user: null, isMobileClient: true })).socialSignIn(input);
    await authRouter.createCaller(ctx({ user: null, isMobileClient: false })).socialSignIn(input);
    expect(social.signIn.mock.calls[0]?.[2]).toEqual({
      includeSession: true,
      consentSource: 'mobile',
    });
    expect(social.signIn.mock.calls[1]?.[2]).toEqual({
      includeSession: false,
      consentSource: 'web',
    });
  });

  it('rejects malformed input before reaching the service', async () => {
    await expect(
      authRouter
        .createCaller(ctx({ user: null }))
        .socialSignIn({ provider: 'FACEBOOK' as never, idToken: 'x'.repeat(30) }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      authRouter
        .createCaller(ctx({ user: null }))
        .socialSignIn({ provider: 'GOOGLE', idToken: 'short' }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(social.signIn).not.toHaveBeenCalled();
  });

  it('linked-identity procedures need a signed-in user', async () => {
    const anon = authRouter.createCaller(ctx({ user: null }));
    await expect(anon.linkedIdentities()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anon.unlinkIdentity({ provider: 'GOOGLE' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('user.deleteSelf: password or provider re-authentication', () => {
  const caller = () => userRouter.createCaller(ctx());

  it('old clients: {password, confirm} still works', async () => {
    await expect(caller().deleteSelf({ password: 'pw', confirm: 'DELETE' })).resolves.toEqual({
      success: true,
    });
    expect(deletion.deleteAccount).toHaveBeenCalledWith('u1');
    expect(social.assertReauthenticated).not.toHaveBeenCalled();
  });

  it('a wrong password with no re-auth is FORBIDDEN and deletes nothing', async () => {
    users.verifyPassword.mockResolvedValue(false);
    await expect(
      caller().deleteSelf({ password: 'nope', confirm: 'DELETE' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'That password is not correct',
    });
    expect(deletion.deleteAccount).not.toHaveBeenCalled();
  });

  it('an OAuth-only account deletes with a fresh provider token', async () => {
    social.assertReauthenticated.mockResolvedValue(undefined);
    const reauth = { provider: 'APPLE' as const, idToken: 'x'.repeat(30), nonce: 'n'.repeat(12) };
    await expect(caller().deleteSelf({ reauth, confirm: 'DELETE' })).resolves.toEqual({
      success: true,
    });
    expect(social.assertReauthenticated).toHaveBeenCalledWith('u1', reauth);
    expect(users.verifyPassword).not.toHaveBeenCalled();
    expect(deletion.deleteAccount).toHaveBeenCalledWith('u1');
  });

  it('a rejected re-auth token deletes nothing', async () => {
    social.assertReauthenticated.mockRejectedValue(
      new TRPCError({ code: 'FORBIDDEN', message: SOCIAL_AUTH_MESSAGES.deleteNeedsReauth }),
    );
    await expect(
      caller().deleteSelf({
        reauth: { provider: 'GOOGLE', idToken: 'x'.repeat(30) },
        confirm: 'DELETE',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(deletion.deleteAccount).not.toHaveBeenCalled();
  });

  it('neither a password nor a re-auth is FORBIDDEN with the re-auth hint', async () => {
    await expect(caller().deleteSelf({ confirm: 'DELETE' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: SOCIAL_AUTH_MESSAGES.deleteNeedsReauth,
    });
    expect(deletion.deleteAccount).not.toHaveBeenCalled();
  });

  it('still protects the last admin', async () => {
    users.countAdmins.mockResolvedValue(1);
    await expect(
      userRouter
        .createCaller(ctx({ user: { ...user, role: 'ADMIN' } }))
        .deleteSelf({ password: 'pw', confirm: 'DELETE' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

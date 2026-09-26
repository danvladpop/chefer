import { describe, expect, it, vi } from 'vitest';
import {
  createUnsubscribeToken,
  createVerifyEmailToken,
  readEmailToken,
  readUnsubscribeToken,
  readVerifyEmailToken,
  unsubscribeUrl,
} from './tokens';

vi.mock('../env.js', () => ({
  env: {
    JWT_SECRET: 'j'.repeat(40),
    EMAIL_TOKEN_SECRET: undefined,
    APP_URL: 'https://app.test',
  },
}));

const KEY = 'k'.repeat(40);

describe('unsubscribe tokens', () => {
  it('round-trips user and scope', () => {
    const token = createUnsubscribeToken('user_1', 'WEEK_READY', KEY);
    expect(readUnsubscribeToken(token, KEY)).toEqual({ userId: 'user_1', scope: 'WEEK_READY' });
  });

  it('rejects a tampered payload', () => {
    const token = createUnsubscribeToken('user_1', 'ALL', KEY);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: 1, p: 'unsub', u: 'someone_else', s: 'ALL' }),
    ).toString('base64url');
    expect(readUnsubscribeToken(`${forged}.${signature}`, KEY)).toBeNull();
  });

  it('rejects a token signed with another key', () => {
    const token = createUnsubscribeToken('user_1', 'ALL', 'x'.repeat(40));
    expect(readUnsubscribeToken(token, KEY)).toBeNull();
  });

  it('rejects garbage without throwing', () => {
    expect(readEmailToken('not-a-token', KEY)).toBeNull();
    expect(readEmailToken('a.b.c', KEY)).toBeNull();
    expect(readEmailToken('', KEY)).toBeNull();
  });

  it('a confirmation token is not an unsubscribe token (and vice versa)', () => {
    const verify = createVerifyEmailToken('user_1', 'a@b.c', new Date(), KEY);
    expect(readUnsubscribeToken(verify, KEY)).toBeNull();
    const unsub = createUnsubscribeToken('user_1', 'ALL', KEY);
    expect(readVerifyEmailToken(unsub, new Date(), KEY)).toBeNull();
  });

  it('the env-keyed URL round-trips with the derived key', () => {
    const url = unsubscribeUrl('user_9', 'WEEKLY_RECAP');
    expect(url.startsWith('https://app.test/unsubscribe?token=')).toBe(true);
    const token = new URL(url).searchParams.get('token')!;
    expect(readUnsubscribeToken(token)).toEqual({ userId: 'user_9', scope: 'WEEKLY_RECAP' });
  });
});

describe('email confirmation tokens', () => {
  const issued = new Date('2026-09-21T10:00:00Z');

  it('round-trips user and address within 7 days', () => {
    const token = createVerifyEmailToken('user_1', 'a@b.c', issued, KEY);
    const sixDaysLater = new Date(issued.getTime() + 6 * 24 * 3600 * 1000);
    expect(readVerifyEmailToken(token, sixDaysLater, KEY)).toEqual({
      userId: 'user_1',
      email: 'a@b.c',
    });
  });

  it('expires after 7 days', () => {
    const token = createVerifyEmailToken('user_1', 'a@b.c', issued, KEY);
    const eightDaysLater = new Date(issued.getTime() + 8 * 24 * 3600 * 1000);
    expect(readVerifyEmailToken(token, eightDaysLater, KEY)).toBeNull();
  });
});

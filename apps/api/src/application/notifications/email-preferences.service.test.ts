import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IWeeklyEmailRepository } from '@chefer/database';
import type { EmailMessage } from '../../lib/email/index';
import { createUnsubscribeToken, createVerifyEmailToken } from '../../lib/email/tokens';
import { EmailPreferencesService } from './email-preferences.service';

vi.mock('../../lib/env.js', () => ({
  env: {
    JWT_SECRET: 'j'.repeat(40),
    APP_URL: 'https://app.test',
    EMAIL_MOCK_ENABLED: true,
    EMAIL_PROVIDER: 'mock',
    EMAIL_FROM: 'Chefer <test@chefer.dev>',
    EMAIL_DAILY_CAP: null,
  },
}));

const PREFS = {
  weeklyEmailReady: true,
  weeklyEmailRecap: true,
  emailVerified: null as Date | null,
  email: 'ana@chefer.dev',
};

function makeRepo() {
  return {
    findRecipients: vi.fn(),
    claimSend: vi.fn(),
    releaseSend: vi.fn(),
    countSendsSince: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({ ...PREFS }),
    setPreferences: vi.fn(async (_userId: string, data: object) => ({ ...PREFS, ...data })),
    markEmailVerified: vi.fn().mockResolvedValue(true),
    findWeekLogs: vi.fn(),
    countCompletedWorkouts: vi.fn(),
  } satisfies IWeeklyEmailRepository;
}

const makeSend = () => vi.fn((_message: EmailMessage) => Promise.resolve());

describe('EmailPreferencesService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let send: ReturnType<typeof makeSend>;
  let service: EmailPreferencesService;

  beforeEach(() => {
    repo = makeRepo();
    send = makeSend();
    service = new EmailPreferencesService(repo, { send });
  });

  describe('unsubscribe (token round-trip, no login)', () => {
    it('a Monday link turns off only the Monday email', async () => {
      const token = createUnsubscribeToken('u1', 'WEEK_READY');
      const result = await service.unsubscribe(token);
      expect(repo.setPreferences).toHaveBeenCalledWith('u1', { weeklyEmailReady: false });
      expect(result).toEqual({ scope: 'WEEK_READY', weekReady: false, weeklyRecap: true });
    });

    it('a recap link turns off only the recap; ALL turns off both', async () => {
      await service.unsubscribe(createUnsubscribeToken('u1', 'WEEKLY_RECAP'));
      expect(repo.setPreferences).toHaveBeenLastCalledWith('u1', { weeklyEmailRecap: false });
      await service.unsubscribe(createUnsubscribeToken('u1', 'ALL'));
      expect(repo.setPreferences).toHaveBeenLastCalledWith('u1', {
        weeklyEmailReady: false,
        weeklyEmailRecap: false,
      });
    });

    it('resubscribe undoes it with the same link', async () => {
      await service.unsubscribe(createUnsubscribeToken('u1', 'WEEK_READY'), true);
      expect(repo.setPreferences).toHaveBeenCalledWith('u1', { weeklyEmailReady: true });
    });

    it('never echoes the address to the link holder', async () => {
      const result = await service.unsubscribe(createUnsubscribeToken('u1', 'ALL'));
      expect(JSON.stringify(result)).not.toContain('ana@chefer.dev');
    });

    it('rejects a forged token', async () => {
      await expect(service.unsubscribe('forged.token')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(repo.setPreferences).not.toHaveBeenCalled();
    });

    it('a deleted account reads as an invalid link', async () => {
      repo.setPreferences.mockResolvedValueOnce(null as never);
      await expect(
        service.unsubscribe(createUnsubscribeToken('gone', 'ALL')),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('email confirmation', () => {
    it('sends a link to an unconfirmed address', async () => {
      const result = await service.sendConfirmation('u1', 'Ana');
      expect(result).toEqual({ alreadyConfirmed: false });
      const message = send.mock.calls[0]![0];
      expect(message.to).toBe('ana@chefer.dev');
      expect(message.text).toContain('https://app.test/verify-email?token=');
    });

    it('does nothing for a confirmed address', async () => {
      repo.getPreferences.mockResolvedValueOnce({ ...PREFS, emailVerified: new Date() });
      expect(await service.sendConfirmation('u1', 'Ana')).toEqual({ alreadyConfirmed: true });
      expect(send).not.toHaveBeenCalled();
    });

    it('a valid link confirms the address it was sent to', async () => {
      const token = createVerifyEmailToken('u1', 'ana@chefer.dev');
      expect(await service.confirm(token)).toEqual({ confirmed: true });
      expect(repo.markEmailVerified).toHaveBeenCalledWith('u1', 'ana@chefer.dev');
    });

    it('a link for a different (changed) address is refused', async () => {
      repo.markEmailVerified.mockResolvedValueOnce(false);
      const token = createVerifyEmailToken('u1', 'old@chefer.dev');
      await expect(service.confirm(token)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('an unsubscribe token cannot confirm an address', async () => {
      await expect(service.confirm(createUnsubscribeToken('u1', 'ALL'))).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(repo.markEmailVerified).not.toHaveBeenCalled();
    });
  });

  it('get/set map the switches and the confirmation state', async () => {
    expect(await service.get('u1')).toEqual({
      weekReady: true,
      weeklyRecap: true,
      emailConfirmed: false,
      email: 'ana@chefer.dev',
    });
    const updated = await service.set('u1', { weeklyRecap: false });
    expect(repo.setPreferences).toHaveBeenCalledWith('u1', { weeklyEmailRecap: false });
    expect(updated.weeklyRecap).toBe(false);
  });
});

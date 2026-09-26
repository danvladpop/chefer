import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailTransport, PriorityEmailService, SendLog } from './index';
import { isSmtpQuotaError, SmtpEmailService } from './smtp';
import { EmailQuotaError, type EmailMessage } from './types';

// Never send real mail: nodemailer is replaced wholesale.
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));
vi.mock('../env.js', () => ({
  env: {
    EMAIL_PROVIDER: 'mock',
    EMAIL_FROM: 'Chefer <test@chefer.dev>',
    EMAIL_DAILY_CAP: null,
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: 465,
    SMTP_SECURE: true,
  },
}));

const SMTP = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  user: 'sender.test@gmail.com',
  pass: 'notarealpw00',
};
const FROM = 'Chefer <sender.test@gmail.com>';

const MESSAGE: EmailMessage = {
  to: 'user@example.com',
  subject: 'Your week is ready',
  text: 'Plain text',
  html: '<p>HTML</p>',
  headers: { 'List-Unsubscribe': '<https://app.test/unsubscribe?token=t>' },
};

describe('createEmailTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: 'x' });
  });

  it('smtp builds a nodemailer transport with auth, TLS and short timeouts', () => {
    const transport = createEmailTransport({ provider: 'smtp', from: FROM, smtp: SMTP });
    expect(transport).toBeInstanceOf(SmtpEmailService);
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: SMTP.user, pass: SMTP.pass },
        connectionTimeout: 10_000,
      }),
    );
  });

  it('smtp without credentials refuses to build', () => {
    expect(() => createEmailTransport({ provider: 'smtp', from: FROM, smtp: null })).toThrow(
      /SMTP_USER and SMTP_PASS/,
    );
  });

  it('mock and resend never touch nodemailer', () => {
    createEmailTransport({ provider: 'mock', from: FROM, smtp: null });
    createEmailTransport({ provider: 'resend', from: FROM, smtp: null }, 're_1');
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it('smtp sends text + HTML and passes headers (List-Unsubscribe) through', async () => {
    const transport = createEmailTransport({ provider: 'smtp', from: FROM, smtp: SMTP });
    await transport.send(MESSAGE);
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: FROM,
      to: 'user@example.com',
      subject: 'Your week is ready',
      text: 'Plain text',
      html: '<p>HTML</p>',
      headers: { 'List-Unsubscribe': '<https://app.test/unsubscribe?token=t>' },
    });
  });

  it('a text-only message sends no html or headers keys', async () => {
    const transport = createEmailTransport({ provider: 'smtp', from: FROM, smtp: SMTP });
    await transport.send({ to: 'a@b.c', subject: 'Reset', text: 'link' });
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: FROM,
      to: 'a@b.c',
      subject: 'Reset',
      text: 'link',
    });
  });
});

describe('SmtpEmailService errors', () => {
  const smtpError = (responseCode: number, response: string) =>
    Object.assign(new Error(response), { responseCode, response });

  it("maps Gmail's daily-limit reply to EmailQuotaError", async () => {
    const service = new SmtpEmailService(
      {
        sendMail: vi
          .fn()
          .mockRejectedValue(smtpError(550, '550-5.4.5 Daily user sending limit exceeded.')),
      },
      FROM,
    );
    await expect(service.send(MESSAGE)).rejects.toBeInstanceOf(EmailQuotaError);
  });

  it('passes other failures through untouched', async () => {
    const auth = Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 });
    const service = new SmtpEmailService({ sendMail: vi.fn().mockRejectedValue(auth) }, FROM);
    await expect(service.send(MESSAGE)).rejects.toBe(auth);
  });

  it('isSmtpQuotaError recognises throttles, not every 4xx', () => {
    expect(isSmtpQuotaError(smtpError(421, '421-4.7.0 Try again later'))).toBe(true);
    expect(isSmtpQuotaError(smtpError(454, '454 4.7.0 Too many login attempts'))).toBe(true);
    expect(isSmtpQuotaError(smtpError(452, '452 4.2.2 The email account is over quota'))).toBe(
      false,
    );
    expect(isSmtpQuotaError(new Error('ECONNRESET'))).toBe(false);
    expect(isSmtpQuotaError(null)).toBe(false);
  });
});

describe('SendLog + PriorityEmailService', () => {
  it('counts sends in a rolling 24 hours', () => {
    const log = new SendLog();
    const t0 = Date.parse('2026-09-21T08:00:00Z');
    log.record(t0);
    log.record(t0 + 60_000);
    expect(log.countLastDay(t0 + 60_000)).toBe(2);
    expect(log.countLastDay(t0 + 24 * 3600_000 + 1)).toBe(1);
    expect(log.countLastDay(t0 + 25 * 3600_000)).toBe(0);
  });

  it('records successful sends only, and never blocks one past the cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const inner = { send: vi.fn().mockResolvedValue(undefined) };
    const log = new SendLog();
    const service = new PriorityEmailService(inner, log, 1);
    await service.send(MESSAGE);
    await service.send(MESSAGE);
    expect(inner.send).toHaveBeenCalledTimes(2);
    expect(log.countLastDay()).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);

    inner.send.mockRejectedValueOnce(new Error('down'));
    await expect(service.send(MESSAGE)).rejects.toThrow('down');
    expect(log.countLastDay()).toBe(2);
    warn.mockRestore();
  });
});

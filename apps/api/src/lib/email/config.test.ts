import { describe, expect, it } from 'vitest';
import {
  addressOf,
  bulkDailyAllowance,
  resolveEmailConfig,
  resolveEmailProvider,
  type EmailEnvInput,
} from './config';

const BASE: EmailEnvInput = {
  EMAIL_MOCK_ENABLED: true,
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: 465,
  SMTP_SECURE: true,
};

const GMAIL: EmailEnvInput = {
  ...BASE,
  EMAIL_PROVIDER: 'smtp',
  SMTP_USER: 'cheferapp.help@gmail.com',
  SMTP_PASS: 'abcd efgh ijkl mnop',
  EMAIL_FROM: 'Chefer <cheferapp.help@gmail.com>',
};

describe('resolveEmailProvider — backward compatible', () => {
  it('unset EMAIL_PROVIDER keeps the legacy switch', () => {
    expect(resolveEmailProvider({ EMAIL_MOCK_ENABLED: true })).toBe('mock');
    expect(resolveEmailProvider({ EMAIL_MOCK_ENABLED: false })).toBe('resend');
  });

  it('an explicit EMAIL_PROVIDER wins over EMAIL_MOCK_ENABLED', () => {
    expect(resolveEmailProvider({ EMAIL_PROVIDER: 'smtp', EMAIL_MOCK_ENABLED: true })).toBe('smtp');
    expect(resolveEmailProvider({ EMAIL_PROVIDER: 'mock', EMAIL_MOCK_ENABLED: false })).toBe(
      'mock',
    );
  });
});

describe('resolveEmailConfig', () => {
  it('defaults: mock, the shared Resend sender, no cap', () => {
    const { config, errors, warnings } = resolveEmailConfig(BASE);
    expect(config).toEqual({
      provider: 'mock',
      from: 'Chefer <onboarding@resend.dev>',
      dailyCap: null,
      smtp: null,
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('an existing Resend setup still works, and still needs its key', () => {
    const ok = resolveEmailConfig({ ...BASE, EMAIL_MOCK_ENABLED: false, RESEND_API_KEY: 're_1' });
    expect(ok.config.provider).toBe('resend');
    expect(ok.errors).toEqual([]);
    const missing = resolveEmailConfig({ ...BASE, EMAIL_MOCK_ENABLED: false });
    expect(missing.errors).toEqual(['RESEND_API_KEY is required when EMAIL_MOCK_ENABLED=false']);
  });

  it('smtp: Gmail over TLS, App Password spaces stripped, 400/day cap by default', () => {
    const { config, errors, warnings } = resolveEmailConfig(GMAIL);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(config).toEqual({
      provider: 'smtp',
      from: 'Chefer <cheferapp.help@gmail.com>',
      dailyCap: 400,
      smtp: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        user: 'cheferapp.help@gmail.com',
        pass: 'abcdefghijklmnop',
      },
    });
  });

  it('smtp requires SMTP_USER and SMTP_PASS', () => {
    const { errors } = resolveEmailConfig({ ...BASE, EMAIL_PROVIDER: 'smtp' });
    expect(errors).toEqual(['SMTP_USER and SMTP_PASS are required when EMAIL_PROVIDER=smtp']);
  });

  it('smtp without EMAIL_FROM sends as the SMTP account', () => {
    const { config, warnings } = resolveEmailConfig({ ...GMAIL, EMAIL_FROM: undefined });
    expect(config.from).toBe('Chefer <cheferapp.help@gmail.com>');
    expect(warnings).toEqual([]);
  });

  it('warns when the From address is not the Gmail account', () => {
    const { warnings } = resolveEmailConfig({ ...GMAIL, EMAIL_FROM: 'Chefer <hello@chefer.app>' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/EMAIL_FROM \(hello@chefer\.app\) differs from SMTP_USER/);
  });

  it('matches the From address case-insensitively, and only checks Gmail', () => {
    expect(
      resolveEmailConfig({ ...GMAIL, EMAIL_FROM: 'Chefer <CheferApp.Help@Gmail.com>' }).warnings,
    ).toEqual([]);
    expect(
      resolveEmailConfig({ ...GMAIL, SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'a@b.c' }).warnings,
    ).toEqual([]);
  });

  it('keeps a non-Gmail password as typed', () => {
    const { config } = resolveEmailConfig({ ...GMAIL, SMTP_HOST: 'mail.example.com' });
    expect(config.smtp?.pass).toBe('abcd efgh ijkl mnop');
  });

  it('warns about a port/TLS mismatch', () => {
    expect(resolveEmailConfig({ ...GMAIL, SMTP_PORT: 587 }).warnings[0]).toMatch(/STARTTLS/);
    expect(resolveEmailConfig({ ...GMAIL, SMTP_SECURE: false }).warnings[0]).toMatch(/465/);
  });

  it('EMAIL_DAILY_CAP overrides the default, and applies to any provider', () => {
    expect(resolveEmailConfig({ ...GMAIL, EMAIL_DAILY_CAP: 90 }).config.dailyCap).toBe(90);
    expect(resolveEmailConfig({ ...BASE, EMAIL_DAILY_CAP: 200 }).config.dailyCap).toBe(200);
  });

  it('warns when the cap leaves nothing for weekly emails', () => {
    expect(resolveEmailConfig({ ...GMAIL, EMAIL_DAILY_CAP: 50 }).warnings[0]).toMatch(
      /no room for weekly emails/,
    );
  });
});

describe('helpers', () => {
  it('addressOf reads a display-name From or a bare address', () => {
    expect(addressOf('Chefer <A@B.co>')).toBe('a@b.co');
    expect(addressOf(' a@b.co ')).toBe('a@b.co');
  });

  it('bulkDailyAllowance keeps 50 sends for reset/confirmation emails', () => {
    expect(bulkDailyAllowance(400)).toBe(350);
    expect(bulkDailyAllowance(30)).toBe(0);
  });
});

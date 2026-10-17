import { describe, expect, it } from 'vitest';
import {
  authEmailSchema,
  loginFormSchema,
  passwordConfirmationSchema,
  resetPasswordFormSchema,
} from './auth';

describe('auth schemas (UX-ACC-07)', () => {
  it('trims the email before validating it', () => {
    expect(authEmailSchema.parse('ana@example.com ')).toBe('ana@example.com');
    expect(authEmailSchema.parse('\tana@example.com\n')).toBe('ana@example.com');
    expect(loginFormSchema.parse({ email: ' a@b.co ', password: 'x' }).email).toBe('a@b.co');
  });

  it('still rejects blank and malformed addresses', () => {
    expect(authEmailSchema.safeParse('   ').success).toBe(false);
    expect(authEmailSchema.safeParse('a b@c.d').success).toBe(false);
  });

  it('flags a mismatched confirmation on confirmPassword', () => {
    const result = resetPasswordFormSchema.safeParse({
      password: 'Password123!',
      confirmPassword: 'Password124!',
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('checks only the confirmation: empty first, then a mismatch (F9)', () => {
    const issue = (password: string, confirmPassword: string) => {
      const result = passwordConfirmationSchema.safeParse({ password, confirmPassword });
      return result.success ? null : result.error.issues[0]?.message;
    };
    expect(issue('short', '')).toBe('Please confirm your password');
    expect(issue('short', 'shorter')).toBe('Passwords do not match');
    // The password's own rules (length) are not this schema's job.
    expect(issue('short', 'short')).toBeNull();
  });
});

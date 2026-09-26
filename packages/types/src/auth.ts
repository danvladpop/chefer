import { z } from 'zod';

// Auth form rules shared by the clients (CLAUDE.md "Shared-first"). The limits
// match what the API enforces in apps/api/src/routers/auth.router.ts — keep the
// two in sync so client validation never disagrees with the server.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;

export const authEmailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address');

/** A password being chosen (register, reset) — the API's length rules. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, 'Password too long');

export const confirmPasswordSchema = z.string().min(1, 'Please confirm your password');

/**
 * `z.object(shape)` plus the "Passwords do not match" check, for any form
 * with `password` + `confirmPassword` — the error lands on `confirmPassword`.
 */
export function withPasswordConfirmation<
  S extends z.ZodRawShape & { password: z.ZodString; confirmPassword: z.ZodString },
>(shape: S) {
  return z.object(shape).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
}

export const loginFormSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordFormSchema = z.object({
  email: authEmailSchema,
});

export const resetPasswordFormSchema = withPasswordConfirmation({
  password: newPasswordSchema,
  confirmPassword: confirmPasswordSchema,
});

export type LoginFormInput = z.infer<typeof loginFormSchema>;
export type ForgotPasswordFormInput = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

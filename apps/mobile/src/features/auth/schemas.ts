import { z } from 'zod';
import {
  authEmailSchema,
  confirmPasswordSchema,
  forgotPasswordFormSchema,
  loginFormSchema,
  newPasswordSchema,
  resetPasswordFormSchema,
  withPasswordConfirmation,
} from '@chefer/types';

// The rules themselves live in @chefer/types (shared with the API's limits in
// apps/api/src/routers/auth.router.ts) — this file only shapes them into the
// mobile forms.

export const loginSchema = loginFormSchema;

export const registerSchema = withPasswordConfirmation({
  email: authEmailSchema,
  password: newPasswordSchema,
  confirmPassword: confirmPasswordSchema,
  firstName: z.string().max(50).optional(),
});

export const forgotPasswordSchema = forgotPasswordFormSchema;

export const resetPasswordSchema = resetPasswordFormSchema;

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

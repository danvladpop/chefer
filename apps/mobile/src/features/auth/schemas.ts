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

// T-39.1 / T-26.5: the mobile app always sends `x-chefer-api-level: 1`
// (trpc-links.ts), so both boxes are required client-side — an unchecked box
// keeps the submit button enabled (03 §UX-26 AC) but shows an inline error.
export const registerSchema = withPasswordConfirmation({
  email: authEmailSchema,
  password: newPasswordSchema,
  confirmPassword: confirmPasswordSchema,
  firstName: z.string().max(50).optional(),
  // `z.boolean().refine` rather than `z.literal(true)` — the form value is a
  // real boolean while the box is unchecked (starts `false`), and `z.infer`
  // needs to type it as `boolean`, not the literal `true`.
  acceptedTerms: z
    .boolean()
    .refine((v) => v, { message: 'You must agree to the Terms and the Privacy Policy' }),
  ageConfirmed: z.boolean().refine((v) => v, { message: 'You must confirm you are 16 or older' }),
});

export const forgotPasswordSchema = forgotPasswordFormSchema;

export const resetPasswordSchema = resetPasswordFormSchema;

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

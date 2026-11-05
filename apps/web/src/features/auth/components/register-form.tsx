'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { nextQuery } from '@/features/coaching/lib/next-path';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { trpc } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { deviceSupportedLocale, type Translator } from '@chefer/i18n';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { detectRegion, userFacingErrorMessage } from '@chefer/utils';

// UX-25 (T-25.2) / UX-26 (T-26.5) / UX-39 (T-39.1) / B-25.

const makeRegisterSchema = (t: Translator['t']) =>
  z
    .object({
      firstName: z.string().min(1, t('auth.validation.firstNameRequired')).max(50),
      lastName: z.string().min(1, t('auth.validation.lastNameRequired')).max(50),
      // UX-ACC-07: trimmed before validation (autofill / suggestions append a space).
      email: z
        .string()
        .trim()
        .min(1, t('auth.validation.emailRequired'))
        .email(t('auth.validation.emailInvalid')),
      password: z
        .string()
        .min(8, t('auth.validation.passwordMin', { min: 8 }))
        .max(100),
      confirmPassword: z.string().min(1, t('auth.validation.confirmRequired')),
      // T-39.1 / T-26.5: real checkboxes that must be ticked before submit —
      // the boolean starts `false`, so this stays `z.boolean().refine`, not
      // `z.literal(true)` (which would type the field as the literal `true`
      // and reject the unchecked default).
      acceptedTerms: z.boolean().refine((v) => v, { message: t('auth.validation.termsRequired') }),
      ageConfirmed: z.boolean().refine((v) => v, { message: t('auth.validation.ageRequired') }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.validation.mismatch'),
      path: ['confirmPassword'],
    });

type RegisterFormValues = z.infer<ReturnType<typeof makeRegisterSchema>>;

export function RegisterForm({ next = null }: { next?: string | null }) {
  const { t } = useT();
  const registerSchema = useMemo(() => makeRegisterSchema(t), [t]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const registerMutation = trpc.auth.register.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      // UX-PO-02: a count, no identity — the visitor is still anonymous here.
      capture('signup_completed', {});
      // Same as login: drop anything cached for a previously signed-in account.
      queryClient.clear();
      router.push(next ?? '/onboarding');
      router.refresh();
    },
    onError: (err) => {
      setServerError(userFacingErrorMessage(err, t('auth.register.failed')));
      // UX-ACC-15: "already exists" is not a dead end — offer Sign in / Reset.
      setAccountExists(err.data?.code === 'CONFLICT');
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false,
      ageConfirmed: false,
    },
  });

  // Bug B-25: the cross-field `.refine` attaches "Passwords do not match" to
  // `confirmPassword`; react-hook-form only re-validates a field when THAT
  // field itself changes, so editing `password` after a mismatch left a
  // stale error even once the two matched again. Re-check confirmPassword
  // whenever password changes, once confirmPassword has something to compare.
  // UX-ACC-16: ...and also when the confirmation itself changes while the
  // error is showing, so a stale mismatch can never sit under equal values.
  const password = watch('password');
  const confirm = watch('confirmPassword');
  useEffect(() => {
    if (getValues('confirmPassword') && errors.confirmPassword) {
      void trigger('confirmPassword');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, confirm]);

  const onSubmit = (data: RegisterFormValues) => {
    setServerError(null);
    setAccountExists(false);
    // Location defaults (P2-6): the browser's region seeds units + currency.
    const region = detectRegion(typeof navigator === 'undefined' ? [] : navigator.languages);
    // ADR 0004: the confirmation email goes out in the browser's language.
    const deviceLocale = deviceSupportedLocale();
    registerMutation.mutate({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      acceptedTerms: data.acceptedTerms,
      ageConfirmed: data.ageConfirmed,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      ...(region && { region }),
      ...(deviceLocale && { deviceLocale }),
    });
  };

  const isPending = registerMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && (
        <div
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {serverError}
          {accountExists && (
            <p className="mt-2 flex flex-wrap gap-x-4">
              <Link
                href={`/login${nextQuery(next)}`}
                className="touch-target relative font-medium underline underline-offset-4"
              >
                {t('auth.register.signInInstead')}
              </Link>
              <Link
                href="/forgot-password"
                className="touch-target relative font-medium underline underline-offset-4"
              >
                {t('auth.register.resetPassword')}
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Name Row */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-3">
        <div className="space-y-1.5">
          <label htmlFor="firstName" className="block text-sm font-medium">
            {t('auth.fields.firstName')}
            <span className="ml-1 text-destructive" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="firstName"
            type="text"
            autoComplete="given-name"
            autoFocus
            disabled={isPending}
            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={t('auth.placeholders.firstName')}
            aria-invalid={errors.firstName ? 'true' : undefined}
            aria-describedby={errors.firstName ? 'firstName-error' : undefined}
            {...register('firstName')}
          />
          {errors.firstName && (
            <p id="firstName-error" className="text-sm text-destructive" role="alert">
              {errors.firstName.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lastName" className="block text-sm font-medium">
            {t('auth.fields.lastName')}
            <span className="ml-1 text-destructive" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="lastName"
            type="text"
            autoComplete="family-name"
            disabled={isPending}
            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={t('auth.placeholders.lastName')}
            aria-invalid={errors.lastName ? 'true' : undefined}
            aria-describedby={errors.lastName ? 'lastName-error' : undefined}
            {...register('lastName')}
          />
          {errors.lastName && (
            <p id="lastName-error" className="text-sm text-destructive" role="alert">
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          {t('auth.fields.email')}
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          disabled={isPending}
          className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={t('auth.placeholders.email')}
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email', {
            onChange: () => {
              setServerError(null);
              setAccountExists(false);
            },
          })}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          {t('auth.fields.password')}
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            disabled={isPending}
            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={t('auth.placeholders.passwordMin')}
            aria-invalid={errors.password ? 'true' : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? t('auth.password.hide') : t('auth.password.show')}
          >
            {showPassword ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className="text-sm text-destructive" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="block text-sm font-medium">
          {t('auth.fields.confirmPassword')}
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          disabled={isPending}
          className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={t('auth.placeholders.passwordAgain')}
          aria-invalid={errors.confirmPassword ? 'true' : undefined}
          aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p id="confirmPassword-error" className="text-sm text-destructive" role="alert">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* T-39.1 / T-26.5: explicit consent — the button stays enabled either
          way (03 §UX-26 AC); the inline error is what blocks submission. */}
      <div className="space-y-1.5">
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-input"
            aria-invalid={errors.acceptedTerms ? 'true' : undefined}
            aria-describedby={errors.acceptedTerms ? 'acceptedTerms-error' : undefined}
            {...register('acceptedTerms')}
          />
          <span>
            {rich(t, 'auth.register.agreeTerms', {
              terms: (
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {t('auth.links.terms')}
                </a>
              ),
              privacy: (
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {t('auth.links.privacy')}
                </a>
              ),
            })}
          </span>
        </label>
        {errors.acceptedTerms && (
          <p id="acceptedTerms-error" className="text-sm text-destructive" role="alert">
            {errors.acceptedTerms.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-input"
            aria-invalid={errors.ageConfirmed ? 'true' : undefined}
            aria-describedby={errors.ageConfirmed ? 'ageConfirmed-error' : undefined}
            {...register('ageConfirmed')}
          />
          <span>{t('auth.register.ageLabel')}</span>
        </label>
        {errors.ageConfirmed && (
          <p id="ageConfirmed-error" className="text-sm text-destructive" role="alert">
            {errors.ageConfirmed.message}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-busy={isPending}
      >
        {isPending ? (
          <>
            <svg
              className="-ml-1 mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {t('auth.register.submitting')}
          </>
        ) : (
          t('auth.register.submit')
        )}
      </button>
    </form>
  );
}

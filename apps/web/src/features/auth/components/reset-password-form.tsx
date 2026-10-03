'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { trpc } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RESET_LINK_INVALID_MESSAGE } from '@chefer/types';
import { userFacingErrorMessage } from '@chefer/utils';

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password too long'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

const INPUT_CLASSES =
  'flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // UX-ACC-09: an expired / used token is a dead end for the form.
  const [linkInvalid, setLinkInvalid] = useState(false);

  const resetMutation = trpc.auth.resetPassword.useMutation({
    meta: { silent: true },
    onSuccess: () => setDone(true),
    onError: (err) => {
      if (err.message === RESET_LINK_INVALID_MESSAGE) setLinkInvalid(true);
      else setServerError(userFacingErrorMessage(err));
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // UX-ACC-16: re-check the confirmation when EITHER field changes while its
  // "Passwords do not match" error is showing, so it never sits under equal values.
  const password = watch('password');
  const confirm = watch('confirmPassword');
  useEffect(() => {
    if (getValues('confirmPassword') && errors.confirmPassword) {
      void trigger('confirmPassword');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, confirm]);

  // UX-ACC-09: the heading follows the stage (the success card used to sit
  // under "Choose a new password").
  const linkProblem = !token || linkInvalid;
  const title = done
    ? 'Password changed'
    : linkProblem
      ? 'This link no longer works'
      : 'Choose a new password';

  const header = (
    <div className="text-center">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 font-serif text-2xl font-semibold text-[#944a00]"
      >
        <span className="text-3xl" aria-hidden="true">
          🍽️
        </span>
        <span>Chefer</span>
      </Link>
      <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">{title}</h1>
      {!done && !linkProblem && (
        <p className="mt-2 text-sm text-muted-foreground">
          This link works once and expires an hour after it was requested
        </p>
      )}
    </div>
  );

  if (linkProblem) {
    return (
      <>
        {header}
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="space-y-3 text-center text-sm">
            <p>
              {token
                ? RESET_LINK_INVALID_MESSAGE
                : 'This page needs the link from your reset email.'}
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-input px-4 py-2 font-medium hover:bg-accent"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (done) {
    return (
      <>
        {header}
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="space-y-4 text-center">
            <span className="text-3xl" aria-hidden="true">
              ✅
            </span>
            <p className="text-sm">
              Your password has been changed and all devices signed out. Sign in with your new
              password.
            </p>
            <Link
              href="/login"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <form
          onSubmit={handleSubmit((data) => {
            setServerError(null);
            resetMutation.mutate({ token, password: data.password });
          })}
          noValidate
          className="space-y-5"
        >
          {serverError && (
            <div
              className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {serverError}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium">
              New password
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              disabled={resetMutation.isPending}
              className={INPUT_CLASSES}
              aria-invalid={errors.password ? 'true' : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            {errors.password && (
              <p id="password-error" className="text-sm text-destructive" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-sm font-medium">
              Confirm new password
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              disabled={resetMutation.isPending}
              className={INPUT_CLASSES}
              aria-invalid={errors.confirmPassword ? 'true' : undefined}
              aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p id="confirm-error" className="text-sm text-destructive" role="alert">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={resetMutation.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {resetMutation.isPending ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>
    </>
  );
}

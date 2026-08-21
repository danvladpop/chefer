'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { trpc } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
    onError: (err) => setServerError(err.message),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <div className="space-y-3 text-center text-sm">
        <p>This page needs the link from your reset email.</p>
        <Link
          href="/forgot-password"
          className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <span className="text-3xl" aria-hidden="true">
          ✅
        </span>
        <p className="text-sm">
          Your password has been changed and all devices signed out. Sign in with your new password.
        </p>
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
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
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {resetMutation.isPending ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}

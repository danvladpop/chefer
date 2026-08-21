'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { trpc } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const forgotSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

const INPUT_CLASSES =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const requestMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
    onError: (err) => setServerError(err.message),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <span className="text-3xl" aria-hidden="true">
          📬
        </span>
        <p className="text-sm">
          If an account exists for that address, a reset link is on its way. It expires in one hour
          — check your spam folder too.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        requestMutation.mutate(data);
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
        <label htmlFor="email" className="block text-sm font-medium">
          Email address
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          disabled={requestMutation.isPending}
          className={INPUT_CLASSES}
          placeholder="you@example.com"
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={requestMutation.isPending}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {requestMutation.isPending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}

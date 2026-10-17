'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SocialSignIn } from '@/features/auth/components/social-sign-in';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Mail } from 'lucide-react';
import { z } from 'zod';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { pressControl } from '@chefer/ui';
import { cn, detectRegion, ONBOARDING_V4_COPY, userFacingErrorMessage } from '@chefer/utils';
import { BiscuitHalo, PrimaryButton, V4Heading, V4TopBar } from './components/ui';

// ─── Save your plan (OnbV4Account + OnbV4AccountEmail) ────────────────────────
// Flag `onboardingV4`. Apple / Google first (the existing SocialSignIn — a
// provider tap is the legal consent, its own line says so), then "Continue
// with email" reveals email + password (Show toggle, no confirm field) and ONE
// checkbox for 16+ and Terms/Privacy, sent as both `acceptedTerms` and
// `ageConfirmed`. Same auth.register mutation and success path as
// RegisterForm: clear the cache, then /onboarding.

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must be at most 100 characters');
const AGREE_ERROR = 'You must agree to the Terms and the Privacy Policy';

const inputCls =
  'min-h-12 w-full min-w-0 rounded-control border border-revamp-separator bg-revamp-surface px-3.5 text-[1.0625rem] text-revamp-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function RegisterV4() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string | undefined;
    password?: string | undefined;
    agree?: string | undefined;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);

  const registerMutation = trpc.auth.register.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      // UX-PO-02: a count, no identity — the visitor is still anonymous here.
      capture('signup_completed', {});
      queryClient.clear();
      router.push('/onboarding');
      router.refresh();
    },
    onError: (err) => {
      setServerError(userFacingErrorMessage(err, 'Registration failed. Please try again.'));
      setAccountExists(err.data?.code === 'CONFLICT');
    },
  });
  const isPending = registerMutation.isPending;

  function submit() {
    setServerError(null);
    setAccountExists(false);
    const e = emailSchema.safeParse(email);
    const p = passwordSchema.safeParse(password);
    const next = {
      ...(!e.success && { email: e.error.issues[0]?.message }),
      ...(!p.success && { password: p.error.issues[0]?.message }),
      ...(!agreed && { agree: AGREE_ERROR }),
    };
    setErrors(next);
    if (!e.success || !p.success || !agreed) return;
    // Location defaults (P2-6): the browser's region seeds units + currency.
    const region = detectRegion(typeof navigator === 'undefined' ? [] : navigator.languages);
    registerMutation.mutate({
      email: e.data,
      password: p.data,
      acceptedTerms: true,
      ageConfirmed: true,
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      ...(region && { region }),
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-revamp-canvas px-4 py-8 text-revamp-label sm:py-12">
      {/* The (auth) layout owns <main id="main">. */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 sm:justify-center">
        {emailOpen && (
          <V4TopBar
            progress={null}
            onBack={() => {
              setEmailOpen(false);
              setServerError(null);
            }}
            backDisabled={isPending}
          />
        )}
        {!emailOpen && <BiscuitHalo loop="curious" size={180} />}
        <V4Heading
          title={emailOpen ? ONBOARDING_V4_COPY.accountEmailTitle : ONBOARDING_V4_COPY.accountTitle}
          {...(!emailOpen && { lede: ONBOARDING_V4_COPY.accountLede })}
        />

        {!emailOpen && (
          <div className="flex flex-col gap-2.5">
            <div className="empty:hidden">
              <SocialSignIn mode="register" hideDivider />
            </div>
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              data-testid="v4-account-email"
              className={cn(
                'flex min-h-12 items-center justify-center gap-2.5 rounded-control border border-revamp-separator bg-revamp-surface px-4 text-[1.0625rem] font-semibold text-revamp-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                pressControl,
              )}
            >
              <Mail className="h-5 w-5" aria-hidden="true" />
              {ONBOARDING_V4_COPY.accountEmail}
            </button>
          </div>
        )}

        {emailOpen && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            {serverError && (
              <div
                role="alert"
                className="rounded-control border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {serverError}
                {accountExists && (
                  <p className="mt-2 flex flex-wrap gap-x-4">
                    <Link
                      href="/login"
                      className="touch-target relative font-medium underline underline-offset-4"
                    >
                      Sign in instead
                    </Link>
                    <Link
                      href="/forgot-password"
                      className="touch-target relative font-medium underline underline-offset-4"
                    >
                      Reset your password
                    </Link>
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="v4-email"
                className="text-[0.9375rem] font-semibold text-revamp-label-secondary"
              >
                Email
              </label>
              <input
                id="v4-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                disabled={isPending}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setServerError(null);
                  setAccountExists(false);
                }}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'v4-email-error' : undefined}
                className={inputCls}
              />
              {errors.email && (
                <p id="v4-email-error" role="alert" className="text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="v4-password"
                className="text-[0.9375rem] font-semibold text-revamp-label-secondary"
              >
                Password
              </label>
              <div className="relative flex">
                <input
                  id="v4-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  disabled={isPending}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={
                    errors.password ? 'v4-password-hint v4-password-error' : 'v4-password-hint'
                  }
                  className={cn(inputCls, 'pr-16')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 min-w-[3.75rem] text-base font-semibold text-revamp-brand"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <p id="v4-password-hint" className="text-sm text-revamp-label-tertiary">
                Min. 8 characters
              </p>
              {errors.password && (
                <p id="v4-password-error" role="alert" className="text-sm text-destructive">
                  {errors.password}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] text-revamp-label-secondary">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  aria-invalid={errors.agree ? true : undefined}
                  aria-describedby={errors.agree ? 'v4-agree-error' : undefined}
                  data-testid="v4-account-agree"
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                    agreed
                      ? 'bg-revamp-brand text-revamp-on-brand'
                      : 'border-2 border-revamp-separator bg-revamp-surface',
                  )}
                >
                  {agreed && <Check className="h-3.5 w-3.5" />}
                </span>
                <AgreeText />
              </label>
              {errors.agree && (
                <p id="v4-agree-error" role="alert" className="text-sm text-destructive">
                  {errors.agree}
                </p>
              )}
            </div>

            <PrimaryButton type="submit" busy={isPending} testId="v4-account-create">
              {ONBOARDING_V4_COPY.accountCreate}
            </PrimaryButton>
          </form>
        )}

        <p className="text-center text-[0.9375rem] text-revamp-label-secondary">
          {ONBOARDING_V4_COPY.accountHaveAccount}{' '}
          <Link
            href="/login"
            className="touch-target relative font-semibold text-revamp-brand underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/** accountAgree with its Terms / Privacy Policy words linked. */
function AgreeText() {
  const text = ONBOARDING_V4_COPY.accountAgree;
  const terms = 'Terms';
  const privacy = 'Privacy Policy';
  const ti = text.indexOf(terms);
  const pi = text.indexOf(privacy);
  if (ti < 0 || pi < ti) return <span>{text}</span>;
  const link = 'text-revamp-brand underline';
  return (
    <span>
      {text.slice(0, ti)}
      <a href="/terms" target="_blank" rel="noreferrer" className={link}>
        {terms}
      </a>
      {text.slice(ti + terms.length, pi)}
      <a href="/privacy" target="_blank" rel="noreferrer" className={link}>
        {privacy}
      </a>
      {text.slice(pi + privacy.length)}
    </span>
  );
}

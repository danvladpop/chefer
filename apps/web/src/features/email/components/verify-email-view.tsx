'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

// Confirms the address from the emailed link (audit P2-5) — weekly emails
// only go to confirmed addresses. No login needed: the signed token names the
// account and the address it was sent to.

const LINK_CLASSES =
  'inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:text-primary/80';

export function VerifyEmailView() {
  const token = useSearchParams().get('token') ?? '';
  const mutation = trpc.notifications.confirmEmail.useMutation();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    mutation.mutate({ token });
  }, [token, mutation]);

  if (!token || mutation.isError) {
    return (
      <div className="space-y-3">
        <p>This confirmation link is invalid or has expired.</p>
        <p className="text-muted-foreground">
          Sign in and use &ldquo;Send confirmation link&rdquo; in Preferences to get a new one.
        </p>
        <Link href="/preferences" className={LINK_CLASSES}>
          Open Preferences
        </Link>
      </div>
    );
  }

  if (!mutation.isSuccess) {
    return (
      <p role="status" className="text-muted-foreground">
        Confirming your email…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p role="status">
        Your email is confirmed. Your week will arrive on Monday mornings, and a recap on Sunday
        evenings.
      </p>
      <Link href="/dashboard" className={LINK_CLASSES}>
        Go to Chefer
      </Link>
    </div>
  );
}

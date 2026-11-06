import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { getServerTranslator } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    title: t('auth.forgot.metaTitle'),
    description: t('auth.forgot.metaDescription'),
    robots: { index: false },
  };
}

export default async function ForgotPasswordPage() {
  const { t } = await getServerTranslator();
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-12">
      {/* sm:my-auto (UX-ACC-14: top-aligned on phones so fields do not jump as errors
          appear; not justify-center on the parent): auto margins collapse to 0
          when the card overflows a short phone viewport, keeping the top reachable. */}
      <div className="w-full max-w-md space-y-8 sm:my-auto">
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
          <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">
            {t('auth.forgot.title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('auth.forgot.subtitle')}</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <ForgotPasswordForm />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.forgot.remembered')}{' '}
          <Link
            href="/login"
            className="touch-target relative font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            {t('auth.forgot.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}

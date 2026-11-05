import type { Metadata } from 'next';
import Link from 'next/link';
import { smartAppBanner } from '@/features/app-stores/store-metadata';
import { rich } from '@/lib/i18n/rich';
import { getServerTranslator } from '@/lib/i18n/server';
import { SUPPORT_EMAIL } from '@chefer/types';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    ...smartAppBanner(),
    title: t('legal.terms.metaTitle'),
    description: t('legal.terms.metaDescription'),
  };
}

// Plain-language terms (backlog P0-6, 2026-09-26). Linked from register/login,
// the landing footer, /support, web Profile and the mobile register + More
// screens.
//
// MAINTAINERS: this text was drafted without a lawyer. Have it reviewed by a
// lawyer qualified in Romanian/EU consumer law before any paid launch, and
// before adding prices or payment terms. Bump the effective date
// (`legal.terms.effectiveDate`) on every material change and tell users about
// it (see "Changes to these terms"). The text lives in the `legal` catalog
// (English and Romanian); change both together.

const linkClass = 'touch-target relative text-[#944a00] underline underline-offset-4';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

export default async function TermsPage() {
  const { t } = await getServerTranslator();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">{t('legal.terms.title')}</h1>
      <p className="mt-2 text-sm font-medium text-gray-700">
        {t('legal.common.effective', { date: t('legal.terms.effectiveDate') })}
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700">
        <Section title={t('legal.terms.short.title')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('legal.terms.short.i1')}</li>
            <li>{t('legal.terms.short.i2')}</li>
            <li>{t('legal.terms.short.i3')}</li>
            <li>{t('legal.terms.short.i4')}</li>
            <li>{t('legal.terms.short.i5')}</li>
          </ul>
        </Section>

        <Section title={t('legal.terms.who.title')}>
          <p>
            {rich(t, 'legal.terms.who.p1', {
              privacy: (
                <Link href="/privacy" className={linkClass}>
                  {t('legal.common.privacyPolicy')}
                </Link>
              ),
            })}
          </p>
        </Section>

        <Section title={t('legal.terms.age.title')}>
          <p>{t('legal.terms.age.p1')}</p>
        </Section>

        <Section title={t('legal.terms.account.title')}>
          <p>{t('legal.terms.account.p1')}</p>
        </Section>

        <Section title={t('legal.terms.fair.title')}>
          <p>{t('legal.terms.fair.intro')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('legal.terms.fair.i1')}</li>
            <li>{t('legal.terms.fair.i2')}</li>
            <li>{t('legal.terms.fair.i3')}</li>
            <li>{t('legal.terms.fair.i4')}</li>
            <li>{t('legal.terms.fair.i5')}</li>
          </ul>
          <p>{t('legal.terms.fair.outro')}</p>
        </Section>

        <Section title={t('legal.terms.content.title')}>
          <p>{t('legal.terms.content.p1')}</p>
          <p>{t('legal.terms.content.p2')}</p>
        </Section>

        <Section title={t('legal.terms.health.title')}>
          <p>{t('legal.terms.health.p1')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('legal.terms.health.i1')}</li>
            <li>{t('legal.terms.health.i2')}</li>
            <li>{t('legal.terms.health.i3')}</li>
          </ul>
        </Section>

        <Section title={t('legal.terms.allergies.title')}>
          <p>{t('legal.terms.allergies.p1')}</p>
        </Section>

        <Section title={t('legal.terms.ai.title')}>
          <p>{t('legal.terms.ai.p1')}</p>
        </Section>

        <Section title={t('legal.terms.plans.title')}>
          <p>{t('legal.terms.plans.p1')}</p>
        </Section>

        <Section title={t('legal.terms.availability.title')}>
          <p>{t('legal.terms.availability.p1')}</p>
        </Section>

        <Section title={t('legal.terms.ending.title')}>
          <p>{rich(t, 'legal.terms.ending.p1')}</p>
          <p>{t('legal.terms.ending.p2')}</p>
        </Section>

        <Section title={t('legal.terms.responsibility.title')}>
          <p>{t('legal.terms.responsibility.p1')}</p>
          <p>{t('legal.terms.responsibility.p2')}</p>
          <p>{t('legal.terms.responsibility.p3')}</p>
        </Section>

        <Section title={t('legal.terms.law.title')}>
          <p>{t('legal.terms.law.p1')}</p>
        </Section>

        <Section title={t('legal.terms.changes.title')}>
          <p>{t('legal.terms.changes.p1')}</p>
        </Section>

        <Section title={t('legal.terms.contact.title')}>
          <p>
            {rich(t, 'legal.terms.contact.p1', {
              email: (
                <a href={`mailto:${SUPPORT_EMAIL}`} className={`${linkClass} break-all`}>
                  {SUPPORT_EMAIL}
                </a>
              ),
              support: (
                <Link href="/support" className={linkClass}>
                  {t('legal.common.helpAndSupport')}
                </Link>
              ),
            })}
          </p>
        </Section>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className={linkClass}>
          {t('legal.common.backToChefer')}
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className={linkClass}>
          {t('legal.common.privacyPolicy')}
        </Link>{' '}
        ·{' '}
        <Link href="/support" className={linkClass}>
          {t('legal.common.support')}
        </Link>
      </p>
    </main>
  );
}

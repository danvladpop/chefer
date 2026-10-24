import type { Metadata } from 'next';
import Link from 'next/link';
import { aiProviderNames } from '@/features/ai-consent/provider-names';
import { StoreBadges, StoreTrademarks } from '@/features/app-stores/components/StoreBadges';
import { smartAppBanner } from '@/features/app-stores/store-metadata';
import { fetchAiProviderDisclosure } from '@/lib/ai-providers';
import { rich } from '@/lib/i18n/rich';
import { getServerTranslator } from '@/lib/i18n/server';
import { SUPPORT_EMAIL } from '@chefer/types';
import { aiDisclosureProviders } from '@chefer/utils';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    ...smartAppBanner(),
    title: t('legal.support.metaTitle'),
    description: t('legal.support.metaDescription'),
  };
}

// Public support page — the Support URL App Store Connect requires. No auth
// (not in middleware.ts PROTECTED_ROUTES); same look as /privacy and /terms.

const linkClass = 'touch-target relative text-[#944a00] underline underline-offset-4';

export default async function SupportPage() {
  const { t } = await getServerTranslator();
  const ai = await fetchAiProviderDisclosure();
  const faq: { q: string; a: React.ReactNode }[] = [
    { q: t('legal.support.faq.resetQ'), a: rich(t, 'legal.support.faq.resetA') },
    {
      q: t('legal.support.faq.deleteQ'),
      a: rich(t, 'legal.support.faq.deleteA', {
        privacy: (
          <Link href="/privacy" className={linkClass}>
            {t('legal.support.faq.deletePrivacyLink')}
          </Link>
        ),
      }),
    },
    {
      q: t('legal.support.faq.aiQ'),
      a: rich(
        t,
        'legal.support.faq.aiA',
        {},
        { providers: aiProviderNames(aiDisclosureProviders(ai), t) },
      ),
    },
    { q: t('legal.support.faq.premiumQ'), a: t('legal.support.faq.premiumA') },
  ];
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">
        {t('legal.support.title')}
      </h1>
      <p className="mt-2 text-sm text-gray-500">{t('legal.support.updated')}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t('legal.support.what.title')}</h2>
          <p>{t('legal.support.what.p1')}</p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t('legal.support.app.title')}</h2>
          <p>{t('legal.support.app.p1')}</p>
          <StoreBadges campaign="support" className="mt-1 justify-start" />
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">{t('legal.support.help.title')}</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>{rich(t, 'legal.support.help.i1')}</li>
            <li>
              {rich(t, 'legal.support.help.i2', {
                email: (
                  <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                    {SUPPORT_EMAIL}
                  </a>
                ),
              })}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-gray-900">{t('legal.support.faq.title')}</h2>
          <div className="space-y-4">
            {faq.map(({ q, a }) => (
              <div key={q}>
                <h3 className="font-medium text-gray-900">{q}</h3>
                <p className="mt-1">{a}</p>
              </div>
            ))}
          </div>
        </section>
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
        <Link href="/terms" className={linkClass}>
          {t('legal.common.termsOfService')}
        </Link>
      </p>
      <StoreTrademarks className="mt-6" />
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { aiProviderNames } from '@/features/ai-consent/provider-names';
import { smartAppBanner } from '@/features/app-stores/store-metadata';
import { fetchAiProviderDisclosure } from '@/lib/ai-providers';
import { rich } from '@/lib/i18n/rich';
import { getServerTranslator } from '@/lib/i18n/server';
import { AI_PROVIDERS, SUPPORT_EMAIL, type AiProviderId } from '@chefer/types';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    ...smartAppBanner(),
    title: t('legal.privacy.metaTitle'),
    description: t('legal.privacy.metaDescription'),
  };
}

// GDPR Art. 13 privacy notice, in plain language (backlog P0-6, 2026-09-26).
// Linked from register/login, the landing footer, /support, web Profile and the
// mobile register + More screens.
//
// MAINTAINERS: this text was drafted without a lawyer. Have it reviewed by a
// lawyer qualified in Romanian/EU data-protection law before any paid launch.
// Keep it true to the code: when a processor, retention period or data flow
// changes, update this page in the same PR (the processor evidence is listed
// in infrastructure.md §15, "Privacy & analytics consent"). Bump the effective
// date (`legal.privacy.effectiveDate`) on every material change. The text
// lives in the `legal` catalog (English and Romanian); change both together.

const ANSPDCP_HOST = 'dataprotection.ro';

const linkClass = 'touch-target relative text-[#944a00] underline underline-offset-4';

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-2">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Mail() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={`${linkClass} break-all`}>
      {SUPPORT_EMAIL}
    </a>
  );
}

export default async function PrivacyPage() {
  const { t } = await getServerTranslator();
  // The AI recipients come from the live API config (profile.aiProviders), so
  // this page names exactly who receives data — Gemini, or in free-only mode
  // Groq and Cloudflare Workers AI.
  const ai = await fetchAiProviderDisclosure();
  const primary = AI_PROVIDERS[ai.primary];
  const backups = ai.backups.filter((id) => id !== ai.primary);
  // The providers' own detail line is catalog text, so it follows the language.
  const detail = (id: AiProviderId) => t(`legal.privacy.recipients.detail.${id}`);
  const analytics = (
    <a href="#analytics" className={linkClass}>
      {t('legal.privacy.collect.analyticsLink')}
    </a>
  );
  const support = (
    <Link href="/support" className={linkClass}>
      {t('legal.common.helpAndSupport')}
    </Link>
  );
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">
        {t('legal.privacy.title')}
      </h1>
      <p className="mt-2 text-sm font-medium text-gray-700">
        {t('legal.common.effective', { date: t('legal.privacy.effectiveDate') })}
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700">
        <Section title={t('legal.privacy.short.title')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('legal.privacy.short.i1')}</li>
            <li>{t('legal.privacy.short.i2')}</li>
            <li>{t('legal.privacy.short.i3')}</li>
            <li>{t('legal.privacy.short.i4')}</li>
            <li>{t('legal.privacy.short.i5')}</li>
          </ul>
        </Section>

        <Section title={t('legal.privacy.who.title')}>
          <p>{rich(t, 'legal.privacy.who.p1', { email: <Mail /> })}</p>
        </Section>

        <Section title={t('legal.privacy.collect.title')}>
          <p>{t('legal.privacy.collect.intro')}</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>{rich(t, 'legal.privacy.collect.i1')}</li>
            <li>{rich(t, 'legal.privacy.collect.i2')}</li>
            <li>{rich(t, 'legal.privacy.collect.i3')}</li>
            <li>{rich(t, 'legal.privacy.collect.i4')}</li>
            <li>{rich(t, 'legal.privacy.collect.i5')}</li>
            <li>{rich(t, 'legal.privacy.collect.i6')}</li>
            <li>{rich(t, 'legal.privacy.collect.i7', { analytics })}</li>
          </ul>
          <p>{t('legal.privacy.collect.outro')}</p>
        </Section>

        <Section title={t('legal.privacy.health.title')}>
          <p>{t('legal.privacy.health.p1')}</p>
          <p>{rich(t, 'legal.privacy.health.p2')}</p>
          <p>{t('legal.privacy.health.p3')}</p>
        </Section>

        <Section title={t('legal.privacy.ai.title')}>
          <p>
            {rich(
              t,
              'legal.privacy.ai.p1',
              {},
              {
                primary: primary.name,
                backup:
                  backups.length > 0
                    ? t('legal.privacy.ai.backup', {
                        count: backups.length,
                        primaryShort: primary.shortName,
                        backups: aiProviderNames(backups, t),
                      })
                    : '',
              },
            )}
          </p>
          <p>{rich(t, 'legal.privacy.ai.p2')}</p>
          <p>{t('legal.privacy.ai.p3')}</p>
        </Section>

        <Section title={t('legal.privacy.camera.title')}>
          <p>{t('legal.privacy.camera.p1')}</p>
        </Section>

        <Section title={t('legal.privacy.recipients.title')}>
          <p>{t('legal.privacy.recipients.intro')}</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>{rich(t, 'legal.privacy.recipients.oracle')}</li>
            <li>
              {rich(
                t,
                'legal.privacy.recipients.aiPrimary',
                {},
                { name: primary.privacyName, detail: detail(ai.primary) },
              )}
            </li>
            {backups.map((id) => (
              <li key={id}>
                {rich(
                  t,
                  'legal.privacy.recipients.aiBackup',
                  {},
                  { name: AI_PROVIDERS[id].privacyName, detail: detail(id) },
                )}
              </li>
            ))}
            {ai.primary !== 'groq' && !backups.includes('groq') && (
              <li>{rich(t, 'legal.privacy.recipients.aiGroq', {}, { detail: detail('groq') })}</li>
            )}
            <li>{rich(t, 'legal.privacy.recipients.sentry')}</li>
            <li>{rich(t, 'legal.privacy.recipients.posthog', { analytics })}</li>
            <li>{rich(t, 'legal.privacy.recipients.email')}</li>
            <li>{rich(t, 'legal.privacy.recipients.expo')}</li>
          </ul>
          <p>{t('legal.privacy.recipients.images')}</p>
          <p>{t('legal.privacy.recipients.hosts')}</p>
          <p>{t('legal.privacy.recipients.stores')}</p>
        </Section>

        <Section title={t('legal.privacy.transfers.title')}>
          <p>{t('legal.privacy.transfers.p1')}</p>
        </Section>

        <Section title={t('legal.privacy.retention.title')}>
          <ul className="list-disc space-y-2 pl-5">
            <li>{rich(t, 'legal.privacy.retention.i1')}</li>
            <li>{rich(t, 'legal.privacy.retention.i2')}</li>
            <li>{rich(t, 'legal.privacy.retention.i3')}</li>
            <li>{rich(t, 'legal.privacy.retention.i4')}</li>
          </ul>
        </Section>

        <Section title={t('legal.privacy.deletion.title')}>
          <p>{rich(t, 'legal.privacy.deletion.p1')}</p>
        </Section>

        <Section title={t('legal.privacy.rights.title')}>
          <p>{t('legal.privacy.rights.intro')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('legal.privacy.rights.i1')}</li>
            <li>{t('legal.privacy.rights.i2')}</li>
            <li>{t('legal.privacy.rights.i3')}</li>
            <li>{t('legal.privacy.rights.i4')}</li>
            <li>{t('legal.privacy.rights.i5')}</li>
            <li>{t('legal.privacy.rights.i6')}</li>
            <li>{t('legal.privacy.rights.i7')}</li>
          </ul>
          <p>
            {rich(t, 'legal.privacy.rights.p1', {
              email: <Mail />,
              anspdcp: (
                <a
                  href="https://www.dataprotection.ro"
                  className={linkClass}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ANSPDCP_HOST}
                </a>
              ),
            })}
          </p>
        </Section>

        <Section title={t('legal.privacy.children.title')}>
          <p>{t('legal.privacy.children.p1')}</p>
        </Section>

        <Section id="analytics" title={t('legal.privacy.analytics.title')}>
          <p>{rich(t, 'legal.privacy.analytics.p1')}</p>
          <p>{rich(t, 'legal.privacy.analytics.p2')}</p>
          <p>{rich(t, 'legal.privacy.analytics.p3')}</p>
        </Section>

        <Section title={t('legal.privacy.security.title')}>
          <p>{t('legal.privacy.security.p1')}</p>
        </Section>

        <Section title={t('legal.privacy.changes.title')}>
          <p>{t('legal.privacy.changes.p1')}</p>
        </Section>

        <Section title={t('legal.privacy.contact.title')}>
          <p>{rich(t, 'legal.privacy.contact.p1', { email: <Mail />, support })}</p>
        </Section>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className={linkClass}>
          {t('legal.common.backToChefer')}
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className={linkClass}>
          {t('legal.common.termsOfService')}
        </Link>{' '}
        ·{' '}
        <Link href="/support" className={linkClass}>
          {t('legal.common.support')}
        </Link>
      </p>
    </main>
  );
}

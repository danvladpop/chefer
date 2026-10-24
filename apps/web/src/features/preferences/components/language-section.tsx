'use client';

import { useRouter } from 'next/navigation';
import { useLocaleSetting, useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@chefer/types';
import { Section } from './section';

type Option = SupportedLocale | 'auto';

/**
 * Language (ADR 0004). Saves on change, outside the form's Save button: the
 * page itself should switch the moment the reader picks a language they can
 * read. Each language is written in itself, so a wrong pick is reversible.
 */
export function LanguageSection() {
  const { t } = useT();
  const { choice, browserLocale, applyChoice } = useLocaleSetting();
  const router = useRouter();
  const utils = trpc.useUtils();
  const setLocale = trpc.user.setLocale.useMutation({
    onSuccess: (saved) => {
      // `me` first, so LocaleSync doesn't flip back to the stale value.
      utils.user.me.setData(undefined, (me) => (me ? { ...me, ...saved } : me));
      applyChoice(saved.locale);
      // Server components re-render in the new language.
      router.refresh();
    },
  });

  const value: Option = choice ?? 'auto';
  const onChange = (next: Option) => {
    if (next === value) return;
    setLocale.mutate({ locale: next === 'auto' ? null : next });
  };

  return (
    <Section>
      <h2 className="mb-1 text-base font-semibold">{t('settings.language.title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('settings.language.description')}</p>
      <label htmlFor="language-select" className="mb-1 block text-sm font-medium text-foreground">
        {t('settings.language.title')}
      </label>
      <select
        id="language-select"
        value={value}
        disabled={setLocale.isPending}
        aria-describedby="language-hint"
        onChange={(e) => onChange(e.target.value as Option)}
        className="min-h-11 w-full max-w-xs rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="auto">{t('settings.language.automaticWeb')}</option>
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {t(`settings.language.names.${locale}`)}
          </option>
        ))}
      </select>
      <p id="language-hint" className="mt-1 text-xs text-muted-foreground">
        {value === 'auto'
          ? t('settings.language.automaticHint', {
              language: t(`settings.language.names.${browserLocale}`),
            })
          : null}
        {setLocale.isError ? t('common.errors.generic') : null}
      </p>
    </Section>
  );
}

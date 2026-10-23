'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createTranslator, resolveLocale, type Translator } from '@chefer/i18n';
import type { SupportedLocale } from '@chefer/types';
import { setFormatLocale } from '@chefer/utils';
import { writeLocaleCookie } from './locale-cookie';

// ADR 0002: one translator for every client component. The server resolves
// the first locale (cookie → Accept-Language) and passes it in, so the
// hydration render is byte-identical to the SSR HTML.

type I18nContextValue = {
  translator: Translator;
  /** The Settings choice; null = follow the browser. */
  choice: SupportedLocale | null;
  /** The language the browser alone would pick (shown as "Same as my browser"). */
  browserLocale: SupportedLocale;
  /** Switches the UI now and remembers the choice in the cookie (not the account). */
  applyChoice: (choice: SupportedLocale | null) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialChoice,
  deviceTags,
  children,
}: {
  initialChoice: SupportedLocale | null;
  deviceTags: string[];
  children: React.ReactNode;
}) {
  const [choice, setChoice] = useState(initialChoice);
  const locale = resolveLocale({ choice, deviceTags });
  const translator = useMemo(() => createTranslator(locale, deviceTags), [locale, deviceTags]);
  // Shared formatters (@chefer/utils) follow the UI language in the browser.
  // Never on the server: that module state would be shared across requests.
  if (typeof window !== 'undefined') setFormatLocale(translator.intlTag);

  const applyChoice = useCallback(
    (next: SupportedLocale | null) => {
      writeLocaleCookie(next);
      setChoice(next);
      document.documentElement.lang = resolveLocale({ choice: next, deviceTags });
    },
    [deviceTags],
  );

  const value = useMemo(
    () => ({
      translator,
      choice,
      browserLocale: resolveLocale({ deviceTags }),
      applyChoice,
    }),
    [translator, choice, deviceTags, applyChoice],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18nContext(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useT() needs <I18nProvider> (app/layout.tsx)');
  return value;
}

/** `const { t } = useT(); t('common.actions.save')`. */
export function useT(): Translator {
  return useI18nContext().translator;
}

export function useLocaleSetting(): Omit<I18nContextValue, 'translator'> & {
  locale: SupportedLocale;
} {
  const { translator, ...rest } = useI18nContext();
  return { ...rest, locale: translator.locale };
}

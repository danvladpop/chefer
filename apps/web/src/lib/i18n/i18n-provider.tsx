'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createTranslator, resolveLocale, type Translator } from '@chefer/i18n';
import type { SupportedLocale } from '@chefer/types';
import { setFormatLocale } from '@chefer/utils';
import { writeLocaleCookie } from './locale-cookie';

// ADR 0004: one translator for every client component. The server resolves
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

// Outside <I18nProvider> (a component rendered on its own, as in unit tests)
// the UI is in English, the fallback language. The app always renders inside
// the provider (app/layout.tsx), so this never decides what a user sees.
const ENGLISH: I18nContextValue = {
  translator: createTranslator('en'),
  choice: null,
  browserLocale: 'en',
  applyChoice: () => undefined,
};

const I18nContext = createContext<I18nContextValue>(ENGLISH);

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

/** `const { t } = useT(); t('common.actions.save')`. */
export function useT(): Translator {
  return useContext(I18nContext).translator;
}

export function useLocaleSetting(): Omit<I18nContextValue, 'translator'> & {
  locale: SupportedLocale;
} {
  const { translator, ...rest } = useContext(I18nContext);
  return { ...rest, locale: translator.locale };
}

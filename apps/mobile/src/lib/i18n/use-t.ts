import { useSyncExternalStore } from 'react';
import type { Translator } from '@chefer/i18n';
import type { SupportedLocale } from '@chefer/types';
import { getLocaleChoice, getTranslator, subscribeLocale } from './locale-store';

/** `const { t } = useT(); t('common.actions.save')` — re-renders on a language change. */
export function useT(): Translator {
  return useSyncExternalStore(subscribeLocale, getTranslator);
}

/** The Settings choice (null = same as the phone). */
export function useLocaleChoice(): SupportedLocale | null {
  return useSyncExternalStore(subscribeLocale, getLocaleChoice);
}

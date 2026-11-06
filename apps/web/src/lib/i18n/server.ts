import { cookies, headers } from 'next/headers';
import { createTranslator, resolveLocale, type Translator } from '@chefer/i18n';
import type { SupportedLocale } from '@chefer/types';
import { LOCALE_COOKIE, parseAcceptLanguage, parseLocaleCookie } from './locale-cookie';

export type RequestI18n = {
  locale: SupportedLocale;
  /** The Settings choice from the cookie; null = follow the browser. */
  choice: SupportedLocale | null;
  /** The browser's languages from Accept-Language, best first. */
  deviceTags: string[];
};

/** The request's language: the choice cookie → Accept-Language → English. */
export async function getRequestI18n(): Promise<RequestI18n> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const choice = parseLocaleCookie(cookieStore.get(LOCALE_COOKIE)?.value);
  const deviceTags = parseAcceptLanguage(headerStore.get('accept-language'));
  return { locale: resolveLocale({ choice, deviceTags }), choice, deviceTags };
}

/** For server components: `const { t } = await getServerTranslator();`. */
export async function getServerTranslator(): Promise<Translator> {
  const { locale, deviceTags } = await getRequestI18n();
  return createTranslator(locale, deviceTags);
}

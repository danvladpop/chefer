import { supportedLocaleSchema, type SupportedLocale } from '@chefer/types';

// ADR 0002: the Settings language choice, mirrored into a cookie so the
// server renders the first paint (and <html lang>) in it before any tRPC
// call. Absent = follow the browser. User.locale stays the source of truth;
// LocaleSync rewrites the cookie when the account says otherwise.
export const LOCALE_COOKIE = 'chefer_locale';

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export function parseLocaleCookie(value: string | undefined): SupportedLocale | null {
  const parsed = supportedLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Client only: writes (or, for null, removes) the choice cookie. */
export function writeLocaleCookie(choice: SupportedLocale | null): void {
  document.cookie =
    choice === null
      ? `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${LOCALE_COOKIE}=${choice}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
}

/** "ro-RO,ro;q=0.9,en;q=0.8" → ["ro-RO", "ro", "en"], best first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  return (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag !== '' && entry.tag !== '*' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.tag);
}

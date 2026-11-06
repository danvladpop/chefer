import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@chefer/types';

// ─── Locale resolution (ADR 0004) ────────────────────────────────────────────
// One order everywhere: the user's explicit choice (User.locale) → the
// device or browser languages, in preference order → English.

/** "ro-RO" / "ro_RO" / "RO" → "ro"; a language we don't ship → null. */
export function matchLocale(tag: string | null | undefined): SupportedLocale | null {
  const language = (tag ?? '').trim().replace(/_/g, '-').split('-')[0]?.toLowerCase() ?? '';
  // "mo" is the retired code for Romanian as written in Moldova.
  const normalised = language === 'mo' ? 'ro' : language;
  return (SUPPORTED_LOCALES as readonly string[]).includes(normalised)
    ? (normalised as SupportedLocale)
    : null;
}

/** The first supported language in a preference-ordered list, if any. */
export function firstSupportedLocale(
  tags: readonly (string | null | undefined)[],
): SupportedLocale | null {
  for (const tag of tags) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return null;
}

export type LocaleInputs = {
  /** The explicit Settings choice; null/undefined = follow the device. */
  choice?: SupportedLocale | null | undefined;
  /** Device/browser language tags in preference order ("ro-RO", "en-GB"). */
  deviceTags?: readonly (string | null | undefined)[];
  /** A supported language already resolved elsewhere (User.deviceLocale on the server). */
  deviceLocale?: SupportedLocale | null | undefined;
};

export function resolveLocale(inputs: LocaleInputs): SupportedLocale {
  return (
    inputs.choice ??
    firstSupportedLocale(inputs.deviceTags ?? []) ??
    inputs.deviceLocale ??
    DEFAULT_LOCALE
  );
}

/**
 * Device/browser language tags, best first. Browsers expose the whole list
 * (navigator.languages); Hermes exposes the OS language through Intl.
 * No native module is involved, so this is safe in an over-the-air update.
 */
export function deviceLanguageTags(): string[] {
  const tags: string[] = [];
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } })
    .navigator;
  for (const tag of nav?.languages ?? []) tags.push(tag);
  if (typeof nav?.language === 'string') tags.push(nav.language);
  try {
    tags.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // No Intl: the list stays as the navigator gave it.
  }
  return tags.filter((t) => t.trim() !== '');
}

/**
 * The shipped language the device or browser asks for, if any — what clients
 * send as `deviceLocale` (auth.register, user.setLocale).
 */
export function deviceSupportedLocale(): SupportedLocale | null {
  return firstSupportedLocale(deviceLanguageTags());
}

/** Region-less fallbacks: English readers in Europe get day-month dates. */
const DEFAULT_INTL_TAG: Readonly<Record<SupportedLocale, string>> = {
  en: 'en-GB',
  ro: 'ro-RO',
};

/**
 * The BCP-47 tag numbers and dates are formatted with. The device's own tag
 * wins when it speaks the same language (an en-US phone keeps "Oct 22" and
 * "1,800"); otherwise the language's default (a Romanian phone set to English
 * in Chefer gets en-GB, an English phone set to Romanian gets ro-RO).
 */
export function intlTagFor(
  locale: SupportedLocale,
  deviceTags: readonly (string | null | undefined)[] = [],
): string {
  for (const tag of deviceTags) {
    if (tag && matchLocale(tag) === locale) return tag.replace(/_/g, '-');
  }
  return DEFAULT_INTL_TAG[locale];
}

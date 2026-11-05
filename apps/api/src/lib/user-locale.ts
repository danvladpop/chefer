import { resolveLocale } from '@chefer/i18n';
import { supportedLocaleSchema, type SupportedLocale } from '@chefer/types';

// ─── The language a user reads (ADR 0004) ─────────────────────────────────────
// The Settings choice (User.locale), else the language the user's device last
// reported (User.deviceLocale), else English. One rule for everything the
// server writes in the user's language: emails and recipe translations. The
// columns are plain strings, so anything unknown counts as unset.

function parse(value: string | null | undefined): SupportedLocale | null {
  const parsed = supportedLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function userLocale(user: {
  locale?: string | null;
  deviceLocale?: string | null;
}): SupportedLocale {
  return resolveLocale({ choice: parse(user.locale), deviceLocale: parse(user.deviceLocale) });
}

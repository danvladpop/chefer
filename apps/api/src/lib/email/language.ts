import { createTranslator, resolveLocale, type Translator } from '@chefer/i18n';
import { supportedLocaleSchema, type SupportedLocale } from '@chefer/types';

// ─── The language an email goes out in (ADR 0002) ─────────────────────────────
// The Settings choice, else the language the user's device last reported,
// else English. The columns are plain strings, so anything unknown is unset.

function parse(value: string | null | undefined): SupportedLocale | null {
  const parsed = supportedLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function emailTranslator(user: {
  locale?: string | null;
  deviceLocale?: string | null;
}): Translator {
  return createTranslator(
    resolveLocale({ choice: parse(user.locale), deviceLocale: parse(user.deviceLocale) }),
  );
}

import { createTranslator, type Translator } from '@chefer/i18n';
import { userLocale } from '../user-locale.js';

// ─── The language an email goes out in (ADR 0004) ─────────────────────────────
// The recipient's language (lib/user-locale.ts): the Settings choice, else the
// language their device last reported, else English.

export function emailTranslator(user: {
  locale?: string | null;
  deviceLocale?: string | null;
}): Translator {
  return createTranslator(userLocale(user));
}

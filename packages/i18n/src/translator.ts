import type { SupportedLocale } from '@chefer/types';
import { formatCurrencyAmount, formatDate, formatNumber, type DateStyle } from '@chefer/utils';
import { catalogs } from './catalog';
import { pluralCategory } from './plural';
import { intlTagFor } from './resolve';
import type { MessageKey, ParamValue, PluralMessage, TArgs } from './types';

// ─── Translator ──────────────────────────────────────────────────────────────
// `createTranslator(locale)` is the one entry point: React hooks on web and
// mobile wrap it, the API builds one per email recipient. No global state, so
// a server rendering for two users at once never mixes languages.

type Leaf = string | PluralMessage;

function lookup(catalog: unknown, key: string): Leaf | undefined {
  let node: unknown = catalog;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (node !== null && typeof node === 'object' && 'other' in node) return node as PluralMessage;
  return undefined;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export type Translator = {
  readonly locale: SupportedLocale;
  /** The BCP-47 tag numbers and dates use ("ro-RO", "en-US"). */
  readonly intlTag: string;
  /** The message for `key`, with `{placeholders}` filled in. */
  readonly t: <K extends MessageKey>(key: K, ...args: TArgs<K>) => string;
  /** A grouped number in this locale: "1,800" / "1.800". */
  readonly number: (value: number, maximumFractionDigits?: number) => string;
  /** A date in this locale: `date(d, 'short')` → "22 Oct" / "22 oct.". */
  readonly date: (value: Date | string | number, style?: DateStyle, timeZone?: string) => string;
  /** An amount already in `currency`, in this locale's style. */
  readonly currency: (
    amount: number,
    currency: Parameters<typeof formatCurrencyAmount>[1],
    decimals?: number,
  ) => string;
};

export function createTranslator(
  locale: SupportedLocale,
  deviceTags: readonly (string | null | undefined)[] = [],
): Translator {
  const intlTag = intlTagFor(locale, deviceTags);
  const number = (value: number, maximumFractionDigits = 0) =>
    formatNumber(value, { locale: intlTag, maximumFractionDigits });

  const fill = (template: string, params: Record<string, ParamValue> | undefined) =>
    template.replace(PLACEHOLDER, (whole, name: string) => {
      const value = params?.[name];
      if (value === undefined) return whole;
      return typeof value === 'number' ? number(value, 2) : value;
    });

  function t<K extends MessageKey>(key: K, ...args: TArgs<K>): string {
    const params = args[0] as Record<string, ParamValue> | undefined;
    // English is the fallback for a key a newer bundle has and an older
    // catalog lacks (never expected: the catalog check fails CI first).
    const message = lookup(catalogs[locale], key) ?? lookup(catalogs.en, key);
    if (message === undefined) return key;
    if (typeof message === 'string') return fill(message, params);
    const count = Number(params?.['count'] ?? 0);
    const form = message[pluralCategory(locale, count)] ?? message.other;
    return fill(form, params);
  }

  return {
    locale,
    intlTag,
    t,
    number,
    date: (value, style, timeZone) =>
      formatDate(value, style, {
        locale: intlTag,
        ...(timeZone === undefined ? {} : { timeZone }),
      }),
    currency: (amount, currency, decimals) =>
      formatCurrencyAmount(amount, currency, {
        locale: intlTag,
        ...(decimals === undefined ? {} : { decimals }),
      }),
  };
}

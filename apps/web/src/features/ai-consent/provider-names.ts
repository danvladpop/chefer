import type { Translator } from '@chefer/i18n';
import { AI_PROVIDERS, type AiProviderId } from '@chefer/types';

/**
 * "Groq", "Groq and Cloudflare Workers AI", "A, B and C" in the UI language.
 * `formatAiProviderNames` in @chefer/utils does the same in English only.
 */
export function aiProviderNames(ids: readonly AiProviderId[], t: Translator['t']): string {
  const names = ids.map((id) => AI_PROVIDERS[id].name);
  if (names.length <= 1) return names[0] ?? '';
  return t('legal.providers.listJoin', {
    head: names.slice(0, -1).join(', '),
    last: names[names.length - 1] ?? '',
  });
}

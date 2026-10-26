import type { MessageKey, Translator } from '@chefer/i18n';
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_DISCLOSURE,
  type AiConsentFeature,
  type AiProviderDisclosure,
} from '@chefer/types';
import { aiDisclosureProviders } from '@chefer/utils';
import { aiProviderNames } from './provider-names';

// The AI consent sheet's sentences in the UI language. The English twins in
// @chefer/utils (aiConsentIntro, aiConsentBackupLine, aiConsentToggleOn) stay
// for the API and tests; these fill the same placeholders from the `consent`
// catalog.

/** The "what gets sent" lines per action, in the order the sheet lists them. */
const FEATURE_LINES: Record<AiConsentFeature, readonly MessageKey[]> = {
  'meal-plan': [
    'consent.ai.features.meal-plan.line1',
    'consent.ai.features.meal-plan.line2',
    'consent.ai.features.meal-plan.line3',
  ],
  'meal-swap': ['consent.ai.features.meal-swap.line1', 'consent.ai.features.meal-swap.line2'],
  'meal-scan': ['consent.ai.features.meal-scan.line1'],
  'recipe-import': [
    'consent.ai.features.recipe-import.line1',
    'consent.ai.features.recipe-import.line2',
    'consent.ai.features.recipe-import.line3',
  ],
  chat: ['consent.ai.features.chat.line1', 'consent.ai.features.chat.line2'],
  'shopping-list': ['consent.ai.features.shopping-list.line1'],
  'ingredient-estimate': ['consent.ai.features.ingredient-estimate.line1'],
};

/** What the sheet lists under "What gets sent" for this action. */
export function aiConsentFeatureLines(t: Translator['t'], feature: AiConsentFeature): string[] {
  // Every key above has no placeholders, so a bare `t(key)` is exact.
  return FEATURE_LINES[feature].map((key) => (t as (k: MessageKey) => string)(key));
}

/** The sheet's opening sentence for one feature. */
export function aiConsentIntro(
  t: Translator['t'],
  feature: AiConsentFeature,
  disclosure: AiProviderDisclosure = DEFAULT_AI_PROVIDER_DISCLOSURE,
): string {
  return t('consent.ai.intro', {
    action: t(`consent.ai.features.${feature}.action`),
    primary: AI_PROVIDERS[disclosure.primary].name,
  });
}

/** The sheet's backup-provider line, or null when there is no backup. */
export function aiConsentBackupLine(
  t: Translator['t'],
  disclosure: AiProviderDisclosure = DEFAULT_AI_PROVIDER_DISCLOSURE,
): string | null {
  const backups = disclosure.backups.filter((id) => id !== disclosure.primary);
  if (backups.length === 0) return null;
  return t('consent.ai.backupProvider', {
    primaryShort: AI_PROVIDERS[disclosure.primary].shortName,
    backups: aiProviderNames(backups, t),
  });
}

/** The profile toggle's "on" description, naming every active provider. */
export function aiConsentToggleOn(
  t: Translator['t'],
  disclosure: AiProviderDisclosure = DEFAULT_AI_PROVIDER_DISCLOSURE,
): string {
  return t('consent.ai.toggleOn', {
    providers: aiProviderNames(aiDisclosureProviders(disclosure), t),
  });
}

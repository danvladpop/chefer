export { catalogs } from './catalog';
export { en } from './catalog/en';
export { pluralCategory, PLURAL_CATEGORIES, type PluralCategory } from './plural';
export {
  deviceLanguageTags,
  deviceSupportedLocale,
  firstSupportedLocale,
  intlTagFor,
  matchLocale,
  resolveLocale,
  type LocaleInputs,
} from './resolve';
export { roReviewStatus, type ReviewStatus } from './review-status';
export { createTranslator, type Translator } from './translator';
export type {
  Catalog,
  MessageKey,
  Namespace,
  ParamValue,
  ParamsFor,
  PluralMessage,
  TArgs,
} from './types';

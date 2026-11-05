# One set of typed catalogs, and a small runtime of our own, for every language Chefer ships

Chefer ships in English and Romanian (owner decision, 2026-10-22). All copy lives in one workspace package,
`@chefer/i18n`. English is the source catalog: a TypeScript object, one file per namespace. Every other language is
typed from it. Web, mobile and the API read the same catalogs through one function, `createTranslator(locale)`. We wrote
that function ourselves (about 100 lines) instead of adopting i18next, Lingui or next-intl.

We rejected the libraries for these reasons:

- **Mobile can't use them as they are.** Hermes, the mobile JavaScript engine, has no `Intl.PluralRules`. i18next (v21
  and later), Lingui and next-intl's ICU formatter all rely on it, so mobile would need the FormatJS polyfill chain
  (`intl-pluralrules`, `intl-locale` and `intl-getcanonicallocales`). The CLDR rules for English and Romanian are six
  lines (`plural.ts`).
- **One format across three runtimes.** next-intl is web-only and uses ICU messages. Pairing it with i18next on mobile
  means two message formats and catalogs that can't be shared. Lingui needs a Babel macro and an extraction step in
  both Metro and Next.
- **Typed keys and parameters come for free.** Because the catalogs are `as const` objects, `t()` accepts only real
  keys, and it requires exactly the `{placeholders}` the English message uses (`{ count }` for plurals). A missing or
  extra key in `ro` is a type error.
- **It must be safe to ship over the air.** The runtime is plain JavaScript with no native module, so it never changes
  the mobile runtime fingerprint. `expo-localization` is not in the binary, so mobile reads the phone's languages
  through React Native core: `Settings.get('AppleLanguages')` on iOS and `I18nManager` on Android, with `Intl` as the
  fallback. Hermes `Intl` alone is not enough on iOS: it reports only the localizations the app bundle declares
  (English), so a Romanian iPhone looked English (found on the simulator, 2026-10-23). Web reads `navigator.languages`
  and `Accept-Language`.

## How it works

- **Message format.** Messages use `{name}` placeholders. A plural is an object keyed by CLDR category: English writes
  `one` and `other`; Romanian writes `one`, `few` and `other` ("1 rețetă", "3 rețete", "20 de rețete"). Numbers passed as
  params are formatted for the locale.
- **Resolving the language.** The order is: `User.locale` (the explicit Settings choice; null means "same as my phone")
  → the device or browser languages → English. `User.deviceLocale` records the supported language a client last saw on
  the device, so emails reach people who never open the setting in their language. An email's language is
  `locale ?? deviceLocale ?? 'en'`.
- **Clients.**
  - Mobile keeps the choice in a module-level store, so local notifications, which are scheduled outside React, use the
    same language. The choice is persisted in `expo-sqlite/kv-store`.
  - Web resolves the first paint on the server, from the `chefer_locale` cookie and then `Accept-Language`, and passes it
    to a context provider. The hydration render therefore matches the SSR HTML.
  - On both clients, the account copy wins over the local copy (`LocaleSync` / `LocaleSyncHost`).
- **Formatting.** `setFormatLocale()` makes every existing `@chefer/utils` formatter follow the UI language on clients.
  If the device's own tag speaks that language, it is used (en-US stays en-US). Otherwise the language default is used:
  en-GB for English, ro-RO for Romanian. The server never sets it, because module state would be shared between
  requests; it formats each recipient through their own translator.
- **Guards.**
  - `catalog.test.ts` runs in CI. It checks that `ro` has every `en` key, uses the same placeholders and has complete
    plural forms. It also checks that Romanian uses ș and ț (comma below), never ş and ţ (cedilla), and „…” quotation
    marks.
  - The ESLint rule `chefer/no-hardcoded-ui-string` flags JSX text and readable attributes. It is a warning until the
    phase-4 sweep, then an error.
  - `roReviewStatus` records which namespaces a native speaker has reviewed.

## Consequences

- Translators and reviewers work on TypeScript files. That is fine for a two-language app with an owner who reviews.
  If a translation-management service is added later, a short script can export the catalogs to i18next-style JSON
  (the shapes map one to one).
- Adding a third language means:
  - a value in `SUPPORTED_LOCALES` (`@chefer/types`);
  - a catalog folder;
  - a row in `PLURAL_CATEGORIES`, which needs `plural.ts` to learn that language's CLDR rule;
  - a review-status entry.
- On iOS, a per-app language setting in the system Settings app needs `CFBundleLocalizations` in the binary. That is
  native work for the next store build (Lane C). Until then, the in-app setting is how to choose a language that
  differs from the phone's.
- Strings the server sends that the client shows verbatim stay English for now. That covers TRPCError messages and AI
  chat. Lane J phase 4 moves them to error codes and locale-aware prompts.
- **Recipe content is data, not catalog copy** (phase 3).
  - A curated recipe's name, description, steps and ingredient names in another language live in `RecipeTranslation`
    rows: one per recipe and language, AI-drafted, then reviewed.
  - The API swaps them into the DTOs a reader gets, keyed by the reader's language, and falls back to English when a
    translation is missing or stale.
  - The recipe row stays English, so nothing that matches recipes by name changes.
  - Recipes people write or import are not translated.

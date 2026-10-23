import { AppState, I18nManager, Platform, Settings } from 'react-native';
import { SQLiteStorage } from 'expo-sqlite/kv-store';
import { createTranslator, deviceLanguageTags, resolveLocale, type Translator } from '@chefer/i18n';
import { supportedLocaleSchema, type SupportedLocale } from '@chefer/types';
import { setFormatLocale } from '@chefer/utils';

// ─── The app's UI language (ADR 0004) ────────────────────────────────────────
// A module-level store rather than a React context: local notifications
// (cook timers, booking reminders, food nudges) are scheduled outside React
// and must be written in the same language as the screens.
//
// Resolution: the Settings choice → the phone's languages → English. The
// phone's languages come from React Native core (no new native module, so
// this ships over the air): iOS `Settings` reads the user's AppleLanguages
// list — Hermes `Intl` alone reports only the app bundle's localizations,
// which is English until the binary declares Romanian — and Android's
// I18nManager gives the system locale. `Intl` is the last fallback. The choice is
// kept on the phone (so the sign-in screens use it too) and on the account
// (User.locale, so web and emails follow); LocaleSyncHost reconciles the two.

const DATABASE_NAME = 'chefer-prefs.db';
const CHOICE_KEY = 'locale.choice';

let storage: SQLiteStorage | null | undefined;

/** Lazily opened; null where SQLite is unavailable (Jest), so nothing persists. */
function prefs(): SQLiteStorage | null {
  if (storage === undefined) {
    try {
      storage = new SQLiteStorage(DATABASE_NAME);
    } catch {
      storage = null;
    }
  }
  return storage;
}

function readChoice(): SupportedLocale | null {
  try {
    const parsed = supportedLocaleSchema.safeParse(prefs()?.getItemSync(CHOICE_KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeChoice(choice: SupportedLocale | null): void {
  try {
    if (choice === null) prefs()?.removeItemSync(CHOICE_KEY);
    else prefs()?.setItemSync(CHOICE_KEY, choice);
  } catch {
    // Not persisted: the account copy still restores it after the next sign-in.
  }
}

function platformLanguageTags(): string[] {
  try {
    if (Platform.OS === 'ios') {
      const languages: unknown = Settings.get('AppleLanguages');
      return Array.isArray(languages)
        ? languages.filter((l): l is string => typeof l === 'string')
        : [];
    }
    const { localeIdentifier } = I18nManager.getConstants();
    return typeof localeIdentifier === 'string' ? [localeIdentifier] : [];
  } catch {
    return [];
  }
}

/** The phone's languages, best first. */
function phoneLanguageTags(): string[] {
  return [...platformLanguageTags(), ...deviceLanguageTags()];
}

type State = {
  choice: SupportedLocale | null;
  deviceTags: string[];
  translator: Translator;
};

function build(choice: SupportedLocale | null, deviceTags: string[]): State {
  const translator = createTranslator(resolveLocale({ choice, deviceTags }), deviceTags);
  // Every shared formatter (@chefer/utils) follows the UI language.
  setFormatLocale(translator.intlTag);
  return { choice, deviceTags, translator };
}

let state: State = build(readChoice(), phoneLanguageTags());
const listeners = new Set<() => void>();

function update(next: State): void {
  if (
    next.translator.locale === state.translator.locale &&
    next.translator.intlTag === state.translator.intlTag &&
    next.choice === state.choice
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current translator — for code outside React (notification text). */
export function getTranslator(): Translator {
  return state.translator;
}

/** The Settings choice; null = same as the phone. */
export function getLocaleChoice(): SupportedLocale | null {
  return state.choice;
}

/** The language the phone alone would pick. */
export function getDeviceLocale(): SupportedLocale {
  return resolveLocale({ deviceTags: state.deviceTags });
}

/** Switches every screen now and remembers the choice on this phone. */
export function setLocaleChoice(choice: SupportedLocale | null): void {
  writeChoice(choice);
  update(build(choice, state.deviceTags));
}

/** Test seam: forget the stored choice and re-read the device languages. */
export function resetLocaleForTests(deviceTags: string[] = phoneLanguageTags()): void {
  storage = undefined;
  state = build(null, deviceTags);
  for (const listener of listeners) listener();
}

// A phone's language can change while the app sits in the background.
AppState.addEventListener('change', (status) => {
  if (status === 'active') update(build(state.choice, phoneLanguageTags()));
});

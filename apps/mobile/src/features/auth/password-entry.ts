// F8: a sign-in password the password manager filled is already saved, so only
// a TYPED one is offered to it afterwards (save-credentials.ts). AutoFill and
// Google Autofill set the whole value in one change; typing moves it one
// character at a time.
//
// The entry keeps its own copy of the text: the `value` a Controller render
// closes over lagged behind on the iOS simulator (every keystroke arrived as
// '' → n), which made typing look like a fill.

/** How the sign-in password got its current text. */
export type PasswordEntry = { kind: 'empty' | 'typed' | 'filled'; text: string };

export const EMPTY_PASSWORD_ENTRY: PasswordEntry = { kind: 'empty', text: '' };

/** The entry after the field's text changes to `next`. */
export function nextPasswordEntry(entry: PasswordEntry, next: string): PasswordEntry {
  if (next === '') return EMPTY_PASSWORD_ENTRY;
  if (Math.abs(next.length - entry.text.length) === 1) return { kind: 'typed', text: next };
  // A jump that keeps the typed text in front (a paste at the end) keeps what
  // the user did; one that replaces it (or lands in an empty field) is a fill.
  const keepsTypedText = entry.text !== '' && next.startsWith(entry.text);
  return { kind: keepsTypedText ? entry.kind : 'filled', text: next };
}

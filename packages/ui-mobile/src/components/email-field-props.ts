// Tester feedback 2026-10-04: email fields are treated like email fields — the
// email keyboard, no auto-capitalise/correct, and the OS's email autofill.
export const EMAIL_FIELD_PROPS = {
  keyboardType: 'email-address',
  autoCapitalize: 'none',
  autoCorrect: false,
  spellCheck: false,
  autoComplete: 'email',
  textContentType: 'emailAddress',
} as const;

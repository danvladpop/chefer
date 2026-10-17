// Tester feedback 2026-10-04: email fields are treated like email fields — the
// email keyboard, no auto-capitalise/correct.
// F8 (2026-10-17): every consumer is an ACCOUNT email (sign in, sign up, reset),
// so the field is tagged as the account's username, not as contact data:
// Apple's Password AutoFill pairs a new/saved password with the `username`
// field and asks for `username` + the email keyboard when the username is an
// email (docs/research/password-autofill.md). `autoComplete: 'username'` maps
// to `username` on iOS and AUTOFILL_HINT_USERNAME on Android. A non-account
// email field (e.g. inviting someone) should not use these props.
export const EMAIL_FIELD_PROPS = {
  keyboardType: 'email-address',
  autoCapitalize: 'none',
  autoCorrect: false,
  spellCheck: false,
  autoComplete: 'username',
  textContentType: 'username',
} as const;

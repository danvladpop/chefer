// UX-ACC-09 / UX-ACC-15: a one-shot, in-memory hand-off of the email the user
// just typed on one auth screen to the next (register's "already exists" →
// Sign in / Reset, forgot-password → back to Sign in). Email only — never a
// password — and never persisted (UX-ACC-17 keeps the next person's form clean).

let hint = '';

export function setEmailHint(email: string): void {
  hint = email.trim();
}

/** Returns the hint once, then forgets it. */
export function takeEmailHint(): string {
  const value = hint;
  hint = '';
  return value;
}

export function clearEmailHint(): void {
  hint = '';
}

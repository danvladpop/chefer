// T-39.1: the in-app legal screen (`app/legal/[doc].tsx`) is a real
// expo-router route, so opening it unmounts the register screen and its
// `useForm` state. This is a deliberately EPHEMERAL, in-memory (not
// SecureStore) cache of the in-progress form values — just enough to survive
// a register → legal → back round trip, never persisted to disk and cleared
// once registration succeeds.
//
// UX-ACC-17: passwords are NEVER kept here. A draft that outlived its owner
// (an abandoned sign-up, a sign-out) pre-filled the next person's form with
// the previous password; now only the non-secret fields round-trip, and the
// draft is also cleared on unmount-after-success and by `signOut()`.

import type { RegisterFormValues } from './schemas';

let draft: Partial<RegisterFormValues> | null = null;

export function getRegisterDraft(): Partial<RegisterFormValues> | null {
  return draft;
}

export function setRegisterDraft(values: Partial<RegisterFormValues>): void {
  // Destructured out on purpose: new secret fields must be opted IN, not leak by spread.
  const { password: _password, confirmPassword: _confirmPassword, ...safe } = values;
  draft = safe;
}

export function clearRegisterDraft(): void {
  draft = null;
}

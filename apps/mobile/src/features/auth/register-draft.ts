// T-39.1: the in-app legal screen (`app/legal/[doc].tsx`) is a real
// expo-router route, so opening it unmounts the register screen and its
// `useForm` state. This is a deliberately EPHEMERAL, in-memory (not
// SecureStore) cache of the in-progress form values — just enough to survive
// a register → legal → back round trip, never persisted to disk and cleared
// once registration succeeds.

import type { RegisterFormValues } from './schemas';

let draft: Partial<RegisterFormValues> | null = null;

export function getRegisterDraft(): Partial<RegisterFormValues> | null {
  return draft;
}

export function setRegisterDraft(values: Partial<RegisterFormValues>): void {
  draft = values;
}

export function clearRegisterDraft(): void {
  draft = null;
}

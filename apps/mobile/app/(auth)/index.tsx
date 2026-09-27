import { Redirect } from 'expo-router';
import { useSession } from '../../src/features/auth/use-session';

// UX-25 (T-25.1, AC1/AC2): a device that has never signed in or registered
// lands on Welcome (the value-statement first screen, CI-09) — everyone else
// goes straight to Sign in. `hasSignedInBefore` is set on the first
// successful sign-in/registration and never cleared by sign-out. By the time
// this route renders, the root layout has already resolved `ready` (it holds
// the splash frame until then), so `hasSignedInBefore` is never stale here.
export default function AuthIndex() {
  const { hasSignedInBefore } = useSession();
  return <Redirect href={hasSignedInBefore ? '/login' : '/welcome'} />;
}

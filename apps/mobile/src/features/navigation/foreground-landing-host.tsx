import { useForegroundRelanding } from './foreground-landing';

/** Renders nothing; mounts the foreground re-landing hook inside the navigator's tree. */
export function ForegroundLandingHost({ signedIn }: { signedIn: boolean }) {
  useForegroundRelanding(signedIn);
  return null;
}

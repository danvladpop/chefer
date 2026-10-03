import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { CURRENT_BUILD } from '../../lib/current-build';

// ─── What a feedback submission carries (UX-PO-05) ────────────────────────────
// The build line (`CURRENT_BUILD`: version, variant, OTA update id), the OS and
// the screen the tester was on — so "it broke" arrives with enough to reproduce
// it. All three are optional additive fields on `feedback.submit`.

export type FeedbackContext = { build: string; os: string; route: string };

/** "iOS 18.2" / "Android 14" — `Platform.Version` is a string on iOS, an API level on Android. */
export function describeOs(os: string, version: string | number): string {
  if (os === 'ios') return `iOS ${version}`;
  if (os === 'android') return `Android API ${version}`;
  return `${os} ${version}`;
}

export function buildFeedbackContext(route: string | null | undefined): FeedbackContext {
  return {
    build: CURRENT_BUILD,
    os: describeOs(Platform.OS, Platform.Version),
    route: route && route.length > 0 ? route : 'unknown',
  };
}

/**
 * The current screen, for hosts that may sit where the navigation store is
 * unavailable (the crash screen replaces the root layout): never throws.
 */
export function useFeedbackRoute(): string | null {
  try {
    // The same call on every render; a throw is constant for a given mount.
    return usePathname();
  } catch {
    return null;
  }
}

const ERROR_DRAFT_MAX = 600;

/** Pre-filled message for the error boundary's "Report this": what broke, ready to add to. */
export function errorReportDraft(error: Error): string {
  const detail = `${error.name}: ${error.message}`.replace(/\s+/g, ' ').trim();
  const clipped =
    detail.length > ERROR_DRAFT_MAX ? `${detail.slice(0, ERROR_DRAFT_MAX - 1)}…` : detail;
  return `The app showed "Something went wrong".\nError: ${clipped}\n\nWhat I was doing: `;
}

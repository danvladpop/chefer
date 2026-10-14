import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { env } from './env';

// ─── Crash reporting (M1-6) ─────────────────────────────────────────────────
// Sentry, switched on only for production builds that carry a DSN
// (EXPO_PUBLIC_SENTRY_DSN, inlined at bundle time). With no DSN, in the dev
// variant and under __DEV__, `Sentry.init` never runs and every helper below is
// a no-op — the native SDK is linked but inert. Web and API already report to
// Sentry (apps/web/src/instrumentation*.ts, apps/api/src/instrument.ts).
//
// What is sent: JS errors and native crashes, with device/OS, app version and
// the expo-updates context (OTA update id, channel, runtime — the SDK's default
// ExpoContext integration). Not sent: performance traces (no tracesSampleRate),
// session replay, screenshots, view hierarchy, IP address (sendDefaultPii
// false), and URL query strings (tRPC GET inputs) in network breadcrumbs. The
// account id (never name or email) is attached after sign-in.

export interface CrashReportingGate {
  dsn: string | undefined;
  variant: string | undefined;
  isDev: boolean;
}

/** Pure: whether this build should report to Sentry at all. */
export function shouldEnableCrashReporting({ dsn, variant, isDev }: CrashReportingGate): boolean {
  return Boolean(dsn) && variant === 'production' && !isDev;
}

/** Drops the query string, where tRPC GET batches carry their inputs. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Network breadcrumbs keep method, status and path, never the query. */
export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  const url: unknown = breadcrumb.data?.url;
  if (
    (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') &&
    typeof url === 'string'
  ) {
    return { ...breadcrumb, data: { ...breadcrumb.data, url: stripQuery(url) } };
  }
  return breadcrumb;
}

let enabled = false;

/** Call once, as early as possible (app/_layout.tsx module scope). */
export function initCrashReporting(): void {
  const variant = Constants.expoConfig?.extra?.appVariant as string | undefined;
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
  if (enabled || !shouldEnableCrashReporting({ dsn, variant, isDev: __DEV__ })) return;
  Sentry.init({
    dsn,
    // The app variant, which is also the EAS Update channel ("production").
    environment: variant,
    sendDefaultPii: false,
    // Sentry free tier: errors and crashes only. Leaving tracesSampleRate
    // unset keeps tracing (and its app-start / frames / stall integrations)
    // off; no replaysSessionSampleRate / replaysOnErrorSampleRate = no replay.
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  enabled = true;
}

/** Reports an error caught by our own code (the root error boundary). */
export function reportError(error: unknown, source: string): void {
  if (!enabled) return;
  Sentry.captureException(error, { tags: { source } });
}

/** Tags later events with the signed-in account id; `null` on sign-out. */
export function setCrashReportingUser(userId: string | null): void {
  if (!enabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

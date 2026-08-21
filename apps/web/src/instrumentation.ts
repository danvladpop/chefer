import * as Sentry from '@sentry/nextjs';

// The DSN is a public identifier (it can only ingest events, not read them),
// so it lives here as a constant rather than in the env plumbing. The auth
// token used for source-map upload IS a secret — see .env.sentry-build-plugin.
export const SENTRY_DSN =
  'https://2ceada47a5bdcadb9dd205092131920f@o4511949900611584.ingest.de.sentry.io/4511949912014928';

export function register(): void {
  if (process.env['NEXT_RUNTIME'] === 'nodejs' || process.env['NEXT_RUNTIME'] === 'edge') {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Fine at beta traffic; lower before the volume grows.
      tracesSampleRate: 1,
      enableLogs: true,
    });
  }
}

// Reports errors from nested React Server Components and route handlers.
export const onRequestError = Sentry.captureRequestError;

import * as Sentry from '@sentry/node';

// Imported before anything else in index.ts so Sentry can instrument
// http/express/prisma before they load. The DSN is a public identifier
// (ingest-only); it is not a secret.
const SENTRY_DSN =
  'https://151c2b0c7cb04cbe798f5b7f6cbac43e@o4511949900611584.ingest.de.sentry.io/4511949987774544';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env['NODE_ENV'] ?? 'development',
  // Fine at beta traffic; lower before the volume grows.
  tracesSampleRate: 1,
  enableLogs: true,
});

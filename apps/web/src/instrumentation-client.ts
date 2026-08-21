import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN } from './instrumentation';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Fine at beta traffic; lower before the volume grows.
  tracesSampleRate: 1,
  enableLogs: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

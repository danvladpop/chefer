import { pino } from 'pino';
import { env } from './env.js';

// ─── Structured logging ───────────────────────────────────────────────────────
// JSON lines in production (docker logs → grep/jq-able, requestId threaded
// through every request line); pretty-printed in development. The console.*
// calls remaining in lib/ and workers/ migrate here opportunistically.

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: null, // drop pid/hostname noise — one process, one container
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});

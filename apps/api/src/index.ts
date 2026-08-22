// Must be first — Sentry instruments http/express/prisma at require time.
import './instrument.js';
import * as Sentry from '@sentry/node';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {
  createContext,
  requestIdMiddleware,
} from './interfaces/http/middleware/auth.middleware.js';
import { asyncHandler } from './lib/async-handler.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { chatRouter } from './routers/chat.router.js';
import { appRouter } from './routers/index.js';
import { recipeImagesSseRouter } from './routers/recipe-images-sse.router.js';
import { UPLOADS_DIR, uploadsRouter } from './routers/uploads.router.js';
import { ingredientPriceWorker } from './workers/ingredient-price.worker.js';
import { recipeImageWorker } from './workers/recipe-image.worker.js';
import { weeklyPlanWorker } from './workers/weekly-plan.worker.js';

const app: express.Express = express();

// Behind a reverse proxy (Caddy/Cloudflare) in production — trust X-Forwarded-*
// so client IP and protocol are read correctly.
app.set('trust proxy', 1);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(
  helmet({
    // The API serves images (/uploads) to the web app, which is a different
    // origin in dev (3000 → 3001); the default same-origin CORP would block
    // them. CORS still governs who may actually fetch.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'x-trpc-source'],
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: process.env['npm_package_version'] ?? 'unknown',
  });
});

app.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    try {
      // Check database connectivity
      const { prisma } = await import('@chefer/database');
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'not ready', database: 'disconnected' });
    }
  }),
);

// Canonical health check used by the PRD browser tests and external monitors.
// Returns { ok: true } on success, { ok: false } with 503 when DB is unreachable.
app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    try {
      const { prisma } = await import('@chefer/database');
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, timestamp: new Date().toISOString() });
    } catch {
      res
        .status(503)
        .json({ ok: false, timestamp: new Date().toISOString(), error: 'Database unavailable' });
    }
  }),
);

// ─── SSE — Recipe Images ──────────────────────────────────────────────────────

app.use('/api/recipe-images', recipeImagesSseRouter);

// ─── Image uploads (recipe & ingredient photos) ──────────────────────────────

app.use('/api/uploads', uploadsRouter);
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));

// ─── AI chef chat (P1-4) — plain-text streaming, session-authenticated ───────

app.use('/api/chat', chatRouter);

// ─── tRPC ─────────────────────────────────────────────────────────────────────

// Blunt per-IP flood protection for the whole tRPC surface. The finer
// per-procedure limits (auth attempts, AI quotas) live in the routers.
app.use(
  '/trpc',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests — slow down.' },
    },
  }),
);

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
    onError({ error, path, ctx }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        // Expected errors (UNAUTHORIZED, NOT_FOUND, …) are product flow, not
        // defects — only unexpected failures go to Sentry.
        Sentry.captureException(error.cause ?? error, {
          tags: { trpcPath: path ?? 'unknown' },
          extra: { requestId: ctx?.requestId ?? 'unknown' },
          ...(ctx?.user && { user: { id: ctx.user.id } }),
        });
        logger.error(
          { requestId: ctx?.requestId, path, err: error.cause ?? error },
          `trpc INTERNAL_SERVER_ERROR on ${path ?? 'unknown'}`,
        );
      } else if (env.NODE_ENV === 'development') {
        logger.warn({ path, code: error.code }, error.message);
      }
    },
  }),
);

// ─── Sentry verification (dev only) ──────────────────────────────────────────

if (env.NODE_ENV === 'development') {
  app.get(
    '/api/sentry-test',
    asyncHandler(async (_req, res) => {
      const eventId = Sentry.captureException(new Error('Sentry example API error'));
      const flushed = await Sentry.flush(3000);
      res.json({ eventId, delivered: flushed });
    }),
  );
}

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

// Reports errors that reach Express (asyncHandler forwards, sync throws)
// before the JSON error response below renders them.
Sentry.setupExpressErrorHandler(app);

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'unhandled express error');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  },
);

// ─── Server Start ─────────────────────────────────────────────────────────────

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(
    {
      host: env.HOST,
      port: env.PORT,
      environment: env.NODE_ENV,
      aiMode: env.AI_MOCK_ENABLED ? 'mock' : env.AI_PROVIDER,
      emailMode: env.EMAIL_MOCK_ENABLED ? 'mock' : 'resend',
    },
    'api server listening',
  );

  if (!env.AI_MOCK_ENABLED && !env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
    logger.warn('AI_MOCK_ENABLED=false but no AI API key is set — AI calls will fail');
  }
  if (env.AI_MOCK_ENABLED && (env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY)) {
    logger.warn('AI_MOCK_ENABLED=true but an API key is also set — the mock takes precedence');
  }

  // Start the background recipe image worker
  void recipeImageWorker.start();

  // Build/refresh the ingredient price vocabulary (weekly cadence)
  ingredientPriceWorker.start();

  // Sunday pre-generation of next week's plan for premium users (PW-5)
  weeklyPlanWorker.start();
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'graceful shutdown started');

  // Stop the workers first (image worker waits for in-flight jobs)
  ingredientPriceWorker.stop();
  weeklyPlanWorker.stop();
  await recipeImageWorker.stop();

  server.close(() => {
    logger.info('http server closed');
  });

  try {
    const { prisma } = await import('@chefer/database');
    await prisma.$disconnect();
    logger.info('database disconnected');
  } catch (err) {
    logger.error({ err }, 'error disconnecting database');
  }

  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});

export { app };

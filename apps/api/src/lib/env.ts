import { z } from 'zod';
import { AI_PROVIDER_NAMES, isValidChain, parseShadowRoutes } from './ai/routing.js';
import { resolveEmailConfig, type EmailProvider } from './email/config.js';

/** An empty value (a copied .env.example line) counts as unset. */
const emptyAsUnset = (val: unknown) => (val === '' ? undefined : val);

/** Optional provider chain, e.g. "gemini>groq" — empty counts as unset. */
const aiRoute = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z
    .string()
    .refine((v) => isValidChain(v, AI_PROVIDER_NAMES), {
      message: `must be a provider chain of ${AI_PROVIDER_NAMES.join(', ')} joined by ">" (e.g. "gemini>groq")`,
    })
    .optional(),
);

const envSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Server
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  // CORS
  CORS_ORIGINS: z
    .string()
    .transform((val) => val.split(',').map((o) => o.trim()))
    .default('http://localhost:3000'),

  // Redis (optional)
  REDIS_URL: z.string().url().optional(),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  // AI — mock is enabled by default so local dev never calls real LLM endpoints
  AI_MOCK_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  AI_MOCK_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  // Model names are config, not code (audit P0-5 groundwork): swapping to a
  // newer or paid-tier model is an env change and a restart.
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_FAST_MODEL: z.string().default('gemini-2.5-flash-lite'),
  // Secondary OpenAI-compatible provider (premium_plan.md §5.5 W3-A).
  // When AI_SECONDARY_API_KEY is set (and AI_PROVIDER=gemini), the factory
  // wraps Gemini in a failover to this endpoint; unset = no failover (the
  // deploy runs "dark" until the key lands). AI_PROVIDER=openai uses this
  // client standalone. Defaults target Groq's free tier.
  AI_SECONDARY_API_KEY: z.string().optional(),
  AI_SECONDARY_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  AI_SECONDARY_MODEL: z.string().default('openai/gpt-oss-120b'),
  // Vision model at the same OpenAI-compatible endpoint, used only when a
  // photo call is routed there (AI_ROUTE_VISION). Groq's vision model:
  // https://console.groq.com/docs/vision (checked 2026-09-26).
  AI_VISION_MODEL: z.string().default('qwen/qwen3.8-27b'),
  // Per-workload provider chains (research §5.4). Unset = today's routing
  // (lib/ai/routing.ts DEFAULT_AI_ROUTES). Providers: gemini, groq (= the
  // AI_SECONDARY_* endpoint). Video extraction is Gemini-only, not routable.
  AI_ROUTE_MEAL_PLAN: aiRoute,
  AI_ROUTE_SWAP: aiRoute,
  AI_ROUTE_CHEFERIZE: aiRoute,
  AI_ROUTE_IMPORT_TEXT: aiRoute,
  AI_ROUTE_VISION: aiRoute,
  AI_ROUTE_CHAT: aiRoute,
  AI_ROUTE_REVIEW: aiRoute,
  AI_ROUTE_PRICES: aiRoute,
  AI_ROUTE_SHOPPING: aiRoute,
  // Shadow mode: "<workload>:<chain>[,…]" re-runs a sampled share of premium,
  // consented, user-initiated calls on a candidate chain in the background
  // and logs "[ai.shadow]" scores. Unset or sample 0 = off.
  AI_SHADOW_ROUTE: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z
      .string()
      .superRefine((v, ctx) => {
        try {
          parseShadowRoutes(v);
        } catch (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .optional(),
  ),
  AI_SHADOW_SAMPLE: z.coerce.number().min(0).max(1).default(0),

  // Email — mock is enabled by default so local dev never sends real mail;
  // the mock logs the message (including reset links) to the console instead.
  // EMAIL_PROVIDER (mock | resend | smtp) picks the transport; unset keeps the
  // legacy switch: EMAIL_MOCK_ENABLED=true → mock, false → Resend. See
  // lib/email/config.ts and "Sending email from Gmail" in infrastructure.md.
  EMAIL_PROVIDER: z.preprocess(emptyAsUnset, z.enum(['mock', 'resend', 'smtp']).optional()),
  EMAIL_MOCK_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  RESEND_API_KEY: z.string().optional(),
  // Unset: the SMTP_USER address for smtp, else the shared Resend sender —
  // which only delivers to the Resend account owner's inbox.
  EMAIL_FROM: z.preprocess(emptyAsUnset, z.string().optional()),
  // SMTP (EMAIL_PROVIDER=smtp). Defaults target Gmail with implicit TLS; the
  // password is a Google App Password, never the account password.
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  SMTP_USER: z.preprocess(emptyAsUnset, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyAsUnset, z.string().optional()),
  // Max emails per rolling 24h (default 400 for smtp, none otherwise). The
  // weekly emails stop 50 short of it — that headroom is kept for
  // password-reset and confirmation emails.
  EMAIL_DAILY_CAP: z.preprocess(emptyAsUnset, z.coerce.number().int().positive().optional()),
  // Base URL used in emailed links (reset password, etc.)
  APP_URL: z.string().url().default('http://localhost:3000'),
  // Signs the weekly-email unsubscribe and email-confirmation links (audit
  // P2-5). Optional: unset derives a key from JWT_SECRET, which is safe but
  // means rotating JWT_SECRET also breaks unsubscribe links already sitting
  // in inboxes — set this in production so the two rotate independently.
  // An empty value (copied .env.example) counts as unset.
  EMAIL_TOKEN_SECRET: z.preprocess(
    emptyAsUnset,
    z.string().min(32, 'EMAIL_TOKEN_SECRET must be at least 32 characters').optional(),
  ),

  // Cloudinary (optional — image generation will fail gracefully without these)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Recipe image provider (audit P0-5 groundwork). pollinations = today's
  // anonymous URL-based images; cloudflare = Workers AI text-to-image (needs
  // only CF_ACCOUNT_ID + CF_API_TOKEN), bytes stored on our own server.
  IMAGE_PROVIDER: z.enum(['pollinations', 'cloudflare']).default('pollinations'),
  CF_ACCOUNT_ID: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
  CF_IMAGE_MODEL: z.string().default('@cf/black-forest-labs/flux-1-schnell'),
  // Where generated image bytes go. local = the uploads volume, served at
  // /uploads/recipes/* like user photos; cloudinary = the optional CDN (needs
  // the three CLOUDINARY_* keys).
  IMAGE_STORAGE: z.enum(['local', 'cloudinary']).default('local'),
  // Public origin of the API, used to build stored-image URLs outside a
  // request (the image worker). Unset = APP_URL in production (single-origin
  // deploy: Caddy routes /uploads/* to the API), http://localhost:PORT in dev.
  API_PUBLIC_URL: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().url().optional(),
  ),

  // Unsplash (optional — ingredient images fall back to category images without this)
  UNSPLASH_ACCESS_KEY: z.string().optional(),
});

type EnvSchema = z.infer<typeof envSchema>;

/** The parsed env, with the email settings resolved (lib/email/config.ts). */
export type Env = Omit<EnvSchema, 'EMAIL_PROVIDER' | 'EMAIL_FROM' | 'EMAIL_DAILY_CAP'> & {
  EMAIL_PROVIDER: EmailProvider;
  EMAIL_FROM: string;
  /** Max sends per rolling 24h, or null for no cap. */
  EMAIL_DAILY_CAP: number | null;
};

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const errorMessage = Object.entries(errors)
      .map(([key, val]) => `  ${key}: ${(val ?? []).join(', ')}`)
      .join('\n');

    throw new Error(`❌ Invalid environment variables:\n${errorMessage}`);
  }

  const data = parsed.data;

  // Provider-specific key guards — fail fast so the error is obvious at startup.
  if (!data.AI_MOCK_ENABLED) {
    if (data.AI_PROVIDER === 'gemini' && !data.GEMINI_API_KEY) {
      throw new Error('❌ GEMINI_API_KEY is required when AI_PROVIDER=gemini');
    }
    if (data.AI_PROVIDER === 'openai' && !data.AI_SECONDARY_API_KEY) {
      throw new Error('❌ AI_SECONDARY_API_KEY is required when AI_PROVIDER=openai');
    }
  }

  if (data.IMAGE_PROVIDER === 'cloudflare' && (!data.CF_ACCOUNT_ID || !data.CF_API_TOKEN)) {
    throw new Error(
      '❌ CF_ACCOUNT_ID and CF_API_TOKEN are required when IMAGE_PROVIDER=cloudflare',
    );
  }

  if (
    data.IMAGE_STORAGE === 'cloudinary' &&
    (!data.CLOUDINARY_CLOUD_NAME || !data.CLOUDINARY_API_KEY || !data.CLOUDINARY_API_SECRET)
  ) {
    throw new Error('❌ CLOUDINARY_* keys are required when IMAGE_STORAGE=cloudinary');
  }

  const email = resolveEmailConfig(data);
  if (email.errors.length > 0) {
    throw new Error(`❌ ${email.errors.join('\n❌ ')}`);
  }
  // env.ts loads before the logger, so these go straight to the console.
  for (const warning of email.warnings) console.warn(`⚠️  [email] ${warning}`);

  return {
    ...data,
    EMAIL_PROVIDER: email.config.provider,
    EMAIL_FROM: email.config.from,
    EMAIL_DAILY_CAP: email.config.dailyCap,
    // Normalised (Gmail App Password spaces stripped).
    SMTP_PASS: email.config.smtp?.pass ?? data.SMTP_PASS,
  };
}

export const env = validateEnv();

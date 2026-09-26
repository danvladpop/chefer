import { z } from 'zod';

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

  // Email — mock is enabled by default so local dev never sends real mail;
  // the mock logs the message (including reset links) to the console instead.
  EMAIL_MOCK_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  RESEND_API_KEY: z.string().optional(),
  // The shared Resend sender only delivers to the account owner's inbox —
  // swap for a verified-domain address before real users need email.
  EMAIL_FROM: z.string().default('Chefer <onboarding@resend.dev>'),
  // Base URL used in emailed links (reset password, etc.)
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Cloudinary (optional — image generation will fail gracefully without these)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Recipe image provider (audit P0-5 groundwork). pollinations = today's
  // anonymous URL-based images; cloudflare = Workers AI text-to-image, bytes
  // uploaded to Cloudinary (needs CF_ACCOUNT_ID + CF_API_TOKEN).
  IMAGE_PROVIDER: z.enum(['pollinations', 'cloudflare']).default('pollinations'),
  CF_ACCOUNT_ID: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
  CF_IMAGE_MODEL: z.string().default('@cf/black-forest-labs/flux-1-schnell'),

  // Unsplash (optional — ingredient images fall back to category images without this)
  UNSPLASH_ACCESS_KEY: z.string().optional(),
});

type EnvSchema = z.infer<typeof envSchema>;

function validateEnv(): EnvSchema {
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

  if (!data.EMAIL_MOCK_ENABLED && !data.RESEND_API_KEY) {
    throw new Error('❌ RESEND_API_KEY is required when EMAIL_MOCK_ENABLED=false');
  }

  return data;
}

export const env = validateEnv();

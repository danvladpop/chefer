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
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
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

  return parsed.data;
}

export const env = validateEnv();

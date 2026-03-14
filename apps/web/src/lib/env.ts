import { z } from 'zod';

const envSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Chefer'),

  // API
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_TRPC_URL: z.string().url().default('http://localhost:3001/trpc'),

  // Auth
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
});

type EnvSchema = z.infer<typeof envSchema>;

function validateEnv(): EnvSchema {
  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_TRPC_URL: process.env.NEXT_PUBLIC_TRPC_URL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    console.error('❌ Invalid environment variables:', errors);
    throw new Error(
      `Invalid environment variables:\n${Object.entries(errors)
        .map(([key, val]) => `  ${key}: ${(val ?? []).join(', ')}`)
        .join('\n')}`,
    );
  }

  return parsed.data;
}

export const env = validateEnv();

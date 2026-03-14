import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  const isTest = process.env['NODE_ENV'] === 'test';

  return new PrismaClient({
    log: isDevelopment
      ? ['query', 'error', 'warn']
      : isTest
        ? ['error']
        : ['error'],
    errorFormat: isDevelopment ? 'pretty' : 'minimal',
  });
}

/**
 * Singleton PrismaClient instance.
 * In development, reuses the existing instance to avoid hot-reload connection leaks.
 * In production, creates a new instance.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient } from '@prisma/client';

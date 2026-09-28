import { TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';
import { describe, expect, it, vi } from 'vitest';
import { PoolExhaustedCause } from './pool-exhausted.js';
import { publicProcedure, router, type Context } from './trpc.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// T-10.4: the errorFormatter exposes the pool-exhausted cause as
// `data.poolExhausted` while the human-readable message stays unchanged.
const MESSAGE = "We don't have enough free recipes matching your restrictions.";
const testRouter = router({
  exhausted: publicProcedure.mutation(() => {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: MESSAGE,
      cause: new PoolExhaustedCause(),
    });
  }),
  other: publicProcedure.mutation(() => {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Something else.' });
  }),
});

async function call(path: 'exhausted' | 'other') {
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req: new Request(`http://localhost/trpc/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
    router: testRouter,
    createContext: () => ({}) as unknown as Context,
  });
  const body = (await res.json()) as { error: { json: unknown } };
  return superjson.deserialize<{ message: string; data: Record<string, unknown> }>(body.error);
}

describe('errorFormatter — poolExhausted (T-10.4)', () => {
  it('exposes the machine-readable cause and keeps the message', async () => {
    const error = await call('exhausted');
    expect(error.message).toBe(MESSAGE);
    expect(error.data['poolExhausted']).toEqual({ cause: 'POOL_EXHAUSTED', message: MESSAGE });
  });

  it('is null for any other PRECONDITION_FAILED', async () => {
    const error = await call('other');
    expect(error.data['poolExhausted']).toBeNull();
  });
});

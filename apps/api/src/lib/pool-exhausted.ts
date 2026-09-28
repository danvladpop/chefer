// T-10.4: machine-readable cause for "the free curated pool can't cover this
// shape + these restrictions" (`PRECONDITION_FAILED`). `trpc.ts`'s
// errorFormatter exposes it as `data.poolExhausted`; the human-readable
// message is unchanged, so clients that only read `message` keep working.
export class PoolExhaustedCause extends Error {
  constructor() {
    super('POOL_EXHAUSTED');
  }
}

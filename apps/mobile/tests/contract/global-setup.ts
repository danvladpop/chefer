const API_URL = process.env.CHEFER_API_URL ?? 'http://localhost:3001';

export default async function globalSetup(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      throw new Error(`health returned ${res.status}`);
    }
  } catch (cause) {
    throw new Error(
      `Chefer API is not reachable at ${API_URL} — contract tests need the local stack.\n` +
        `Start it with:  docker start chefer-postgres && pnpm --filter @chefer/api dev\n` +
        `(or 'pnpm dev' at the repo root for web+api together)`,
      { cause },
    );
  }
}

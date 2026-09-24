/**
 * check-exercise-videos.ts (gym_plan.md §5.5 — link-rot guard)
 *
 * oEmbed-checks every exercise's videoId in EXERCISE_CATALOG (concurrency 4).
 * Exits 1 and lists dead ids if any check fails or errors; exits 0 otherwise.
 *
 * Runs weekly via .github/workflows/gym-video-check.yml, which opens a GitHub
 * issue on failure.
 *
 * Usage: pnpm exec tsx scripts/gym/check-exercise-videos.ts
 */

import { EXERCISE_CATALOG } from '@chefer/types';

const CONCURRENCY = 4;

type Entry = { slug: string; videoId: string };

type CheckResult = Entry & {
  ok: boolean;
  status?: number;
  error?: string;
};

async function checkVideo(
  videoId: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`;
  try {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runOne(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      const item = items[idx];
      if (item === undefined) continue;
      results[idx] = await worker(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runOne()));
  return results;
}

function hasVideoId(
  entry: (typeof EXERCISE_CATALOG)[number],
): entry is (typeof EXERCISE_CATALOG)[number] & {
  videoId: string;
} {
  return entry.videoId !== null;
}

async function main(): Promise<void> {
  const entries: Entry[] = EXERCISE_CATALOG.filter(hasVideoId).map((e) => ({
    slug: e.id,
    videoId: e.videoId,
  }));
  const uniqueIds = new Set(entries.map((e) => e.videoId));

  console.log(
    `Checking ${entries.length} exercise video links (${uniqueIds.size} unique ids), concurrency ${CONCURRENCY}...\n`,
  );

  const results = await runPool(entries, CONCURRENCY, async (e): Promise<CheckResult> => {
    const r = await checkVideo(e.videoId);
    return { ...e, ...r };
  });

  for (const r of results) {
    console.log(
      `  ${r.ok ? 'ok  ' : 'DEAD'}  ${r.slug} (${r.videoId})${r.ok ? '' : ` — ${r.status ?? r.error}`}`,
    );
  }

  const dead = results.filter((r) => !r.ok);
  if (dead.length > 0) {
    console.error(`\n${dead.length} dead video link(s):`);
    for (const d of dead) {
      console.error(`  - ${d.slug}: ${d.videoId} (${d.status ?? d.error ?? 'unknown error'})`);
    }
    process.exit(1);
  }

  console.log(`\nAll ${entries.length} video links are alive.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

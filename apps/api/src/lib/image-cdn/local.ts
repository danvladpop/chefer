import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageStorageError } from '../image-gen/errors.js';
import { sniffImageMime } from '../image-sniff.js';

// ─── Local image store (our own server) ───────────────────────────────────────
// Generated recipe images live on the same persistent volume as user uploads
// (`uploads` → /app/uploads in docker-compose.deploy.yml) and are served by the
// same `express.static('/uploads')` route (index.ts; Caddy forwards /uploads/*
// to the API). No third-party CDN account is needed. Env-free on purpose so it
// is unit-testable and importable from scripts.

/** Root of every stored image — the `uploads` volume in production. */
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

/** Public route prefix the API serves UPLOADS_DIR under. */
export const UPLOADS_ROUTE = '/uploads';

/** Sub-folder for AI-generated recipe images (keeps them apart from user uploads). */
export const GENERATED_RECIPES_SUBDIR = 'recipes';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export interface LocalImageStoreConfig {
  /** Directory the files are written under (UPLOADS_DIR in the app). */
  dir: string;
  /** Public origin the API is reachable at, e.g. https://chefer.duckdns.org. */
  publicBaseUrl: string;
}

/**
 * The public origin stored image URLs are built from. The upload endpoint
 * builds its URLs from the request host; the image worker has no request, so
 * it needs a configured origin:
 * - `API_PUBLIC_URL` when set;
 * - otherwise, in production, `APP_URL` — the deployment is single-origin
 *   (Caddy routes /uploads/* to the API), so the app URL serves the images;
 * - otherwise (local dev) the API's own http://localhost:<PORT>.
 */
export function resolveMediaBaseUrl(opts: {
  apiPublicUrl?: string | undefined;
  nodeEnv: string;
  appUrl: string;
  port: number;
}): string {
  const base =
    opts.apiPublicUrl ??
    (opts.nodeEnv === 'production' ? opts.appUrl : `http://localhost:${opts.port}`);
  return base.replace(/\/+$/, '');
}

/** Recipe ids are server-minted, but never let one steer the path. */
function safeKey(key: string): string {
  const cleaned = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return cleaned || 'image';
}

/**
 * Returns an upload function with the same signature as the Cloudinary one:
 * base64 bytes in, public URL out. The file name carries a content hash, so a
 * regenerated image gets a new URL (the route is served `immutable`, a reused
 * name would keep the stale image cached for 30 days) and an identical
 * re-upload is a harmless overwrite.
 */
export function createLocalImageStore(
  config: LocalImageStoreConfig,
): (base64Image: string, mimeType: string, recipeId: string) => Promise<string> {
  return async (base64Image, _mimeType, recipeId) => {
    const bytes = Buffer.from(base64Image, 'base64');
    // Trust the bytes, not the provider's label (same rule as user uploads).
    const mime = sniffImageMime(bytes);
    const ext = mime ? EXT_BY_MIME[mime] : undefined;
    if (!ext) {
      throw new ImageStorageError(
        `Generated image for recipe ${recipeId} is not a recognised image type`,
      );
    }
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const filename = `${safeKey(recipeId)}-${hash}.${ext}`;
    const dir = path.join(config.dir, GENERATED_RECIPES_SUBDIR);
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), bytes);
    } catch (err) {
      throw new ImageStorageError(
        `Could not write ${path.join(dir, filename)}: ${(err as Error).message}`,
        { cause: err },
      );
    }
    return `${config.publicBaseUrl}${UPLOADS_ROUTE}/${GENERATED_RECIPES_SUBDIR}/${filename}`;
  };
}

/**
 * Checks that generated images can be written under `dir`/recipes (creates
 * the folder, writes and removes a probe file). Returns null when writable,
 * else the reason. Run by the recipe-image worker at startup so a
 * root-owned/read-only uploads volume is reported loudly BEFORE any image is
 * paid for.
 */
export async function probeLocalImageStore(dir: string): Promise<string | null> {
  const target = path.join(dir, GENERATED_RECIPES_SUBDIR);
  const probe = path.join(target, `.write-probe-${process.pid}`);
  try {
    await mkdir(target, { recursive: true });
    await writeFile(probe, '');
    await rm(probe, { force: true });
    return null;
  } catch (err) {
    return `${target} is not writable: ${(err as Error).message}`;
  }
}

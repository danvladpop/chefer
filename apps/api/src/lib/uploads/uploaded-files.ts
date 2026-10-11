import { rm } from 'node:fs/promises';
import path from 'node:path';
import { uploadReferenceRepository, type IUploadReferenceRepository } from '@chefer/database';
import { GENERATED_RECIPES_SUBDIR, UPLOADS_DIR } from '../image-cdn/local.js';
import { logger } from '../logger.js';

// ─── User-uploaded image files ────────────────────────────────────────────────
// POST /api/uploads/image writes `<uuid>.<ext>` into UPLOADS_DIR and returns
// `<origin>/uploads/<file>`; recipes, custom ingredients and the avatar store
// that URL. Account deletion (backlog P0-6) removes the files the account's
// rows point at, so "delete my account" also erases the photos — but only
// files NO OTHER row still references (Phase 1 guardrails: a copied friend's
// recipe shares the author's image URL, and deleting the author used to
// delete the copy's photo too). The orphan sweeper uses the same check.

// One definition, shared with generated recipe images (lib/image-cdn/local.ts).
export { UPLOADS_DIR };

const UPLOADED_FILE = /\/uploads\/([0-9a-f-]{36}\.(?:jpg|png|webp|gif|avif))$/;

/**
 * Any file the uploads volume serves that the sweeper may manage: a user
 * upload in the root, or a generated recipe image under recipes/. The vendored
 * ingredient thumbnails (/uploads/ingredients, a separate static dir) never
 * match — they are not in the volume.
 */
const MANAGED_FILE = new RegExp(
  `^/uploads/((?:${GENERATED_RECIPES_SUBDIR}/)?[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp|gif|avif))$`,
);

function pathnameOf(url: string): string | null {
  try {
    // A relative "/uploads/x.jpg" parses against the dummy base.
    return new URL(url, 'http://relative.invalid').pathname;
  } catch {
    return null;
  }
}

/**
 * The stored file name when `url` (absolute, or a relative `/uploads/<file>`)
 * points at one of our uploads, else null.
 */
export function uploadedFileName(url: string | null | undefined): string | null {
  if (!url) return null;
  const pathname = pathnameOf(url);
  return pathname ? (UPLOADED_FILE.exec(pathname)?.[1] ?? null) : null;
}

/**
 * The path relative to UPLOADS_DIR (`<file>` or `recipes/<file>`) when `url`
 * points into the uploads volume, else null. Origin-agnostic: the same file is
 * reachable from the API host, the app host or a relative URL.
 */
export function uploadsRelativePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const pathname = pathnameOf(url);
  return pathname ? (MANAGED_FILE.exec(pathname)?.[1] ?? null) : null;
}

/**
 * Of the uploads-relative `paths`, the ones some row still references.
 * Without `paths`, every referenced path (the sweeper's full scan).
 */
export async function referencedUploadPaths(
  references: Pick<IUploadReferenceRepository, 'findUploadUrls'>,
  paths?: string[],
): Promise<Set<string>> {
  const urls = await references.findUploadUrls(paths?.map((p) => `/uploads/${p}`));
  const found = new Set<string>();
  for (const url of urls) {
    const rel = uploadsRelativePath(url);
    if (rel) found.add(rel);
  }
  return found;
}

/**
 * Best-effort delete of the uploaded files behind `urls` (others are ignored)
 * that no remaining row references. Never throws: a missing file or a disk
 * error must not undo an account deletion that already committed — and when
 * the reference check itself fails, nothing is deleted (a stray file is
 * harmless; the sweeper retries). Returns how many files are now gone.
 */
export async function deleteUploadedFiles(
  urls: (string | null | undefined)[],
  dir: string = UPLOADS_DIR,
  references: Pick<IUploadReferenceRepository, 'findUploadUrls'> = uploadReferenceRepository,
): Promise<number> {
  const names = [...new Set(urls.map(uploadedFileName).filter((n): n is string => n !== null))];
  if (names.length === 0) return 0;

  let stillUsed: Set<string>;
  try {
    stillUsed = await referencedUploadPaths(references, names);
  } catch (err) {
    logger.warn({ err, files: names.length }, 'uploads: reference check failed, nothing deleted');
    return 0;
  }

  let removed = 0;
  for (const name of names) {
    if (stillUsed.has(name)) continue;
    try {
      await rm(path.join(dir, name), { force: true });
      removed += 1;
    } catch (err) {
      logger.warn({ err, file: name }, 'uploads: could not delete file');
    }
  }
  if (stillUsed.size > 0) {
    logger.info({ kept: stillUsed.size }, 'uploads: kept files another row still references');
  }
  return removed;
}

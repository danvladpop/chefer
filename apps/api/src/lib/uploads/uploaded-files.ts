import { rm } from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS_DIR } from '../image-cdn/local.js';
import { logger } from '../logger.js';

// ─── User-uploaded image files ────────────────────────────────────────────────
// POST /api/uploads/image writes `<uuid>.<ext>` into UPLOADS_DIR and returns
// `<origin>/uploads/<file>`; recipes, custom ingredients and the avatar store
// that URL. Account deletion (backlog P0-6) removes the files the account's
// rows point at, so "delete my account" also erases the photos.

// One definition, shared with generated recipe images (lib/image-cdn/local.ts).
export { UPLOADS_DIR };

const UPLOADED_FILE = /\/uploads\/([0-9a-f-]{36}\.(?:jpg|png|webp|gif|avif))$/;

/** The stored file name when `url` points at one of our uploads, else null. */
export function uploadedFileName(url: string | null | undefined): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return UPLOADED_FILE.exec(pathname)?.[1] ?? null;
}

/**
 * Best-effort delete of the uploaded files behind `urls` (others are ignored).
 * Never throws: a missing file or a disk error must not undo an account
 * deletion that already committed. Returns how many files are now gone.
 */
export async function deleteUploadedFiles(
  urls: (string | null | undefined)[],
  dir: string = UPLOADS_DIR,
): Promise<number> {
  const names = [...new Set(urls.map(uploadedFileName).filter((n): n is string => n !== null))];
  let removed = 0;
  for (const name of names) {
    try {
      await rm(path.join(dir, name), { force: true });
      removed += 1;
    } catch (err) {
      logger.warn({ err, file: name }, 'uploads: could not delete file');
    }
  }
  return removed;
}

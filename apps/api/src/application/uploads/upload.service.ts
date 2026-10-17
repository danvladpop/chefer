import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadedFileRepository, type IUploadedFileRepository } from '@chefer/database';
import { UPLOAD_LIMITS, type UserProfile } from '@chefer/types';
import { isPremiumUser, uploadStorageQuotaBytes } from '../../lib/entitlements.js';
import { sniffImageMime } from '../../lib/image-sniff.js';
import {
  ImageProcessingError,
  processUploadedImage,
  type ProcessedImage,
} from '../../lib/uploads/process-image.js';
import { UPLOADS_DIR } from '../../lib/uploads/uploaded-files.js';

// ─── Photo uploads (POST /api/uploads/image) ──────────────────────────────────
// The router authenticates and reads the (≤ 5 MB) body; this service decides
// whether the photo is stored. In order: the declared type must be an image
// type we take and the bytes must really be it; sharp normalises the photo
// (lib/uploads/process-image.ts); the uploads ledger reserves it against the
// user's daily cap and storage quota in one transaction; only then is the
// file written. A failed write refunds the reservation.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The upload content types the endpoint accepts (sniffed, then re-encoded as JPEG). */
export const ACCEPTED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export const DAILY_UPLOAD_LIMIT_MESSAGE = 'Daily upload limit reached — try again tomorrow';

function mb(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
    : `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function storageFullMessage(user: UserProfile): string {
  const quota = mb(uploadStorageQuotaBytes(user));
  return isPremiumUser(user)
    ? `You've used your ${quota} of photo storage. Delete recipes or ingredients whose photos you no longer need — the space frees up within a day.`
    : `You've used your ${quota} of photo storage. Delete recipes or ingredients whose photos you no longer need, or upgrade to Premium for ${mb(UPLOAD_LIMITS.storageBytes.premium)}.`;
}

/** A refusal the router answers as `{ error: message }` with `status`. */
export class UploadRejectedError extends Error {
  constructor(
    readonly status: 400 | 403 | 415 | 429,
    message: string,
  ) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

export interface StoredUpload {
  fileName: string;
  bytes: number;
}

export interface UploadServiceDeps {
  files: Pick<IUploadedFileRepository, 'reserve' | 'deleteById'>;
  dir: string;
  now: () => Date;
}

export class UploadService {
  private readonly deps: UploadServiceDeps;

  constructor(deps: Partial<UploadServiceDeps> = {}) {
    this.deps = {
      files: uploadedFileRepository,
      dir: UPLOADS_DIR,
      now: () => new Date(),
      ...deps,
    };
  }

  async storeImage(user: UserProfile, mime: string, body: Buffer): Promise<StoredUpload> {
    if (!ACCEPTED_UPLOAD_MIME.has(mime)) {
      throw new UploadRejectedError(415, `Unsupported image type: ${mime || 'unknown'}`);
    }
    if (body.length === 0) throw new UploadRejectedError(400, 'Empty upload body');
    // The bytes must really be the declared image type.
    if (sniffImageMime(body) !== mime) {
      throw new UploadRejectedError(415, 'The file is not a valid image of that type');
    }

    let processed: ProcessedImage;
    try {
      processed = await processUploadedImage(body);
    } catch (err) {
      if (err instanceof ImageProcessingError) throw new UploadRejectedError(415, err.message);
      throw err;
    }

    const fileName = `${randomUUID()}.${processed.ext}`;
    const reservation = await this.deps.files.reserve(
      { userId: user.id, fileName, mime: processed.mime, bytes: processed.bytes.length },
      {
        since: new Date(this.deps.now().getTime() - DAY_MS),
        maxPerWindow: UPLOAD_LIMITS.uploadsPerDay,
        maxTotalBytes: uploadStorageQuotaBytes(user),
      },
    );
    if (!reservation.ok) {
      throw reservation.reason === 'DAILY_LIMIT'
        ? new UploadRejectedError(429, DAILY_UPLOAD_LIMIT_MESSAGE)
        : new UploadRejectedError(403, storageFullMessage(user));
    }

    const target = path.join(this.deps.dir, fileName);
    try {
      await mkdir(this.deps.dir, { recursive: true });
      await writeFile(target, processed.bytes);
    } catch (err) {
      await rm(target, { force: true }).catch(() => undefined);
      await this.deps.files.deleteById(reservation.file.id);
      throw err;
    }
    return { fileName, bytes: processed.bytes.length };
  }
}

export const uploadService = new UploadService();

import type { UploadedFile } from '@prisma/client';
import { prisma } from '../client';

// ─── Uploaded photos ledger (Phase 1 guardrails) ──────────────────────────────
// One row per file POST /api/uploads/image stored. The daily upload cap and
// the per-user storage quota are counted from these rows (they used to be an
// in-memory counter that a restart reset). `reserve` checks both and inserts
// the row in ONE serializable transaction, so parallel uploads cannot all
// pass the check before any of them is recorded (same mechanics as the AI
// quotas in apps/api/src/lib/quotas.ts).

export interface UploadLimits {
  /** Start of the rolling window the daily cap counts from. */
  since: Date;
  /** Uploads allowed since `since`. */
  maxPerWindow: number;
  /** Total stored bytes allowed, all time. */
  maxTotalBytes: number;
}

export type UploadReservation =
  | { ok: true; file: UploadedFile }
  | { ok: false; reason: 'DAILY_LIMIT' | 'STORAGE_LIMIT'; usedBytes: number };

export interface CreateUploadedFileData {
  userId: string;
  fileName: string;
  mime: string;
  bytes: number;
}

export interface IUploadedFileRepository {
  /** Checks the daily cap and the storage quota, then records the file — atomically. */
  reserve(data: CreateUploadedFileData, limits: UploadLimits): Promise<UploadReservation>;
  /** Undoes a reservation whose file could not be written. */
  deleteById(id: string): Promise<void>;
  /** Stored bytes and uploads since `since`, for one user. */
  usage(userId: string, since: Date): Promise<{ uploads: number; totalBytes: number }>;
  /** Every file name the user uploaded (account deletion). */
  fileNamesForUser(userId: string): Promise<string[]>;
  /** Every ledger row's file name (the sweeper reconciles them against the disk). */
  allFileNames(): Promise<string[]>;
  deleteByFileNames(fileNames: string[]): Promise<number>;
}

const RESERVE_ATTEMPTS = 5;

function isSerializationConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
}

export class UploadedFileRepository implements IUploadedFileRepository {
  async reserve(data: CreateUploadedFileData, limits: UploadLimits): Promise<UploadReservation> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx): Promise<UploadReservation> => {
            const [recent, total] = await Promise.all([
              tx.uploadedFile.count({
                where: { userId: data.userId, createdAt: { gte: limits.since } },
              }),
              tx.uploadedFile.aggregate({
                where: { userId: data.userId },
                _sum: { bytes: true },
              }),
            ]);
            const usedBytes = total._sum.bytes ?? 0;
            if (recent >= limits.maxPerWindow) {
              return { ok: false, reason: 'DAILY_LIMIT', usedBytes };
            }
            if (usedBytes + data.bytes > limits.maxTotalBytes) {
              return { ok: false, reason: 'STORAGE_LIMIT', usedBytes };
            }
            const file = await tx.uploadedFile.create({ data });
            return { ok: true, file };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (err) {
        if (!isSerializationConflict(err) || attempt >= RESERVE_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 20));
      }
    }
  }

  async deleteById(id: string): Promise<void> {
    await prisma.uploadedFile.deleteMany({ where: { id } });
  }

  async usage(userId: string, since: Date): Promise<{ uploads: number; totalBytes: number }> {
    const [uploads, total] = await Promise.all([
      prisma.uploadedFile.count({ where: { userId, createdAt: { gte: since } } }),
      prisma.uploadedFile.aggregate({ where: { userId }, _sum: { bytes: true } }),
    ]);
    return { uploads, totalBytes: total._sum.bytes ?? 0 };
  }

  async fileNamesForUser(userId: string): Promise<string[]> {
    const rows = await prisma.uploadedFile.findMany({
      where: { userId },
      select: { fileName: true },
    });
    return rows.map((r) => r.fileName);
  }

  async allFileNames(): Promise<string[]> {
    const rows = await prisma.uploadedFile.findMany({ select: { fileName: true } });
    return rows.map((r) => r.fileName);
  }

  async deleteByFileNames(fileNames: string[]): Promise<number> {
    if (fileNames.length === 0) return 0;
    const { count } = await prisma.uploadedFile.deleteMany({
      where: { fileName: { in: fileNames } },
    });
    return count;
  }
}

export const uploadedFileRepository = new UploadedFileRepository();

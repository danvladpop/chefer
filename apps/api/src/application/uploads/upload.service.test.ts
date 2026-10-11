import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateUploadedFileData, UploadLimits, UploadReservation } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { UploadRejectedError, UploadService } from './upload.service.js';

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const MB = 1024 * 1024;

const user = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1',
  email: 'u1@example.com',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
  ...over,
});

let dir: string;
const newReserve = () =>
  vi.fn<[CreateUploadedFileData, UploadLimits], Promise<UploadReservation>>(async () =>
    okReservation(),
  );
const newDeleteById = () => vi.fn<[string], Promise<void>>(async () => undefined);
let reserve: ReturnType<typeof newReserve>;
let deleteById: ReturnType<typeof newDeleteById>;
let service: UploadService;
const NOW = new Date('2026-10-11T12:00:00Z');

function okReservation(): UploadReservation {
  return {
    ok: true,
    file: {
      id: 'row1',
      userId: 'u1',
      fileName: 'x.jpg',
      mime: 'image/jpeg',
      bytes: 1,
      createdAt: NOW,
    },
  };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'chefer-upload-svc-'));
  reserve = newReserve();
  deleteById = newDeleteById();
  service = new UploadService({ files: { reserve, deleteById }, dir, now: () => NOW });
});

async function photo(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2e86de' } })
    .png()
    .toBuffer();
}

describe('UploadService.storeImage (Phase 1 guardrails)', () => {
  it('resizes, re-encodes as JPEG and records the FINAL byte size against the quotas', async () => {
    const input = await photo(4000, 3000);
    const stored = await service.storeImage(user(), 'image/png', input);

    expect(stored.fileName).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    const written = path.join(dir, stored.fileName);
    const meta = await sharp(written).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 810]);
    expect((await stat(written)).size).toBe(stored.bytes);

    const [data, limits] = reserve.mock.calls[0] ?? [];
    expect(data).toEqual({
      userId: 'u1',
      fileName: stored.fileName,
      mime: 'image/jpeg',
      bytes: stored.bytes,
    });
    // Rolling 24 h window, 60 a day, free = 200 MB.
    expect(limits).toEqual({
      since: new Date('2026-10-10T12:00:00Z'),
      maxPerWindow: 60,
      maxTotalBytes: 200 * MB,
    });
  });

  it('gives premium (and admins) a 1 GB storage quota', async () => {
    await service.storeImage(user({ planTier: 'PREMIUM' }), 'image/png', await photo(10, 10));
    await service.storeImage(user({ role: 'ADMIN' }), 'image/png', await photo(10, 10));
    expect(reserve.mock.calls.map((c) => c[1].maxTotalBytes)).toEqual([1024 * MB, 1024 * MB]);
  });

  it('refuses with 403 and a clear sentence when the storage quota is full — nothing is written', async () => {
    reserve.mockResolvedValue({ ok: false, reason: 'STORAGE_LIMIT', usedBytes: 200 * MB });
    const err = await service
      .storeImage(user(), 'image/png', await photo(10, 10))
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UploadRejectedError);
    expect((err as UploadRejectedError).status).toBe(403);
    expect((err as UploadRejectedError).message).toContain('200 MB of photo storage');
    expect((err as UploadRejectedError).message).toContain('upgrade to Premium for 1 GB');
    expect(await readdir(dir)).toEqual([]);
  });

  it('does not pitch an upgrade to premium users at their quota', async () => {
    reserve.mockResolvedValue({ ok: false, reason: 'STORAGE_LIMIT', usedBytes: 1024 * MB });
    const err = (await service
      .storeImage(user({ planTier: 'PREMIUM' }), 'image/png', await photo(10, 10))
      .catch((e: unknown) => e)) as UploadRejectedError;
    expect(err.message).toContain('1 GB of photo storage');
    expect(err.message).not.toContain('upgrade');
  });

  it('refuses with 429 at the daily cap (DB-backed, survives restarts)', async () => {
    reserve.mockResolvedValue({ ok: false, reason: 'DAILY_LIMIT', usedBytes: 0 });
    await expect(
      service.storeImage(user(), 'image/png', await photo(10, 10)),
    ).rejects.toMatchObject({ status: 429 });
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a type it does not take, and bytes that are not the declared type (415)', async () => {
    await expect(
      service.storeImage(user(), 'image/svg+xml', Buffer.from('<svg/>')),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      service.storeImage(user(), 'image/jpeg', await photo(10, 10)), // PNG bytes
    ).rejects.toMatchObject({ status: 415 });
    expect(reserve).not.toHaveBeenCalled();
  });

  it('refuses an empty body (400)', async () => {
    await expect(service.storeImage(user(), 'image/png', Buffer.alloc(0))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refunds the reservation when the file cannot be written', async () => {
    const broken = new UploadService({
      files: { reserve, deleteById },
      dir: path.join(dir, 'missing\0dir'),
      now: () => NOW,
    });
    await expect(broken.storeImage(user(), 'image/png', await photo(10, 10))).rejects.toThrow();
    expect(deleteById).toHaveBeenCalledWith('row1');
  });
});

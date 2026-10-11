import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  deleteUploadedFiles,
  referencedUploadPaths,
  uploadedFileName,
  uploadsRelativePath,
} from './uploaded-files.js';

vi.mock('../logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

/** A reference repository that reports `urls` as still stored somewhere. */
const refs = (urls: string[] = []) => ({
  findUploadUrls: vi.fn(async (fragments?: string[]) =>
    fragments ? urls.filter((u) => fragments.some((f) => u.includes(f))) : urls,
  ),
});

const FILE = '0b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a6b.jpg';

describe('uploadedFileName', () => {
  it('extracts our upload file name from its public URL', () => {
    expect(uploadedFileName(`https://chefer.duckdns.org/uploads/${FILE}`)).toBe(FILE);
    expect(uploadedFileName(`http://localhost:3001/uploads/${FILE}`)).toBe(FILE);
  });

  it('ignores external images, other paths and junk', () => {
    expect(uploadedFileName('https://images.unsplash.com/photo-1.jpg')).toBeNull();
    expect(uploadedFileName('https://image.pollinations.ai/prompt/soup')).toBeNull();
    expect(uploadedFileName('https://x.dev/uploads/../../etc/passwd')).toBeNull();
    expect(uploadedFileName('https://x.dev/uploads/not-a-uuid.jpg')).toBeNull();
    expect(uploadedFileName('not a url')).toBeNull();
    expect(uploadedFileName(null)).toBeNull();
  });
});

describe('deleteUploadedFiles', () => {
  it('removes only the referenced uploads and tolerates missing files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'chefer-uploads-'));
    const keep = '1b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a6b.png';
    await writeFile(path.join(dir, FILE), 'x');
    await writeFile(path.join(dir, keep), 'x');

    const removed = await deleteUploadedFiles(
      [
        `https://chefer.duckdns.org/uploads/${FILE}`,
        `https://chefer.duckdns.org/uploads/${FILE}`, // duplicate
        'https://chefer.duckdns.org/uploads/2b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a6b.jpg', // missing
        'https://images.unsplash.com/photo-1.jpg',
        null,
      ],
      dir,
      refs(),
    );

    expect(removed).toBe(2);
    expect(await readdir(dir)).toEqual([keep]);
  });

  it('keeps a file another row still references — a friend copied the recipe (shared-photo bug)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'chefer-uploads-'));
    const shared = '3b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a6b.jpg';
    const own = '4b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a6b.jpg';
    await writeFile(path.join(dir, shared), 'x');
    await writeFile(path.join(dir, own), 'x');
    // The copy stores the same URL, on another host spelling even.
    const references = refs([`http://localhost:3001/uploads/${shared}`]);

    const removed = await deleteUploadedFiles(
      [`https://chefer.duckdns.org/uploads/${shared}`, `https://chefer.duckdns.org/uploads/${own}`],
      dir,
      references,
    );

    expect(removed).toBe(1);
    expect(await readdir(dir)).toEqual([shared]);
    expect(references.findUploadUrls).toHaveBeenCalledWith([
      `/uploads/${shared}`,
      `/uploads/${own}`,
    ]);
  });

  it('deletes nothing when the reference check fails', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'chefer-uploads-'));
    await writeFile(path.join(dir, FILE), 'x');
    const broken = { findUploadUrls: vi.fn(async () => Promise.reject(new Error('db down'))) };

    const removed = await deleteUploadedFiles([`https://x.dev/uploads/${FILE}`], dir, broken);

    expect(removed).toBe(0);
    expect(await readdir(dir)).toEqual([FILE]);
  });

  it('accepts relative /uploads/<file> URLs (the uploads ledger)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'chefer-uploads-'));
    await writeFile(path.join(dir, FILE), 'x');
    expect(await deleteUploadedFiles([`/uploads/${FILE}`], dir, refs())).toBe(1);
  });
});

describe('uploadsRelativePath', () => {
  it('maps user uploads and generated recipe images to their path in the volume', () => {
    expect(uploadsRelativePath(`https://chefer.duckdns.org/uploads/${FILE}`)).toBe(FILE);
    expect(uploadsRelativePath('https://x.dev/uploads/recipes/cm1abc-0123456789ab.webp')).toBe(
      'recipes/cm1abc-0123456789ab.webp',
    );
    expect(uploadsRelativePath(`/uploads/${FILE}`)).toBe(FILE);
  });

  it('ignores vendored ingredient thumbnails, traversal and external images', () => {
    expect(uploadsRelativePath('https://x.dev/uploads/ingredients/egg.webp?v=abc')).toBeNull();
    expect(uploadsRelativePath('https://x.dev/uploads/../../etc/passwd')).toBeNull();
    expect(uploadsRelativePath('https://images.unsplash.com/photo-1.jpg')).toBeNull();
    expect(uploadsRelativePath(null)).toBeNull();
  });

  it('referencedUploadPaths collects the paths of every stored URL', async () => {
    const found = await referencedUploadPaths(
      refs([`https://a.dev/uploads/${FILE}`, 'https://a.dev/uploads/recipes/r1-abc.png', 'x']),
    );
    expect([...found].sort()).toEqual([FILE, 'recipes/r1-abc.png']);
  });
});

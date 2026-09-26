import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { deleteUploadedFiles, uploadedFileName } from './uploaded-files.js';

vi.mock('../logger.js', () => ({ logger: { warn: vi.fn() } }));

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
    );

    expect(removed).toBe(2);
    expect(await readdir(dir)).toEqual([keep]);
  });
});

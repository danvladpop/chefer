import { describe, expect, it } from 'vitest';
import { sniffImageMime } from './image-sniff.js';

const bytes = (...b: number[]) => Buffer.from(b);

describe('sniffImageMime', () => {
  it('recognises the supported image signatures', () => {
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(sniffImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffImageMime(Buffer.from('GIF89a....', 'latin1'))).toBe('image/gif');
    expect(sniffImageMime(Buffer.from('\0\0\0\x1cftypavif', 'latin1'))).toBe('image/avif');
  });

  it('rejects anything else, including an SVG or HTML payload labelled as an image', () => {
    expect(sniffImageMime(Buffer.from('<svg onload="alert(1)"/>'))).toBeNull();
    expect(sniffImageMime(Buffer.from('<html><script>'))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});

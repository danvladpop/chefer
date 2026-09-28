// Minimal WebP RIFF header parser — no image library dependency needed just
// to assert pixel dimensions (T-05.11 AC30: every vendored photo is 600×400).
// Handles both the simple lossy payload ("VP8 ", what `cwebp -q` produces)
// and the lossless payload ("VP8L"); throws on anything else (or a truncated
// buffer) rather than guessing.

export interface WebpDimensions {
  width: number;
  height: number;
}

export function webpDimensions(buf: Buffer): WebpDimensions {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('Not a WebP file (missing RIFF/WEBP header)');
  }
  const fourCC = buf.toString('ascii', 12, 16);

  if (fourCC === 'VP8 ') {
    // Lossy: 3-byte frame tag, then a 3-byte start code (0x9d 0x01 0x2a) at
    // offset 23, then width/height as little-endian 16-bit values where the
    // low 14 bits are the dimension (top 2 bits are an unused scale factor).
    const start = 20;
    if (buf[start + 3] !== 0x9d || buf[start + 4] !== 0x01 || buf[start + 5] !== 0x2a) {
      throw new Error('Unrecognized VP8 bitstream (bad start code)');
    }
    const width = buf.readUInt16LE(start + 6) & 0x3fff;
    const height = buf.readUInt16LE(start + 8) & 0x3fff;
    return { width, height };
  }

  if (fourCC === 'VP8L') {
    const start = 20; // skip 'VP8L' chunk header (4) + chunk size (4), from offset 12
    if (buf[start] !== 0x2f) {
      throw new Error('Unrecognized VP8L bitstream (bad signature byte)');
    }
    const bits = buf.readUInt32LE(start + 1);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  throw new Error(`Unsupported WebP payload "${fourCC}" (expected VP8 or VP8L)`);
}

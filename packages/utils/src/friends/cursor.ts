// Opaque keyset cursors: base64url("<ISO date>|<id>"). Tampered, truncated or
// foreign input decodes to null (the caller treats that as a bad cursor), never
// throws. Hand-rolled base64url: Buffer/atob availability differs between
// Node and Hermes, and the payload is pure ASCII.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const B64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function sextet(n: number): string {
  return ALPHABET.charAt(n & 63);
}

function toBase64Url(ascii: string): string {
  let out = '';
  for (let i = 0; i < ascii.length; i += 3) {
    const a = ascii.charCodeAt(i);
    const b = i + 1 < ascii.length ? ascii.charCodeAt(i + 1) : 0;
    const c = i + 2 < ascii.length ? ascii.charCodeAt(i + 2) : 0;
    const n = (a << 16) | (b << 8) | c;
    out += sextet(n >> 18) + sextet(n >> 12);
    if (i + 1 < ascii.length) out += sextet(n >> 6);
    if (i + 2 < ascii.length) out += sextet(n);
  }
  return out;
}

function fromBase64Url(text: string): string | null {
  if (!B64URL_PATTERN.test(text) || text.length % 4 === 1) return null;
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    buffer = (buffer << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

export function encodeCursor(date: Date, id: string): string {
  return toBase64Url(`${date.toISOString()}|${id}`);
}

export function decodeCursor(cursor: string): { date: Date; id: string } | null {
  const raw = fromBase64Url(cursor);
  if (raw === null) return null;
  const sep = raw.indexOf('|');
  if (sep < 0) return null;
  const iso = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!ID_PATTERN.test(id)) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== iso) return null;
  return { date, id };
}

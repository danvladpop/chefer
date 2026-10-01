import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  const date = new Date('2026-09-30T12:34:56.789Z');

  it('round-trips a date and an id', () => {
    const cursor = encodeCursor(date, 'cseedcarol000000000000001');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeCursor(cursor);
    expect(decoded?.id).toBe('cseedcarol000000000000001');
    expect(decoded?.date.getTime()).toBe(date.getTime());
  });

  it('matches Node base64url for the same payload', () => {
    const payload = `${date.toISOString()}|abc_123-XYZ`;
    expect(encodeCursor(date, 'abc_123-XYZ')).toBe(Buffer.from(payload).toString('base64url'));
  });

  it('decodes tampered or foreign input to null', () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('!!!')).toBeNull();
    expect(decodeCursor('not a cursor')).toBeNull();
    expect(decodeCursor('A')).toBeNull(); // impossible base64 length
    expect(decodeCursor(b64('no separator here'))).toBeNull();
    expect(decodeCursor(b64('not-a-date|abc'))).toBeNull();
    expect(decodeCursor(b64('2026-13-40T00:00:00.000Z|abc'))).toBeNull(); // not a real date
    expect(decodeCursor(b64('2026-09-30|abc'))).toBeNull(); // not the canonical ISO form
    expect(decodeCursor(b64(`${date.toISOString()}|`))).toBeNull(); // empty id
    expect(decodeCursor(b64(`${date.toISOString()}|a b`))).toBeNull(); // id with a space
    expect(decodeCursor(b64(`${date.toISOString()}|'; DROP TABLE`))).toBeNull();
    expect(decodeCursor(b64(`${date.toISOString()}|${'x'.repeat(65)}`))).toBeNull();
  });

  it('decodes a cursor truncated into its date to null', () => {
    const cursor = encodeCursor(date, 'abc');
    for (const cut of [1, 5, 10, 20]) {
      expect(decodeCursor(cursor.slice(0, cut))).toBeNull();
    }
  });

  it('is never thrown on by arbitrary strings', () => {
    for (const s of ['%', '\u0000', '💥', 'a'.repeat(5000), '=', '==', 'a=b']) {
      expect(() => decodeCursor(s)).not.toThrow();
    }
  });
});

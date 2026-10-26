import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv } from './csv';

describe('escapeCsvField', () => {
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('two\nlines')).toBe('"two\nlines"');
  });

  it('neutralises spreadsheet formulas but leaves negative numbers alone', () => {
    expect(escapeCsvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvField('@cmd')).toBe("'@cmd");
    expect(escapeCsvField('-2.5')).toBe('-2.5');
  });
});

describe('toCsv', () => {
  it('joins a header and rows with CRLF; empty cells for null, yes/no for booleans', () => {
    expect(
      toCsv(
        ['A', 'B', 'C'],
        [
          [1, null, true],
          ['x', undefined, false],
        ],
      ),
    ).toBe('A,B,C\r\n1,,yes\r\nx,,no');
  });
});

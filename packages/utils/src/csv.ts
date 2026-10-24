// ─── CSV writing (gym CSV export, full data export — G1) ──────────────────────
// One escaping rule for every CSV Chefer hands out, so a spreadsheet opens
// each of them the same way.

export type CsvCell = string | number | boolean | null | undefined;

/**
 * RFC 4180 escaping (quote a field containing a comma, quote or newline),
 * plus formula neutralising: a text field starting with = + - @ is prefixed
 * with ' so spreadsheets don't execute it (audit F-GYM-11-4). Plain numbers
 * are left alone.
 */
export function escapeCsvField(raw: string): string {
  const value = /^[=+\-@]/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellText(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'boolean') return cell ? 'yes' : 'no';
  return String(cell);
}

/** A header row plus data rows as one CRLF-separated CSV document. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows]
    .map((row) => row.map((cell) => escapeCsvField(cellText(cell))).join(','))
    .join('\r\n');
}

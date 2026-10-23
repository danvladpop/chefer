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

// ─── CSV reading (workout import — G2) ────────────────────────────────────────
// Strong writes `;` (Android, and every export since 2019) or `,` (older iOS);
// Hevy writes `,`. Fields may be quoted, contain the delimiter, `""` escapes and
// line breaks (Hevy exercise notes). A leading UTF-8 BOM is dropped.

/** `;` when the header line has more semicolons than commas outside quotes, else `,`. */
export function sniffCsvDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

/** Rows of fields (RFC 4180). Blank lines are dropped; a field's quotes are removed. */
export function parseCsv(
  input: string,
  delimiter: ',' | ';' = sniffCsvDelimiter(input),
): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

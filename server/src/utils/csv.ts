/** RFC 4180 compatible CSV parsing and serialization (no external dependency). */

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  errors: string[];
}

function detectDelimiter(sample: string): ',' | ';' | '\t' {
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  const counts: Record<string, number> = {
    ',': (firstLine.match(/,/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? (best[0] as ',' | ';' | '\t') : ',';
}

export function parseCsv(input: string, delimiter?: ',' | ';' | '\t'): CsvParseResult {
  const errors: string[] = [];
  const delim = delimiter ?? detectDelimiter(input);
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  if (input.charCodeAt(0) === 0xfeff) i = 1; // strip BOM

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delim) {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // ignore; handled by \n
    } else {
      field += ch;
    }
  }
  if (inQuotes) errors.push('Unterminated quoted field at end of file');
  if (field !== '' || row.length > 0) pushRow();

  if (rows.length === 0) {
    return { headers: [], rows: [], errors: [...errors, 'The file is empty'] };
  }
  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1), errors };
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\r\n') + '\r\n';
}

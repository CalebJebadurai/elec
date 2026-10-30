// Minimal RFC 4180 CSV reader for the TCPD dumps (.csv or .csv.gz).
import { readFileSync } from 'node:fs';

export type Row = Record<string, string>;

export function readCsv(path: string): Row[] {
  let buf: Uint8Array = readFileSync(path);
  if (path.endsWith('.gz')) buf = Bun.gunzipSync(buf);
  const text = new TextDecoder().decode(buf);
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length).map((r) => {
    const o: Row = {};
    header.forEach((h, j) => (o[h] = r[j]));
    return o;
  });
}

export const num = (s: string | undefined) => (s === undefined || s === '' ? NaN : Number(s));

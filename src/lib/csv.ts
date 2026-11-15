// Reading a channel's export.
//
// Every platform hands out a different CSV — different delimiters, different
// date formats, different names for the same column, and in Europe a decimal
// comma. These are the pieces that cope with that, shared by the earnings
// import and the payout reconciliation so that a file which parses for one
// parses identically for the other.

export function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM if present
  const cleaned = text.replace(/^﻿/, '').trim();
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delim = tabs >= semis && tabs >= commas ? '\t' : semis > commas ? ';' : ',';

  function splitLine(line: string): string[] {
    if (delim === '\t') return line.split('\t').map(s => s.trim().replace(/^"|"$/g, ''));
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
        fields.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = splitLine(lines[0]).map(h =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  );

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });
}

export function parseMoney(s: string): number {
  if (!s) return 0;
  // Strip currency symbols, letters, whitespace — keep digits, period, comma, minus
  let v = s.replace(/[^0-9.,-]/g, '').trim();
  if (!v) return 0;
  // European format: period as thousands sep, comma as decimal (e.g. 1.234,56)
  if (/\d\.\d{3},\d{1,2}$/.test(v)) {
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    // US/standard: remove thousand commas
    v = v.replace(/,/g, '');
  }
  const n = parseFloat(v);
  return isNaN(n) ? 0 : Math.abs(n);
}

export function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== '') return row[c];
  }
  return '';
}

export function normalizeDate(s: string): string {
  if (!s) return '';
  s = s.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D/YYYY or MM/DD/YYYY
  const slash4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash4) return `${slash4[3]}-${slash4[1].padStart(2, '0')}-${slash4[2].padStart(2, '0')}`;
  // M/D/YY — VRBO exports 2-digit year, e.g. "5/16/25"
  const slash2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (slash2) {
    const yr = parseInt(slash2[3]);
    const fullYear = yr <= 49 ? 2000 + yr : 1900 + yr;
    return `${fullYear}-${slash2[1].padStart(2, '0')}-${slash2[2].padStart(2, '0')}`;
  }
  // YYYY-MM-DDThh:mm:ss… — ISO with time component
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}


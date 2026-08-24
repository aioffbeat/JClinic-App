// GENERATED — DO NOT EDIT.
// Copied verbatim from the JClinic web app: apps/web/src/lib/datetime.ts
// Edit it THERE, then run: node scripts/sync-api-client.mjs
// CI runs this with --check, so an edit made here alone will fail the build.

// Indian date display. The clinic reads dates day-first as DD/MM/YYYY — never US MM/DD/YYYY or
// ISO YYYY-MM-DD. This is a FORMAT-only helper: it does not shift the day across timezones.
//
// `dmy` is a drop-in for the old bare-ISO slicing idiom that used to render a raw YYYY-MM-DD date.
// Given an ISO-like string it reformats the date portion by pure string surgery — no `Date`
// parsing — so an evening-UTC timestamp keeps the exact same calendar day it showed before, just
// written DD/MM/YYYY. Only non-ISO inputs fall back to Date + en-GB (still day-first).
//
// Machine values that feed <input type="date"> or CSV filenames must stay YYYY-MM-DD — do NOT run
// them through this; keep using toISOString().slice(0, 10) there.

/** DD/MM/YYYY. Accepts an ISO string, a Date, or null/'' (→ ''). No timezone shift for ISO input. */
export function dmy(v?: string | number | Date | null): string {
  if (v == null || v === '') return '';
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime())
    ? s.slice(0, 10)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

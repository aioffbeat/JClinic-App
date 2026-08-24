// GENERATED — DO NOT EDIT.
// Copied verbatim from the JClinic web app: apps/web/src/due-test-ui.ts
// Edit it THERE, then run: node scripts/sync-api-client.mjs
// CI runs this with --check, so an edit made here alone will fail the build.

import { DueStatus, DueTest } from './api';

import { dmy } from './lib/datetime';
/**
 * ONE vocabulary for "is this test late", shared by every surface that renders a DueTest.
 *
 * The counts themselves already come from a single engine (biomarkers/due-tests.ts) so they can
 * never disagree; this file does the same job for how those counts are *worded and coloured*.
 * Lifted out of Biomarkers.tsx when the Encounter Progress tab became a second reader.
 */
export const STATUS_META: Record<DueStatus, { label: string; cls: string }> = {
  never: { label: 'Never done', cls: 'flag-crit' },
  overdue: { label: 'Overdue', cls: 'flag-crit' },
  due: { label: 'Due today', cls: 'flag-warn' },
  upcoming: { label: 'Upcoming', cls: '' },
};

export const isLate = (d: DueTest) => d.status === 'overdue' || d.status === 'never';
export const dayStr = (v?: string | null) => (v ? dmy(v) : '—');

/**
 * How often a test has to be repeated, bucketed for the doctor.
 *
 * Bucketed on the NUMERIC `intervalDays`, never on `DueTest.frequency` — that field is the
 * panel author's free-text label and is full of ranges ("Every 1-3 months", "1-2 wks (G4-5)/
 * monthly (G3)/3 mo (G1-2)"), so it cannot be sorted or compared.
 *
 * The names describe what the seeded panels actually hold. Across all 219 markers the real
 * intervals are {14, 21, 28, 30, 56, 60, 84, 90, 180} days — there is no weekly test in the
 * data, so the fastest bucket is honestly labelled fortnightly rather than "weekly".
 */
export interface Cadence { id: string; label: string; maxDays: number }
export const CADENCE_BUCKETS: Cadence[] = [
  { id: 'fortnightly', label: 'Every 2 weeks', maxDays: 21 },
  { id: 'monthly', label: 'Monthly', maxDays: 45 },
  { id: 'quarterly', label: 'Quarterly', maxDays: 120 },
  { id: 'halfyearly', label: 'Half-yearly', maxDays: Infinity },
];

/** Never null: the last bucket is open-ended, and the engine skips markers with no interval. */
export const bucketOf = (d: DueTest): Cadence =>
  CADENCE_BUCKETS.find((b) => d.intervalDays <= b.maxDays) ?? CADENCE_BUCKETS[CADENCE_BUCKETS.length - 1];

/** Split a due list into its cadence groups, dropping empty ones so no blank headings render. */
export function groupByCadence(due: DueTest[]): { cadence: Cadence; tests: DueTest[]; late: number }[] {
  return CADENCE_BUCKETS.map((cadence) => {
    const tests = due.filter((d) => bucketOf(d).id === cadence.id);
    return { cadence, tests, late: tests.filter(isLate).length };
  }).filter((g) => g.tests.length > 0);
}

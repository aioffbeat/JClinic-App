// GENERATED — DO NOT EDIT.
// Copied verbatim from the JClinic web app: apps/web/src/amendments.ts
// Edit it THERE, then run: node scripts/sync-api-client.mjs
// CI runs this with --check, so an edit made here alone will fail the build.

import { Amendment } from './api';

/**
 * Turning an audit row into a sentence a clinician can read.
 *
 * Pure and client-side, deliberately: the API returns the raw before/after so the trail stays
 * queryable and machine-readable, and prose is a display concern. Sibling of encounter-gaps.ts,
 * which does the same for the completeness checklist.
 */

export const ACTION_LABEL: Record<string, string> = {
  'encounter.amend.note': 'SOAP note',
  'encounter.amend.ayurveda': 'Ayurveda assessment',
  'encounter.amend.diet_plan': 'Diet & lifestyle plan',
  'encounter.amend.vital_add': 'Vitals added',
  'encounter.amend.vital_edit': 'Vital corrected',
  'encounter.amend.vital_delete': 'Vital removed',
  'encounter.amend.diagnosis_add': 'Diagnosis added',
  'encounter.amend.diagnosis_edit': 'Diagnosis corrected',
  'encounter.amend.diagnosis_delete': 'Diagnosis removed',
  'encounter.amend.attachment_add': 'File attached',
  'encounter.amend.attachment_edit': 'File details corrected',
  'encounter.amend.attachment_delete': 'File removed',
  'encounter.complete': 'Visit concluded',
  'encounter.reopen': 'Visit reopened',
};

const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));

/** The fields of a SOAP note / assessment that actually moved, so a reader is not handed two
 *  paragraphs and asked to diff them by eye. */
function movedFields(before: any, after: any): string[] {
  if (!before || !after || typeof before !== 'object') return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)].filter((k) => k !== 'reason'));
  return [...keys].filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

/** One line describing what changed. Never throws on an unexpected shape — an unreadable trail
 *  entry is still better than a page that crashes on it. */
export function describeAmendment(a: Amendment): string {
  const b = a.before ?? {};
  const f = a.after ?? {};
  switch (a.action) {
    case 'encounter.amend.vital_edit':
      return `${s(b.code)} ${s(b.valueNum ?? b.valueText)}${b.unit ? ` ${b.unit}` : ''} → ${s(f.valueNum ?? f.valueText)}${f.unit ? ` ${f.unit}` : ''}`;
    case 'encounter.amend.vital_delete':
      return `${s(b.code)} ${s(b.valueNum ?? b.valueText)}${b.unit ? ` ${b.unit}` : ''} removed`;
    case 'encounter.amend.vital_add':
      return `${(f.items ?? []).map((i: any) => `${i.code} ${i.valueNum ?? i.valueText}`).join(', ') || 'vitals added'}`;
    case 'encounter.amend.diagnosis_edit':
      return `${s(b.description)} → ${s(f.description)}`;
    case 'encounter.amend.diagnosis_delete':
      return `${s(b.description)} removed`;
    case 'encounter.amend.diagnosis_add':
      return s(f.description);
    case 'encounter.amend.attachment_add':
      return `${s(f.caption || f.fileName)}${f.category ? ` (${String(f.category).replace(/_/g, ' ')})` : ''}`;
    case 'encounter.amend.attachment_delete':
      return `${s(b.caption || b.fileName)} removed`;   // the "why" comes from amendReason()
    case 'encounter.amend.attachment_edit':
      return `${s(b.caption || b.fileName)} → ${s(f.caption || f.fileName)}`;
    case 'encounter.amend.note':
    case 'encounter.amend.ayurveda':
    case 'encounter.amend.diet_plan': {
      const moved = movedFields(b, f);
      return moved.length ? `changed: ${moved.join(', ')}` : 'content changed';
    }
    case 'encounter.complete':
      return `${s(f.reason)}${Array.isArray(f.gaps) && f.gaps.length ? ` · ${f.gaps.length} section(s) missing` : ''}`;
    case 'encounter.reopen':
      return 'conclusion removed';
    default:
      return '';
  }
}

/** The clinician's own words for why, when they gave any. */
export const amendReason = (a: Amendment): string | null => (a.after as any)?.reason ?? null;

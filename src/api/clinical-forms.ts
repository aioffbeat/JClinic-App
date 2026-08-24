// GENERATED — DO NOT EDIT.
// Copied verbatim from the JClinic web app: apps/web/src/clinical-forms.ts
// Edit it THERE, then run: node scripts/sync-api-client.mjs
// CI runs this with --check, so an edit made here alone will fail the build.

/**
 * Client-side mirror of apps/api/src/emr/clinical-forms.ts, for LIVE feedback on the disease intake
 * questionnaires. If the two files disagree, the server wins and THIS file is the one that is wrong.
 */

export type FieldType = 'select' | 'multiselect' | 'text' | 'number' | 'date' | 'boolean' | 'severity';

export interface ShowIf {
  field: string;
  equals?: unknown;
  includes?: unknown;
}

export interface FormField {
  key: string;
  type: FieldType;
  label: string;
  hint?: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  showIf?: ShowIf;
}

export interface FormSchema {
  fields: FormField[];
}

export const SEVERITY_OPTIONS = ['mild', 'moderate', 'severe'] as const;

/** Is a field visible given the current answers? A malformed predicate resolves to VISIBLE. */
export function evalShowIf(showIf: ShowIf | undefined | null, answers: Record<string, unknown>): boolean {
  if (!showIf || !showIf.field) return true;
  const v = answers[showIf.field];
  if (showIf.equals !== undefined) return v === showIf.equals;
  if (showIf.includes !== undefined) return Array.isArray(v) && (v as unknown[]).includes(showIf.includes);
  return true;
}

/** Non-empty FOR ITS TYPE — a blank string or empty array is not an answer. */
export function fieldAnswered(field: FormField, v: unknown): boolean {
  switch (field.type) {
    case 'multiselect':
      return Array.isArray(v) && v.length > 0;
    case 'boolean':
      return typeof v === 'boolean';
    case 'number':
      return typeof v === 'number' && !Number.isNaN(v);
    default: // select | text | date | severity
      return typeof v === 'string' && v.trim().length > 0;
  }
}

/** Every VISIBLE required field answered. No fields / no template = complete. */
export function answersComplete(schema: FormSchema | null | undefined, answers: Record<string, unknown> | null | undefined): boolean {
  const fields = schema?.fields ?? [];
  const a = answers ?? {};
  for (const f of fields) {
    if (!f.required) continue;
    if (!evalShowIf(f.showIf, a)) continue;
    if (!fieldAnswered(f, a[f.key])) return false;
  }
  return true;
}

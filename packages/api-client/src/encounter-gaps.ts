// GENERATED — DO NOT EDIT.
// Copied verbatim from the JClinic web app: apps/web/src/encounter-gaps.ts
// Edit it THERE, then run: node scripts/sync-api-client.mjs
// CI runs this with --check, so an edit made here alone will fail the build.

/**
 * Client-side mirror of the encounter completeness rule, for LIVE feedback only.
 *
 * The authoritative definition lives in apps/api/src/emr/encounter-completeness.ts — the server
 * recomputes gaps from the database on GET /encounters/:id and again inside POST /:id/complete,
 * and every decision (what escalates, whether a conclusion is allowed) uses the server's answer.
 * This copy is deliberately dumb: booleans over page state so the checklist can update between
 * saves without a refetch. If the two files disagree, the server wins and THIS file is wrong.
 */

export type GapKey =
  | 'note' | 'diagnosis' | 'vitals' | 'prescription'
  | 'ayurveda' | 'diet' | 'tests' | 'files' | 'meds'
  | 'history' | 'plan'
  | 'unreviewed_clone';

export const GAP_LABELS: Record<GapKey, string> = {
  note: 'SOAP note',
  diagnosis: 'Diagnosis',
  vitals: 'Vitals',
  prescription: 'Prescription',
  ayurveda: 'Ayurveda assessment',
  diet: 'Diet & lifestyle',
  tests: 'Tests',
  files: 'Files',
  meds: 'Current medication',
  history: 'History',
  plan: 'Treatment plan',
  unreviewed_clone: 'Copied from last visit — not reviewed',
};

/** Mirrors REQUIRED_BY_TYPE on the API — pre-cutover visits only. */
export const REQUIRED_BY_TYPE: Record<string, GapKey[]> = {
  op_consult: ['note', 'diagnosis', 'vitals', 'prescription'],
  wellness: ['note', 'vitals'],
  panchkarma: ['note', 'vitals'],
};

/** Mirrors STRICT_REQUIRED — every section except Progress, in the order the tabs are worked. */
export const STRICT_REQUIRED: GapKey[] = [
  'vitals', 'ayurveda', 'note', 'diagnosis', 'tests', 'files', 'meds', 'diet', 'prescription',
];
/** Mirrors STRICT_FROM. Visits started before it keep the old four-section rule AND free tab
 *  navigation — sequencing and the mandatory sections turn on together. */
export const STRICT_FROM = new Date('2026-08-12T12:45:00+05:30');

/** Mirrors STRICT_REQUIRED_V2 — the diagnosis-first order, with History and Treatment plan.
 *  LIVE since 12:45 IST 14 Aug 2026; the API constant is authoritative and the two move together. */
export const STRICT_REQUIRED_V2: GapKey[] = [
  'vitals', 'ayurveda', 'diagnosis', 'history', 'note', 'plan', 'tests', 'files', 'meds', 'diet', 'prescription',
];
export const STRICT_V2_FROM = new Date('2026-08-14T12:45:00+05:30');

export const isStrict = (startedAt: string | null | undefined): boolean =>
  !!startedAt && new Date(startedAt) >= STRICT_FROM;
export const isStrictV2 = (startedAt: string | null | undefined): boolean =>
  !!startedAt && new Date(startedAt) >= STRICT_V2_FROM;

export const requiredFor = (type: string | null | undefined, startedAt?: string | null): GapKey[] => {
  if (isStrictV2(startedAt)) return STRICT_REQUIRED_V2;
  if (isStrict(startedAt)) return STRICT_REQUIRED;
  return REQUIRED_BY_TYPE[(type ?? 'op_consult').trim()] ?? REQUIRED_BY_TYPE.op_consult;
};

export const TYPE_LABELS: Record<string, string> = {
  op_consult: 'OP consult',
  wellness: 'wellness visit',
  panchkarma: 'panchkarma session',
};

/** Mirrors ENDED_REASONS on the API. */
export const ENDED_REASONS = [
  ['complete', 'Fully documented'],
  ['no_prescription_needed', 'No prescription needed'],
  ['review_visit_only', 'Review visit only'],
  ['referred_out', 'Referred out'],
  ['patient_left', 'Patient left before the consultation finished'],
  ['other', 'Other (explain)'],
] as const;

/**
 * The only reason that still concludes a strict visit with sections outstanding. Everything else
 * must actually be filled in — see completeVisit() on the API for why this one survives.
 */
export const STRICT_ESCAPE = 'patient_left' as const;

export interface LiveState {
  type: string | null | undefined;
  startedAt?: string | null;
  /** the SAVED note — never the textarea contents, or the checklist goes green over unsaved text */
  savedSoap: { subjective: string; objective: string; assessment: string; plan: string } | null;
  diagnosisCount: number;
  vitalsCount: number;
  /** prescription ITEM count — a prescription row always exists (created on page mount) */
  rxItemCount: number;
  /** SAVED Ayurveda, for the same reason as savedSoap. Content, never presence — the autosave
   *  writes a full row of blank strings, so "a row exists" is true for every visit ever opened. */
  savedAyu: { prakritiType: string; agni: string } | null;
  /** SAVED diet fields; any one carrying real text counts, as does a generated chart. */
  savedDiet: { apathyaHistory: string; apathyaFuture: string; dinExisting: string; dinChanges: string; yogasana: string; lifestyle: string } | null;
  hasDietChart: boolean;
  testCount: number;
  /** Routine markers due for this patient's disease that are not yet advised on this visit. While
   *  this is non-zero the Tests section stays open and the "nothing to record" tick cannot clear
   *  it — mirrors GapInput.routineDueUnordered on the API, which is authoritative. */
  routineDue: number;
  fileCount: number;
  currentMedCount: number;
  ackNoTests: boolean;
  ackNoFiles: boolean;
  ackNoMeds: boolean;
  clonedFromId: string | null | undefined;
  endedAt: string | null | undefined;
  /** --- V2 (diagnosis-first; read only when the visit is under STRICT_REQUIRED_V2) --- */
  /** The SAVED history grades + "nothing new" tick — never the live form state. */
  savedHistory?: { energy: string; generalCondition: string; sleep: string; ackNoComplaints: boolean } | null;
  complaintCount?: number;
  /** Every active disease's required intake answered (mirror of diseaseIntakeComplete, computed by
   *  the History pane from the SAVED answers via answersComplete()). */
  diseaseIntakeComplete?: boolean;
  patientHistoryDone?: boolean;
  activeDiseaseCount?: number;
  stagedThisVisitCount?: number;
  /** The SAVED plan — outlook + advised modalities with their detail lists. */
  savedPlan?: {
    prognosis: string;
    ackNoTreatment: boolean;
    adviseMedication: boolean; medicationDurationDays: number | null;
    adviseYoga: boolean; yogaCount: number;
    adviseExercise: boolean; exerciseCount: number;
    advisePanchkarma: boolean; panchkarmaCount: number;
  } | null;
}

const filled = (v: string | null | undefined) => (v ?? '').trim().length >= 2;

export function liveGaps(s: LiveState): GapKey[] {
  const req = requiredFor(s.type, s.startedAt);
  const v2 = req === STRICT_REQUIRED_V2;
  const gaps: GapKey[] = [];
  const need = (k: GapKey, ok: boolean) => { if (req.includes(k) && !ok) gaps.push(k); };

  const noteOk =
    !!s.savedSoap &&
    ([s.savedSoap.subjective, s.savedSoap.objective, s.savedSoap.assessment, s.savedSoap.plan] as string[])
      .every((v) => filled(v));
  const dietOk =
    s.hasDietChart ||
    (!!s.savedDiet && Object.values(s.savedDiet).some((v) => filled(v)));

  // V2 mirrors of the API's diagnosisFilled/historyFilled/planFilled — content, never presence.
  const diagnosisOk = v2
    ? s.diagnosisCount > 0 && (s.activeDiseaseCount ?? 0) > 0 && (s.stagedThisVisitCount ?? 0) >= (s.activeDiseaseCount ?? 0)
    : s.diagnosisCount > 0;
  const h = s.savedHistory;
  const historyOk =
    !!h && filled(h.energy) && filled(h.generalCondition) && filled(h.sleep) &&
    ((s.complaintCount ?? 0) > 0 || h.ackNoComplaints) &&
    (s.diseaseIntakeComplete ?? false) &&
    (s.patientHistoryDone ?? false);
  const p = s.savedPlan;
  const planOk =
    !!p && filled(p.prognosis) &&
    (p.ackNoTreatment ||
      (p.adviseMedication && (p.medicationDurationDays ?? 0) > 0) ||
      (p.adviseYoga && p.yogaCount > 0) ||
      (p.adviseExercise && p.exerciseCount > 0) ||
      (p.advisePanchkarma && p.panchkarmaCount > 0));

  need('vitals', s.vitalsCount > 0);
  need('ayurveda', !!s.savedAyu && filled(s.savedAyu.prakritiType) && filled(s.savedAyu.agni));
  need('diagnosis', diagnosisOk);
  need('history', historyOk);
  need('note', noteOk);
  need('plan', planOk);
  // A due routine test cannot be cleared by the tick — see the API's version of this rule.
  need('tests', s.routineDue === 0 && (s.testCount > 0 || s.ackNoTests));
  need('files', s.fileCount > 0 || s.ackNoFiles);
  need('meds', s.currentMedCount > 0 || s.ackNoMeds);
  need('diet', dietOk);
  need('prescription', s.rxItemCount > 0);

  if (s.clonedFromId && !s.endedAt) gaps.push('unreviewed_clone');
  return gaps;
}

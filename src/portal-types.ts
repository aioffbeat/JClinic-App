/**
 * Types for the portal responses the shared client leaves as `any`.
 *
 * These are transcribed from what `apps/api/src/portal/portal.service.ts` actually returns — read
 * from the service, not guessed. They live here rather than in src/api because that folder is
 * generated from the web app and must stay byte-identical to it.
 *
 * The honest long-term fix is to type these in the web app's api.ts so both surfaces share them; a
 * `any[]` return there is a gap on the web too. Until then this file is what keeps the app's own
 * code inside the no-`any` rule, and every field below is one the server demonstrably sends.
 */

/** One reading in a biomarker's history. `value` is numeric; `valueText` carries non-numeric results. */
export interface PortalLabPoint {
  value: number | null;
  valueText: string | null;
  flag: string | null;
  takenAt: string;
}

/** Lab results grouped by biomarker, most-recently-tested first, history oldest → newest. */
export interface PortalLabMarker {
  biomarker: string;
  unit: string | null;
  assesses: string | null;
  count: number;
  latest: PortalLabPoint;
  history: PortalLabPoint[];
}

export interface PortalPrescriptionItem {
  medicine: string;
  dose: string | null;
  frequency: string | null;
  /** Human-readable dosing, e.g. "Morning and night" — parsed server-side from `frequency`. */
  timing: string;
  durationDays: number | null;
  instructions: string | null;
}

export interface PortalPrescription {
  id: string;
  date: string;
  status: string;
  prescriber: string | null;
  items: PortalPrescriptionItem[];
}

/** The bookable catalogue the portal exposes — deliberately a thin slice of the billing catalogue. */
export interface PortalService {
  id: string;
  name: string;
  type: string | null;
  durationMin: number | null;
}

export interface PortalLifestyleLog {
  id: string;
  logDate: string;
  dietSummary: string | null;
  calories: number | null;
  exerciseType: string | null;
  exerciseMin: number | null;
  waterMl: number | null;
  weightKg: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulseBpm: number | null;
  urineMl: number | null;
  bloodSugar: number | null;
  notes: string | null;
}

export interface PortalRefillRequest {
  id: string;
  status: string;
  createdAt: string;
  note?: string | null;
  prescriptionId?: string | null;
}

/** A protocol or package the patient has bought, with what is left on it. */
export interface PortalPackage {
  name: string;
  kind: string;
  custom: boolean;
  soldAt: string;
  expiresAt: string | null;
  /** Past its end date. Shown as expired rather than as a live balance. */
  lapsed: boolean;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsLeft: number;
  valueAllotted: number;
  valueRemaining: number;
  drawdowns: { at: string; category: string; item: string; qty: number; covered: number; overage: number }[];
  /**
   * Custom value protocols only. Computed by the same allowance engine the billing counter uses,
   * so the patient can never be shown a different number from the one governing what reception may
   * hand over.
   */
  payment: {
    paid: number; total: number; outstanding: number; upfrontDue: number;
    belowUpfront: boolean; payByDate: string; overdue: boolean; suspended: boolean; usableNow: number;
  } | null;
}

/** A test the care plan says is coming up or late. Same engine the clinic sees. */
export interface PortalCareDue {
  test: string;
  nextDue: string | null;
  status: string;
  daysLate: number;
  overdue: boolean;
}

export interface PortalCarePlan {
  diseases: { disease: string; stage: number | null; status: string }[];
  dietPlan: {
    pathya: unknown; apathya: unknown;
    dinacharya: string[];
    /** `{ existing, changes }` — a Json column, NOT a string. Declaring it as one is what let an
     *  object reach <Text> and crash My plan; the web has always read it as an object. */
    dinacharyaPlan: unknown;
    yogaAsanas: string[]; yogasanaAdvice: string | null; pranayama: string[];
    lifestyleNotes: string | null; dietChart: unknown;
    validFrom: string | null; validTo: string | null; date: string;
  } | null;
  /** Only the modalities the doctor actually advised — an untouched toggle is not advice. */
  treatmentPlan: unknown;
  due: PortalCareDue[];
}

/** A submitted ePRO check-in. `flag` is the server's grading, never recomputed in the app. */
export interface PortalSymptomReport {
  id: string;
  createdAt: string;
  flag: string | null;
  score: number | null;
  note: string | null;
}

// GENERATED — DO NOT EDIT.
// Copied verbatim from the JClinic web app: apps/web/src/api.ts
// Edit it THERE, then run: node scripts/sync-api-client.mjs
// CI runs this with --check, so an edit made here alone will fail the build.

// Thin API client. Token + active clinic live in the host platform's storage — see ApiPlatform.
//
// THIS FILE IS SHARED VERBATIM with the JClinic mobile apps ("JClinic App/packages/api-client",
// kept in sync by scripts/sync-api-client.mjs). It must therefore contain no browser globals:
// no localStorage, no window.location, no document. Everything the host owns is injected once at
// startup through configureApi():
//   web    (apps/web/src/main.tsx) -> localStorage, location.href, an <a download> click
//   mobile (Expo)                  -> a Map mirrored to expo-secure-store, a navigation reset,
//                                     and expo-file-system + expo-sharing
const TOKEN_KEY = 'jclinic.token';
const CLINIC_KEY = 'jclinic.clinic';
const USER_KEY = 'jclinic.user';

/**
 * The host platform's capabilities.
 *
 * storage.get MUST be synchronous. It is called inside api() on every single request, and React
 * Native's SecureStore/AsyncStorage are promise-based — which is precisely why the mobile adapter
 * hydrates an in-memory Map at boot and mirrors writes back asynchronously, instead of this
 * signature going async and forcing all 39 namespaces below to change shape.
 */
export type ApiPlatform = {
  /** Origin the API lives on. Empty string on web, where Vite/nginx serve /v1 from this origin. */
  baseUrl: string;
  storage: {
    get(key: string): string | null;
    set(key: string, value: string | null): void;
  };
  /** A token was rejected. The host decides what "go to login" means. */
  onUnauthorized(scope: 'staff' | 'patient'): void;
  /** Hand the user a file to keep. */
  saveBlob(blob: Blob, filename: string): Promise<void>;
  /** A URL this platform's media player can play an in-memory blob from. */
  blobUrl(blob: Blob): Promise<string>;
};

// Deliberately throws rather than falling back to a browser implementation: a forgotten
// configureApi() must fail loudly on the first call, not work on web and break on device.
let platform: ApiPlatform | null = null;
export function configureApi(p: ApiPlatform) { platform = p; }
function P(): ApiPlatform {
  if (!platform) throw new Error('configureApi() was never called — install an ApiPlatform before any API call');
  return platform;
}

export function getToken() {
  return P().storage.get(TOKEN_KEY);
}
export function setToken(t: string | null) {
  P().storage.set(TOKEN_KEY, t);
}
export function getClinic() {
  return P().storage.get(CLINIC_KEY);
}
export function setClinic(c: string | null) {
  P().storage.set(CLINIC_KEY, c);
}

/**
 * The AuthUser snapshot taken at login. It lives here rather than in auth.tsx so that the place
 * which CLEARS it on a 401 (api(), below) and the places which WRITE it go through one storage
 * abstraction — and so the mobile apps inherit the same behaviour for free.
 */
export function getCachedUser<T = any>(): T | null {
  const raw = P().storage.get(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
export function setCachedUser(u: unknown | null) {
  P().storage.set(USER_KEY, u == null ? null : JSON.stringify(u));
}

/**
 * Which clinics a REPORT should cover — 'all', a clinic id, or null for "whatever X-Clinic-Id says".
 *
 * Module state rather than a parameter on purpose. BI is a dozen child report components, each
 * making its own calls; threading a scope argument through all of them would leave one report
 * quietly showing a different clinic from the rest of the page the first time someone added a new
 * card and forgot. Set once here, every request carries it and they cannot disagree.
 *
 * Only the analytics controller reads the header (@ClinicScope); everywhere else ignores it.
 * NOT persisted: a report scope is a thing you pick for a session, not a setting — and leaving it
 * on "all clinics" across a reload would silently change what the next person at that desk sees.
 */
let clinicScope: string | null = null;
export function getClinicScope() { return clinicScope; }
export function setClinicScope(s: string | null) { clinicScope = s; }

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const clinic = getClinic();
  if (clinic) headers['X-Clinic-Id'] = clinic;
  if (clinicScope) headers['X-Clinic-Scope'] = clinicScope;

  const res = await fetch(`${P().baseUrl}/v1${path}`, { ...options, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  // Expired/invalid token → clear session and bounce to login (instead of a dead "unauthorized").
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    setToken(null);
    setCachedUser(null);
    P().onUnauthorized('staff');
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/** Multipart upload — same auth/clinic headers as api(), but Content-Type is left for the
 *  browser to set (it needs the multipart boundary, which we can't set by hand). */
export async function apiUpload<T = any>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const clinic = getClinic();
  if (clinic) headers['X-Clinic-Id'] = clinic;
  const res = await fetch(`${P().baseUrl}/v1${path}`, { method: 'POST', headers, body: form });
  const text = await res.text();
  // Upload failures are the one place the response is often NOT ours: nginx answers an
  // oversized body with its own HTML 413 before the request ever reaches Nest. A bare
  // JSON.parse throws a SyntaxError there, and the user is told "Unexpected token <" instead
  // of "that file is too large" — the real cause completely hidden.
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch {
      body = { error: 'upload_failed', message: res.status === 413 ? 'File is too large to upload' : `Upload failed (HTTP ${res.status})` };
    }
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/**
 * Upload with a progress bar.
 *
 * XMLHttpRequest, not fetch — and not because of habit. `fetch` has no upload-progress event at
 * all (the streaming request body that would provide one is not usable here), so a 100 MB video
 * would sit on a frozen-looking page for minutes with nothing to show it is working. apiUpload()
 * stays as-is for every small upload; this is only for the ones big enough to need a bar.
 *
 * Returns an abort function alongside the promise so a doctor can cancel a slow upload rather
 * than reload the page and wonder whether it half-landed.
 */
export function apiUploadProgress<T = any>(
  path: string,
  form: FormData,
  onProgress?: (pct: number) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open('POST', `${P().baseUrl}/v1${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    const clinic = getClinic();
    if (clinic) xhr.setRequestHeader('X-Clinic-Id', clinic);
    // Content-Type is deliberately unset: the browser must add the multipart boundary itself.

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError(0, { message: 'Network error — the upload did not complete' }));
    xhr.onabort = () => reject(new ApiError(0, { message: 'Upload cancelled' }));
    xhr.ontimeout = () => reject(new ApiError(0, { message: 'Upload timed out' }));
    xhr.onload = () => {
      // Same trap as apiUpload(): an nginx 413 is an HTML page, and JSON.parse on it throws a
      // SyntaxError that completely hides the real reason.
      let body: any = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; }
      catch { body = { message: xhr.status === 413 ? 'File is too large to upload' : `Upload failed (HTTP ${xhr.status})` }; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, body));
    };
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

// ---- typed helpers ----
export interface AuthUser {
  id: string;
  name: string;
  roles: string[];
  clinics: string[];
  perms?: string[];
  isAdmin?: boolean;
  mustChangePassword?: boolean;
}
export interface HomeClinicTag { code: string; name: string }
export interface PatientSummary {
  id: string;
  mrn: string | null;
  fullName: string;
  sex: string;
  dob?: string | null;
  phone: string;
  email?: string | null;
  abhaId?: string | null;
  allergies: { substance: string; reaction?: string; severity?: string }[];
  homeClinic?: HomeClinicTag | null;
}
/**
 * A patient row as the server actually returns it — from `/patients` (search) and from
 * `/patients/directory` alike, so one table renderer serves both.
 *
 * `phone` is nullable: a patient migrated from Clinicea on a shared family number has a synthetic
 * `+99…` value as their account key, and the server swaps it for `contactPhone` — which may itself
 * be absent. `sharedContact` marks those rows so the UI can badge them instead of dialling a
 * number that reaches nobody.
 */
export interface PatientListItem {
  id: string;
  fullName: string;
  sex: string;
  phone: string | null;
  sharedContact?: boolean;
  mrn: string | null;
  category?: string | null;
  createdAt?: string;
  homeClinic?: HomeClinicTag | null;
}

/** Registration directory: ranged counts + a chart series + the patients registered in the window. */
export interface PatientDirectory {
  range: { from: string; to: string; bucket: 'day' | 'week' | 'month' };
  /** `all` = no clinic picked, so the scope is every clinic the caller holds. */
  scope: { clinicIds: string[]; all: boolean };
  totals: { inRange: number; allTime: number; today: number };
  series: { t: string; n: number }[];
  byClinic: { clinicId: string; code: string; name: string; n: number }[];
  rows: PatientListItem[];
  /** true = more matched than were returned; the UI must say so rather than imply completeness. */
  truncated: boolean;
}

export interface PatientDirectoryQuery {
  from?: string;
  to?: string;
  clinicId?: string;
  limit?: number;
}

/**
 * Identifies a mobile install to the API. The WEB app never sends this — and that absence is the
 * contract: no deviceId in, no refresh_token out and no device_session row. See MOBILE.md.
 */
export interface DeviceInfo {
  deviceId: string;
  platform?: string;
  appVersion?: string;
  deviceName?: string;
}

export interface DeviceSessionRow {
  id: string; deviceId: string; platform: string | null; appVersion: string | null;
  deviceName: string | null; pushToken: string | null;
  lastSeenAt: string; createdAt: string; expiresAt: string;
}

export const authApi = {
  /** `device` is mobile-only; omit it and both the request and the response are exactly as they
   *  have always been for the browser. */
  login: (email: string, password: string, device?: DeviceInfo) =>
    api<{ access_token: string; refresh_token?: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(device ?? {}) }),
    }),
  /** Devices this user is signed in on. Mobile sessions only — the web creates none. */
  sessions: () => api<DeviceSessionRow[]>('/auth/sessions'),
  revokeSession: (id: string) => api<{ revoked: number }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  logoutDevice: (deviceId: string) =>
    api<{ revoked: number }>('/auth/logout', { method: 'POST', body: JSON.stringify({ deviceId }) }),
  // Fresh roles/perms from the DB — the login snapshot in localStorage goes stale the moment an
  // admin edits a role, so the app re-syncs on load.
  me: () => api<AuthUser>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// ---- Admin console (multi-clinic, users, roles, permission matrix) ----
export interface ClinicRow { id: string; code: string; name: string; timezone?: string; gstin?: string | null; address?: string | null; phone?: string | null; isActive: boolean; circle?: { id: string; name: string } }
export interface AdminUserRow {
  id: string; fullName: string; email: string | null; phone: string | null; isActive: boolean;
  ozonetelAgentId: string | null;
  /** 'toolbar' | 'phone' | null — how click-to-call reaches them (null = toolbar with phone fallback). */
  dialMode?: string | null;
  roles: { role: string; clinicId: string | null; clinic: string | null }[];
  /** false when the account authored clinical records — those must keep their author. */
  canDelete: boolean;
  deleteBlockedBy: string[];
}
export interface RoleRow { id: string; name: string; description: string | null; isSystem: boolean; users: number; permissions: number }
export interface PermCatalog { module: string; actions: string[] }
export interface EffectivePerms {
  userId: string; fullName: string; isActive: boolean; isAdmin: boolean;
  roles: { role: string; clinic: string }[];
  perms: string[];
  byModule: Record<string, Record<string, string[]>>;
}

export const clinicsApi = {
  mine: () => api<{ id: string; code: string; name: string }[]>('/clinics/mine'),
  list: () => api<ClinicRow[]>('/clinics'),
  create: (data: unknown) => api<ClinicRow>('/clinics', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => api<ClinicRow>(`/clinics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  circles: () => api<{ id: string; name: string }[]>('/circles'),
  createCircle: (name: string) => api('/circles', { method: 'POST', body: JSON.stringify({ name }) }),
};
export const adminApi = {
  users: () => api<AdminUserRow[]>('/admin/users'),
  exportUsers: () => api<AdminUserRow[]>('/admin/users/export'),
  createUser: (data: unknown) => api<{ id: string }>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: unknown) => api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  setUserRoles: (id: string, assignments: { roleId: string; clinicId: string | null }[]) => api(`/admin/users/${id}/roles`, { method: 'PUT', body: JSON.stringify({ assignments }) }),
  resetPassword: (id: string, password: string) => api(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  bulkResetPasswords: (password: string, excludeAdmins?: boolean) => api<{ ok: boolean; count: number }>('/admin/users/bulk-reset-password', { method: 'POST', body: JSON.stringify({ password, excludeAdmins }) }),
  deleteUser: (id: string) => api<{ ok: boolean; deleted: string }>(`/admin/users/${id}`, { method: 'DELETE' }),
  roles: () => api<RoleRow[]>('/admin/roles'),
  createRole: (name: string, description?: string) => api<RoleRow>('/admin/roles', { method: 'POST', body: JSON.stringify({ name, description }) }),
  deleteRole: (id: string) => api(`/admin/roles/${id}`, { method: 'DELETE' }),
  rolePermissions: (id: string) => api<{ id: string; name: string; isSystem: boolean; grants: string[] }>(`/admin/roles/${id}/permissions`),
  /** What one user can ACTUALLY do right now — union of their roles, attributed per role. */
  userPermissions: (id: string) => api<EffectivePerms>(`/admin/users/${id}/permissions`),
  setRolePermissions: (id: string, grants: { module: string; action: string }[]) => api(`/admin/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ grants }) }),
  permissions: () => api<PermCatalog[]>('/admin/permissions'),
  bulkImport: (entity: string, rows: Record<string, unknown>[]) => api<ImportResult>(`/admin/import/${entity}`, { method: 'POST', body: JSON.stringify({ rows }) }),
};
export interface ImportResult { entity: string; total: number; created: number; skipped: number; errors: { row: number; name?: string; message: string }[] }

export interface PatientDashboard {
  patient: { id: string; fullName: string; sex: string; dob?: string | null; allergies: { substance: string; severity?: string | null }[]; homeClinic?: HomeClinicTag | null };
  diseases: { id: string; name: string; stage?: string | null; status: string }[];
  biomarkers: { biomarkerId: string; name: string; unit?: string | null; value: any; flag: string | null; takenAt: string; clinic?: string | null }[];
  dueTests: { biomarkerId: string; biomarker: string; panel: string; nextDue: string; status: DueStatus; daysLate: number; lastDoneAt: string | null; ordered: boolean }[];
  symptoms: { name: string; present: boolean; severity?: string | null; notedAt: string }[];
  plans: { name: string; kind: string; custom?: boolean; expiresAt?: string | null; caps: { category: string; remaining: number }[]; sessionsUsed: number; sessionsTotal: number; sessionsLeft: number; valueAllotted?: number; valueRemaining?: number }[];
  recentEncounters: { id: string; startedAt: string; type?: string | null; doctor?: string | null; primaryDx?: string | null; clinic?: string; open?: boolean; parkedNote?: string | null; parkedTab?: string | null }[];
  recentBills: { number: string; total: any; payState: string; createdAt: string; clinic?: string }[];
}
export interface Disease { id: string; name: string; markerCount: number; symptoms: string[] }
/**
 * A test the cadence engine says this patient owes. Derived straight from dueTests(), so it agrees
 * with the Biomarkers page, the reminder cron and the overdue worklist by construction.
 *
 * `intervalDays` is the numeric cadence — the ONLY field groupByCadence() may bucket on. Never
 * bucket on `frequency`, which is free text written by hand ("1-2 wks (G4-5)/monthly (G3)").
 */
export interface RecommendedTest {
  biomarkerId: string; name: string; assesses: string | null; group: string | null; frequency: string | null; nextDue: string | null;
  bookable: { labPartnerId: string; labPartner: string; partnerCode: string; price: number | null } | null;
  alreadyBooked: boolean;
  status: 'overdue' | 'due' | 'upcoming' | 'never' | null;
  unit: string | null;
  panelId: string;
  panel: string;
  intervalDays: number;
  lastDoneAt: string | null;
  lastValue: number | string | null;
  daysLate: number;
  /** Already requested and the patient told — self-expires once a newer result lands. */
  ordered: boolean;
  orderedAt: string | null;
  /** Part of this disease's standard panel. A routine test that is due must be advised before the
   *  visit can move past Tests; a special one never blocks. */
  isRoutine: boolean;
}
export interface RecommendedTests { diseases: { name: string; stage: number | null }[]; tests: RecommendedTest[] }

export type Trajectory = 'improving' | 'worsening' | 'stable' | null;
export interface InsightMarker {
  biomarkerId: string; name: string; unit?: string | null;
  latest: { value: any; flag: string | null; takenAt: string };
  previous: { value: any; flag: string | null; takenAt: string } | null;
  direction: 'up' | 'down' | 'flat' | null;
  trajectory: Trajectory;
  deltaPct: number | null;
  referenceRange: { low?: number | null; high?: number | null } | null;
  history: { takenAt: string; value: number | null; flag: string | null }[];
  nextDue: string | null; overdue: boolean;
}
export interface PatientInsights {
  patient: { id: string; fullName: string; sex: string; dob?: string | null; allergies: { substance: string; severity?: string | null }[] };
  summary: { critical: number; abnormal: number; normal: number; overdueTests: number; activeDiseases: number; trackedMarkers: number };
  diseases: { id: string; name: string; stage?: string | null; status: string }[];
  attention: { biomarkerId: string; name: string; flag: string | null; value: any; unit?: string | null; reason: string; nextDue: string | null; overdue: boolean }[];
  markers: InsightMarker[];
  recentSymptoms: { name: string; severity?: string | null; present: boolean; notedAt: string }[];
}

export interface PatientStats {
  total: number;
  recent: { id: string; fullName: string; sex: string; phone: string; mrn: string | null; category: string | null; createdAt: string; homeClinic?: HomeClinicTag | null }[];
}

export const patientsApi = {
  search: (q: string, limit?: number) =>
    api<PatientListItem[]>(`/patients?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`),
  /**
   * Registration directory. Only truthy params are sent — the API runs `forbidNonWhitelisted`, so
   * an empty `clinicId=` fails @IsUUID and 400s rather than being read as "all clinics".
   */
  directory: (q: PatientDirectoryQuery = {}) => {
    const p = new URLSearchParams();
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    if (q.clinicId) p.set('clinicId', q.clinicId);
    if (q.limit) p.set('limit', String(q.limit));
    return api<PatientDirectory>(`/patients/directory${p.toString() ? `?${p}` : ''}`);
  },
  stats: () => api<PatientStats>('/patients/stats'),
  /** Re-tag the intake category. Empty string clears it. Narrow by design — the server has no
   *  general patient PATCH, so this cannot become a way to edit name, phone or date of birth. */
  setCategory: (id: string, category: string | null) =>
    api<{ id: string; category: string | null }>(`/patients/${id}/category`, {
      method: 'PATCH',
      body: JSON.stringify({ category }),
    }),
  /** Correct name / dialable phone (audited). Still narrow: never dob/sex, never the login phone. */
  updateDetails: (id: string, data: { fullName?: string; phone?: string }) =>
    api<{ id: string; fullName: string; contactPhone: string | null }>(`/patients/${id}/details`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  register: (data: unknown) =>
    api<any>('/patients', { method: 'POST', body: JSON.stringify(data) }),
  summary: (id: string) => api<PatientSummary>(`/patients/${id}/summary`),
  sendOtp: (phone: string) => api<{ sent: boolean; expiresInSec: number }>('/patients/otp/send', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) => api<{ verified: boolean }>('/patients/otp/verify', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  dashboard: (id: string) => api<PatientDashboard>(`/patients/${id}/dashboard`),
  insights: (id: string) => api<PatientInsights>(`/patients/${id}/insights`),
  /** Vitals over time for the trend chart. Chain-wide — a weight series must not break at a branch. */
  vitals: (id: string, opts: { codes?: string; months?: number } = {}) => {
    const q = new URLSearchParams();
    // Only truthy values: forbidNonWhitelisted plus an @IsOptional field means `codes=` (empty)
    // fails the pattern and 400s, where omitting it correctly falls back to the default set.
    if (opts.codes) q.set('codes', opts.codes);
    if (opts.months) q.set('months', String(opts.months));
    const s = q.toString();
    return api<VitalsSeries>(`/patients/${id}/vitals${s ? `?${s}` : ''}`);
  },
  notifications: (id: string) => api<{ id: string; kind: string; body: string; channel: string; status: string; createdAt: string }[]>(`/patients/${id}/notifications`),
};

// ---- diagnosis-first clinical catalogues ----
export interface PanelStageRow { id: string; code: string; label: string; hint: string | null; stageNum: number }
export interface IntakeFormField {
  key: string; type: 'select' | 'multiselect' | 'text' | 'number' | 'date' | 'boolean' | 'severity';
  label: string; hint?: string; required?: boolean; options?: string[];
  min?: number; max?: number; unit?: string;
  showIf?: { field: string; equals?: unknown; includes?: unknown };
}
export interface IntakeForm {
  patientDiseaseId: string; panelId: string; disease: string;
  template: { key: string; version: number; panelId: string | null; title: string; schema: { fields: IntakeFormField[] } } | null;
}
export interface PatientHistoryRow {
  id: string; patientId: string;
  comorbidities: string[]; motherConditions: string[]; fatherConditions: string[];
  noComorbidities: boolean; noFamilyHistory: boolean; notes: string | null;
  recordedAt: string; updatedAt: string;
}
export interface ClinicalOptionRow { id: string; kind: string; name: string; group: string | null; defaultDose: string | null; isActive?: boolean; sortOrder?: number }
export interface TreatmentCatalogues {
  condition: ClinicalOptionRow[]; yoga: ClinicalOptionRow[]; exercise: ClinicalOptionRow[];
  panchkarma: { id: string; name: string; defaultSittings: number | null; durationMin: number | null }[];
}
export interface SymptomRow { id: string; name: string; present: boolean; severity?: string | null; notedAt: string; kind?: string; encounterId?: string | null }

export const diseasesApi = {
  list: () => api<Disease[]>('/diseases'),
  assign: (patientId: string, panelId: string, stage?: string) => api<{ diseaseId: string; scheduled: number }>(`/patients/${patientId}/diseases`, { method: 'POST', body: JSON.stringify({ panelId, stage }) }),
  patientDiseases: (patientId: string) => api<{ id: string; stage?: string | null; status: string; panel: { id: string; name: string } }[]>(`/patients/${patientId}/diseases`),
  recommendedTests: (patientId: string) => api<RecommendedTests>(`/patients/${patientId}/recommended-tests`),
  /** panelId null = the general complaints that apply to every patient. */
  symptomCatalog: (patientId: string) => api<{ panelId: string | null; disease: string; symptoms: { name: string; source: string | null }[] }[]>(`/patients/${patientId}/symptom-catalog`),
  recordSymptom: (patientId: string, data: unknown) => api<SymptomRow>(`/patients/${patientId}/symptoms`, { method: 'POST', body: JSON.stringify(data) }),
  symptoms: (patientId: string, opts: { encounterId?: string; kind?: string } = {}) => {
    const q = new URLSearchParams(); if (opts.encounterId) q.set('encounterId', opts.encounterId); if (opts.kind) q.set('kind', opts.kind);
    const qs = q.toString(); return api<SymptomRow[]>(`/patients/${patientId}/symptoms${qs ? `?${qs}` : ''}`);
  },
  removeSymptom: (id: string) => api<{ deleted: string }>(`/symptoms/${id}`, { method: 'DELETE' }),
  recordStage: (patientDiseaseId: string, data: { stage: number; encounterId?: string; label?: string; note?: string; location?: string }) =>
    api<{ id: string; stage: number; previous: number | null; direction: string }>(`/patient-diseases/${patientDiseaseId}/staging`, { method: 'POST', body: JSON.stringify(data) }),
  stagingHistory: (patientDiseaseId: string) =>
    api<{ id: string; stage: number; label?: string | null; note?: string | null; stagedAt: string }[]>(`/patient-diseases/${patientDiseaseId}/staging`),
  /** Mark a mis-assigned or recovered disease resolved/remission — the resolve control. */
  setStatus: (patientDiseaseId: string, status: 'active' | 'remission' | 'resolved') =>
    api(`/patient-diseases/${patientDiseaseId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  /** KDIGO/cancer stage vocabulary; empty = the panel keeps the generic 1..5 picker. */
  panelStages: (panelId: string) => api<PanelStageRow[]>(`/diseases/${panelId}/stages`),
  /** The intake questionnaire per active disease (template null = unconfigured panel, normal). */
  intakeForms: (patientId: string) => api<IntakeForm[]>(`/patients/${patientId}/intake-forms`),
  patientHistory: (patientId: string) => api<PatientHistoryRow | null>(`/patients/${patientId}/history`),
  savePatientHistory: (patientId: string, data: unknown) => api<PatientHistoryRow>(`/patients/${patientId}/history`, { method: 'PUT', body: JSON.stringify(data) }),
  treatmentCatalogues: () => api<TreatmentCatalogues>('/treatment-catalogues'),
};
export interface EncounterDisease { id: string; panelId: string; stage?: string | null; stageNum?: number | null; status: string; location?: string | null; panel: { name: string } }

// ---- clinical setup (admin): diseases, per-disease biomarkers, intake categories ----
export interface Category { id: string; name: string; description: string | null; isActive: boolean; sortOrder: number }
export interface ClinicalDisease { id: string; name: string; markerCount: number; symptomCount: number; patientCount: number }
export interface BiomarkerLite { id: string; name: string; unit: string | null; assesses: string | null; isEventDriven: boolean }
export interface DiseaseMarker { id: string; biomarkerId: string; biomarker: BiomarkerLite; groupLabel: string | null; stageCondition: string | null; frequencyRule: any }
export interface RefRange { sex: 'male' | 'female' | 'other' | 'unknown' | null; low: number | null; high: number | null; criticalLow: number | null; criticalHigh: number | null }
export interface BiomarkerDetail { id: string; name: string; unit: string | null; assesses: string | null; isEventDriven: boolean; biologicalFloorDays: number | null; ranges: RefRange[] }
export interface BiomarkerInput { name?: string; unit?: string; assesses?: string; isEventDriven?: boolean; biologicalFloorDays?: number; ranges?: { sex?: 'male' | 'female'; low?: number; high?: number; criticalLow?: number; criticalHigh?: number }[] }

export const categoriesApi = {
  list: () => api<Category[]>('/categories'),
  listAll: () => api<Category[]>('/categories/all'),
  create: (data: { name: string; description?: string }) => api<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; description: string; isActive: boolean }>) => api<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => api<{ ok: boolean }>(`/categories/${id}`, { method: 'DELETE' }),
};

export interface MarkerInput { biomarkerId?: string; intervalDays?: number; freqLabel?: string; eventDriven?: boolean; groupLabel?: string; stageCondition?: string }
export const clinicalApi = {
  diseases: () => api<ClinicalDisease[]>('/admin/diseases'),
  createDisease: (name: string) => api<{ id: string; name: string }>('/admin/diseases', { method: 'POST', body: JSON.stringify({ name }) }),
  renameDisease: (id: string, name: string) => api(`/admin/diseases/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteDisease: (id: string) => api<{ ok: boolean }>(`/admin/diseases/${id}`, { method: 'DELETE' }),
  biomarkers: () => api<BiomarkerLite[]>('/admin/biomarkers'),
  createBiomarker: (data: BiomarkerInput) => api<BiomarkerDetail>('/admin/biomarkers', { method: 'POST', body: JSON.stringify(data) }),
  getBiomarker: (id: string) => api<BiomarkerDetail>(`/admin/biomarkers/${id}`),
  updateBiomarker: (id: string, data: BiomarkerInput) => api<BiomarkerDetail>(`/admin/biomarkers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  markers: (diseaseId: string) => api<DiseaseMarker[]>(`/admin/diseases/${diseaseId}/markers`),
  addMarker: (diseaseId: string, data: MarkerInput) => api<{ id: string; resynced: number }>(`/admin/diseases/${diseaseId}/markers`, { method: 'POST', body: JSON.stringify(data) }),
  updateMarker: (markerId: string, data: MarkerInput) => api<{ id: string; resynced: number }>(`/admin/markers/${markerId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMarker: (markerId: string) => api<{ ok: boolean; resynced: number }>(`/admin/markers/${markerId}`, { method: 'DELETE' }),
  // Stage vocabulary (KDIGO / cancer stage groups) — per disease, upsert by code.
  stages: (diseaseId: string) => api<(PanelStageRow & { sortOrder: number })[]>(`/admin/diseases/${diseaseId}/stages`),
  upsertStage: (diseaseId: string, data: { code: string; label: string; hint?: string; stageNum: number; sortOrder?: number }) =>
    api<PanelStageRow>(`/admin/diseases/${diseaseId}/stages`, { method: 'POST', body: JSON.stringify(data) }),
  deleteStage: (stageId: string) => api<{ ok: boolean }>(`/admin/stages/${stageId}`, { method: 'DELETE' }),
  // Clinical option vocabulary (condition | yoga | exercise dropdowns).
  options: (kind?: string) => api<ClinicalOptionRow[]>(`/admin/clinical-options${kind ? `?kind=${kind}` : ''}`),
  createOption: (data: { kind: string; name: string; group?: string; defaultDose?: string }) =>
    api<ClinicalOptionRow>('/admin/clinical-options', { method: 'POST', body: JSON.stringify(data) }),
  updateOption: (id: string, data: Partial<{ name: string; group: string; defaultDose: string; isActive: boolean; sortOrder: number }>) =>
    api<ClinicalOptionRow>(`/admin/clinical-options/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteOption: (id: string) => api<{ ok: boolean }>(`/admin/clinical-options/${id}`, { method: 'DELETE' }),
  formTemplates: () => api<{ id: string; key: string; version: number; title: string; isActive: boolean; panelId: string | null; createdAt: string; panel: { name: string } | null }[]>('/admin/form-templates'),
};

// ---- scheduling ----
export interface Resource { id: string; name: string; kind: string }
export interface Practitioner { id: string; name: string; role: string }
export interface Appointment {
  id: string;
  type: 'physical' | 'online';
  status: string;
  startsAt: string;
  endsAt?: string | null;
  teleconsultUrl?: string | null;
  patient?: { id: string; fullName: string; phone: string };
  practitioner?: { id: string; fullName: string } | null;
  resource?: { id: string; name: string } | null;
  queueToken?: { id: string; number: number; state: string } | null;
  serviceId?: string | null;
  service?: string | null;
  bookingRef?: string | null;
  source?: string;
  patientNote?: string | null;
  rescheduleRequestedFor?: string | null;
  seriesId?: string | null;
}
export interface QueueItem {
  id: string;
  number: number;
  state: string;
  appointmentId?: string | null;
  patient?: { id: string; fullName: string } | null;
  appointment?: { id?: string; type: string; practitioner?: { fullName: string } | null } | null;
}

// ---- EMR ----
export interface EncounterDetail {
  id: string;
  type?: string | null;
  startedAt: string;
  patient: { id: string; fullName: string; sex: string; phone: string; dob?: string | null; category?: string | null; allergies: { substance: string; severity?: string }[]; diseases?: EncounterDisease[] };
  practitioner?: { id: string; fullName: string } | null;
  note?: { body: { subjective?: string; objective?: string; assessment?: string; plan?: string } } | null;
  ayurveda?: any | null;
  dietPlan?: any | null;
  diagnoses: { id: string; code?: string | null; description: string; isPrimary: boolean }[];
  vitals: { id: string; code: string; valueNum?: number | null; valueText?: string | null; unit?: string | null; takenAt: string }[];
  /** Measurements taken at an EARLIER visit that stay valid. Height only — a stale weight would
   *  quietly mis-size a diet chart, so weight is never carried forward. */
  carriedVitals?: { HT?: { valueNum?: number | null; unit?: string | null; takenAt: string } | null } | null;
  // Completeness / conclusion (server-computed; the page's live checklist only mirrors it)
  gaps?: string[];
  endedAt?: string | null;
  endedReason?: string | null;
  endedNote?: string | null;
  clonedFromId?: string | null;
  /** "Save for later": when and on which Encounter tab the doctor paused this open visit. */
  parkedAt?: string | null;
  parkedTab?: string | null;
  parkedNote?: string | null;
  /** "Nothing to record here" for the three sections that are legitimately empty on many visits.
   *  Either real data OR the tick satisfies the section — see encounter-gaps.ts. */
  ackNoTests?: boolean;
  ackNoFiles?: boolean;
  ackNoMeds?: boolean;
  /** Completeness only — the server sends `take: 1`, so these say "any?" rather than "how many". */
  testPrescriptions?: { id: string }[];
  attachments?: { id: string }[];
  /** V2 sections (diagnosis-first). Full rows — the History pane and plan block prefill from them. */
  history?: VisitHistoryRow | null;
  treatmentPlan?: TreatmentPlanRow | null;
  /** Chief complaints, presence only (`take: 1`) — the pane lists them via diseasesApi.symptoms. */
  symptomObservations?: { id: string }[];
  /** Count + latest amendment on this visit — drives the header badge. */
  amendment?: AmendmentSummary;
}

export interface VisitHistoryRow {
  id: string; encounterId: string;
  energy: string | null; generalCondition: string | null; sleep: string | null;
  ackNoComplaints: boolean;
  /** { "<patientDiseaseId>": { templateKey, templateVersion, answers } } */
  diseaseAnswers: Record<string, { templateKey: string; templateVersion: number; answers: Record<string, unknown> }> | null;
}
export interface PlanItem { practiceId?: string; serviceId?: string; name: string; dose?: string; minutesPerDay?: number; daysPerWeek?: number; weeks?: number; sittings?: number; durationDays?: number; note?: string }
export interface TreatmentPlanRow {
  id: string; encounterId: string;
  prognosis: string | null;
  adviseMedication: boolean; medicationDurationDays: number | null;
  adviseExercise: boolean; exercise: PlanItem[] | null;
  adviseYoga: boolean; yoga: PlanItem[] | null;
  advisePanchkarma: boolean; panchkarma: PlanItem[] | null;
  ackNoTreatment: boolean; comments: string | null;
}

/**
 * A test the doctor advised at one visit.
 *
 * `biomarkerId` is null for a free-text investigation — imaging and other non-biomarker tests have
 * no catalogue row. `intervalDays`/`frequencyLabel` are FROZEN at prescribing time: editing cadence
 * in Admin later must not rewrite what a doctor wrote on a past visit.
 */
export interface PrescribedTest {
  id: string;
  biomarkerId: string | null;
  label: string;
  source: 'cadence' | 'one_off' | string;
  dueStatus: string | null;
  intervalDays: number | null;
  frequencyLabel: string | null;
  note: string | null;
  prescribedAt: string;
  completedAt: string | null;
}

export type AttachmentCategory = 'clinical_photo' | 'outside_report' | 'imaging' | 'procedure_video' | 'other';

export interface Attachment {
  id: string;
  category: AttachmentCategory | string;
  caption: string | null;
  fileName: string;
  /** The SNIFFED type, not what the browser guessed at upload time. Drives which tag renders it. */
  mimeType: string;
  sizeBytes: number;
  takenAt: string | null;
  createdAt: string;
  /** Set once the bytes have been purged after a soft delete — the row survives as the record. */
  purgedAt: string | null;
  uploadedByName: string | null;
  encounterId?: string | null;
  /**
   * Whether this caller, in the clinic they are currently in, may correct or remove the row.
   * Server-computed: reads are chain-wide but writes are not, so "Earlier files" mixes both and
   * the controls must not appear on a row that would 404.
   */
  editable: boolean;
  /** Signed, expires an hour after the list call. Re-fetch the list if a load fails. */
  url: string;
}

export interface AttachmentList {
  visit: Attachment[];
  /** The same patient's files from other visits — what makes a progress photo comparable. */
  earlier: Attachment[];
}

/** One entry in a visit's amendment trail. `id` is a STRING: AuditLog.id is a BigInt server-side
 *  and JSON.stringify throws on those, so the API maps it before returning. */
export interface Amendment {
  id: string;
  at: string;
  action: string;
  actor: string | null;
  before: any;
  after: any;
}
/** Count + latest amendment, for the header badge. */
export interface AmendmentSummary { count: number; lastAt: string | null; lastBy: string | null }

/**
 * Everything recorded at one visit. The last six fields come from models that carry an
 * `encounterId` with no back-relation on Encounter — they have to be fetched by hand server-side,
 * and a "complete record" that omitted them would look complete while hiding a lab order.
 */
export interface VisitRecord {
  id: string;
  startedAt: string;
  endedAt: string | null;
  endedReason: string | null;
  endedNote: string | null;
  endedByName: string | null;
  type: string | null;
  clonedFromId: string | null;
  gaps: string[];
  amendment: AmendmentSummary;
  clinic: { code: string; name: string };
  practitioner: { id: string; fullName: string } | null;
  patient: { id: string; fullName: string; sex: string; phone: string; dob?: string | null; category?: string | null; allergies: { substance: string; severity?: string | null }[] };
  note?: { body: { subjective?: string; objective?: string; assessment?: string; plan?: string } } | null;
  ayurveda?: any | null;
  dietPlan?: any | null;
  diagnoses: { id: string; code?: string | null; description: string; isPrimary: boolean }[];
  vitals: { id: string; code: string; valueNum?: number | null; valueText?: string | null; unit?: string | null; takenAt: string }[];
  prescriptions: { id: string; status: string; signedAt: string | null; prescriber?: { fullName: string } | null;
    items: { dose?: string | null; frequency?: string | null; durationDays?: number | null; instructions?: string | null; drugText?: string | null; medicine?: { name: string } | null }[] }[];
  serviceDeliveries: { id: string; deliveredAt: string; cost?: string | number | null; service: { name: string }; provider?: { fullName: string } | null }[];
  feedback: { id: string; overallRating?: number | null; doctorRating?: number | null; receptionRating?: number | null; therapistRating?: number | null; comment?: string | null; trigger?: string | null; status: string; createdAt: string }[];
  packageRecs: { id: string; status: string; note?: string | null; createdAt: string; package: { name: string } }[];
  medicationChanges: { id: string; action?: string | null; state: string; fromStrength?: string | null; toStrength?: string | null; fromFrequency?: string | null; toFrequency?: string | null; toStatus: string; reason?: string | null; plannedFor?: string | null }[];
  labOrders: { id: string; status: string; tests: unknown; origin: string; createdAt: string; partner?: { name: string } | null }[];
  staging: { id: string; stage: number; label?: string | null; note?: string | null; stagedAt: string }[];
  symptoms: { id: string; name: string; present: boolean; severity?: string | null; notedAt: string; kind?: string }[];
  history?: VisitHistoryRow | null;
  treatmentPlan?: TreatmentPlanRow | null;
  advisedTests: { id: string; label: string; source: string; frequencyLabel: string | null; intervalDays: number | null; dueStatus: string | null; note: string | null; biomarkerId: string | null; completedAt: string | null }[];
}

/** A row in the patient's Visits tab. `gaps` and `has` come from the server so the list can say
 *  what a visit holds, and what it is missing, without opening it. */
export interface VisitListItem {
  id: string;
  startedAt: string;
  endedAt: string | null;
  endedReason: string | null;
  type: string | null;
  clonedFromId: string | null;
  parkedAt?: string | null;
  parkedTab?: string | null;
  parkedNote?: string | null;
  clinic: { code: string; name: string };
  practitioner: string | null;
  primaryDx: string | null;
  gaps: string[];
  has: { note: boolean; diagnoses: number; vitals: number; rxItems: number; ayurveda: boolean; dietPlan: boolean };
}

/** One dated reading. `encounterId` is carried so a point on the chart can name the visit it came from. */
export interface VitalPoint { at: string; v: number; unit: string | null; encounterId: string; clinicCode: string }
export interface VitalsSeries { from: string; months: number; series: Record<string, VitalPoint[]> }

/** Where one section of the "last time" panel came from. Every block carries its own, because the
 *  last diet plan is routinely several visits older than the last note. */
export interface PrevSource { encounterId: string; startedAt: string; clinicCode: string; doctor: string | null }
export interface PreviousValues {
  lastVisit: { id: string; startedAt: string; type?: string | null; clinic: { code: string; name: string }; doctor: string | null } | null;
  note: (PrevSource & { body: { subjective?: string; objective?: string; assessment?: string; plan?: string } }) | null;
  ayurveda: (PrevSource & Record<string, any>) | null;
  dietPlan: (PrevSource & Record<string, any> & { hasChart: boolean }) | null;
  diagnoses: (PrevSource & { items: { code?: string | null; description: string; isPrimary: boolean }[] }) | null;
  prescription: (PrevSource & { items: { drug: string; medicineId?: string | null; medicineActive?: boolean | null; dose?: string | null; frequency?: string | null; durationDays?: number | null; instructions?: string | null }[] }) | null;
  history?: (PrevSource & Record<string, any>) | null;
  treatmentPlan?: (PrevSource & Record<string, any>) | null;
  /** Latest reading per code from the newest earlier visit that has vitals — pre-fill reference only. */
  vitals?: (PrevSource & { items: { code: string; valueNum: number; unit: string | null; takenAt: string }[] }) | null;
  /** Tests advised (not revoked) at the newest earlier visit that advised any. */
  tests?: (PrevSource & { items: { biomarkerId: string | null; label: string; source: string }[] }) | null;
}

export const emrApi = {
  create: (data: unknown) => api<{ id: string }>('/encounters', { method: 'POST', body: JSON.stringify(data) }),
  cloneLast: (patientId: string) => api<{ id: string; clonedFrom: string | null }>('/encounters/clone-last', { method: 'POST', body: JSON.stringify({ patientId }) }),
  /** Every visit the caller can read, newest first — chain-wide across their clinics. */
  listByPatient: (patientId: string) => api<VisitListItem[]>(`/encounters?patientId=${patientId}`),
  get: (id: string) => api<EncounterDetail>(`/encounters/${id}`),
  /** What was recorded last time, per section. Fetched alongside get(), never blocking it. */
  previous: (id: string) => api<PreviousValues>(`/encounters/${id}/previous`),
  /** The whole visit, read-only and chain-wide — powers /visit/:id. */
  full: (id: string) => api<VisitRecord>(`/encounters/${id}/full`),
  /** Who changed what on this visit, and when. */
  amendments: (id: string) => api<Amendment[]>(`/encounters/${id}/amendments`),
  /** Tests advised at this visit. */
  tests: (id: string) => api<PrescribedTest[]>(`/encounters/${id}/tests`),
  prescribeTests: (id: string, items: { biomarkerId?: string; label?: string; note?: string }[], notify = true) =>
    api<{ prescribed: number; message: string | null }>(`/encounters/${id}/tests`, { method: 'POST', body: JSON.stringify({ items, notify }) }),
  revokeTest: (id: string, lineId: string) =>
    api<{ revoked: string; clearedOrderedAt: boolean }>(`/encounters/${id}/tests/${lineId}`, { method: 'DELETE' }),
  /** Files on this visit, plus the patient's earlier ones for comparison. Each row's `url` is a
   *  signed link an <img>/<video>/<iframe> can load; it expires an hour after this call. */
  attachments: (id: string) => api<AttachmentList>(`/encounters/${id}/attachments`),
  /**
   * Attach one file. Returns { promise, abort } — the caller drives a progress bar and can cancel.
   * The path must stay exactly `/encounters/:id/attachments`: nginx grants the 110 MB body limit
   * to that one location pattern and nothing else.
   */
  uploadAttachment: (
    id: string,
    file: File,
    meta: { category: string; caption?: string; takenAt?: string },
    onProgress?: (pct: number) => void,
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('category', meta.category);
    if (meta.caption) form.append('caption', meta.caption);
    if (meta.takenAt) form.append('takenAt', meta.takenAt);
    return apiUploadProgress<Attachment>(`/encounters/${id}/attachments`, form, onProgress);
  },
  /** Correct the filing. `caption: ''` clears it; omitting a field leaves it alone. */
  updateAttachment: (id: string, attId: string, patch: { category?: string; caption?: string; takenAt?: string; reason?: string }) =>
    api<{ updated: boolean }>(`/encounters/${id}/attachments/${attId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** Soft delete — hidden immediately, bytes kept 30 days, always audited. A reason is required. */
  deleteAttachment: (id: string, attId: string, reason: string) =>
    api<{ deleted: string; recoverableUntil: string }>(`/encounters/${id}/attachments/${attId}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  // Correcting a recorded value. Each returns the RECOMPUTED gaps, because deleting the last vital
  // re-opens the `vitals` gap on a visit that may already be concluded — the page must not go on
  // showing a green tick for a section whose only row was just removed.
  updateVital: (id: string, vitalId: string, data: { valueNum?: number; valueText?: string; unit?: string; reason?: string }) =>
    api<{ id: string; gaps: string[] }>(`/encounters/${id}/vitals/${vitalId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteVital: (id: string, vitalId: string, reason?: string) =>
    api<{ deleted: string; gaps: string[] }>(`/encounters/${id}/vitals/${vitalId}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  updateDiagnosis: (id: string, dxId: string, data: { code?: string; description?: string; isPrimary?: boolean; reason?: string }) =>
    api<{ id: string; gaps: string[] }>(`/encounters/${id}/diagnoses/${dxId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDiagnosis: (id: string, dxId: string, reason?: string) =>
    api<{ deleted: string; gaps: string[] }>(`/encounters/${id}/diagnoses/${dxId}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  saveNote: (id: string, body: unknown) => api(`/encounters/${id}/note`, { method: 'PUT', body: JSON.stringify(body) }),
  addDiagnosis: (id: string, data: unknown) => api(`/encounters/${id}/diagnoses`, { method: 'POST', body: JSON.stringify(data) }),
  addVital: (id: string, data: unknown) => api(`/encounters/${id}/vitals`, { method: 'POST', body: JSON.stringify(data) }),
  /** Whole vitals set in one call — a BP is two rows and must not be half-saved. */
  addVitals: (id: string, items: { code: string; valueNum?: number; valueText?: string; unit?: string }[]) =>
    api<{ added: number }>(`/encounters/${id}/vitals/bulk`, { method: 'POST', body: JSON.stringify({ items }) }),
  saveAyurveda: (id: string, data: unknown) => api(`/encounters/${id}/ayurveda`, { method: 'PUT', body: JSON.stringify(data) }),
  saveHistory: (id: string, data: unknown) => api<VisitHistoryRow & { gaps: string[] }>(`/encounters/${id}/history`, { method: 'PUT', body: JSON.stringify(data) }),
  saveTreatmentPlan: (id: string, data: unknown) => api<TreatmentPlanRow & { gaps: string[] }>(`/encounters/${id}/treatment-plan`, { method: 'PUT', body: JSON.stringify(data) }),
  saveDietPlan: (id: string, data: unknown) => api(`/encounters/${id}/diet-plan`, { method: 'PUT', body: JSON.stringify(data) }),
  generateDietChart: (id: string, data: GenerateDietChartInput) => api<DietChart>(`/encounters/${id}/diet-plan/generate`, { method: 'POST', body: JSON.stringify(data) }),
  /** Record "nothing to record" for tests / files / outside medication. Returns the recomputed
   *  server-side gaps so the checklist never has to guess. */
  setSectionAck: (id: string, data: { ackNoTests?: boolean; ackNoFiles?: boolean; ackNoMeds?: boolean }) =>
    api<{ ok: boolean; gaps: string[] }>(`/encounters/${id}/section-ack`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** Visits left open with a required section missing — the team queue. mine=true = own only. */
  incomplete: (opts: { days?: number; mine?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.days) q.set('days', String(opts.days));
    if (opts.mine) q.set('mine', '1');
    const s = q.toString();
    return api<IncompleteEncounter[]>(`/encounters/incomplete${s ? `?${s}` : ''}`);
  },
  /** Conclude the visit. Server recomputes gaps; a reason is required when anything is missing. */
  complete: (id: string, body: { reason?: string; note?: string } = {}) =>
    api<{ id: string; endedAt: string; endedReason: string; gaps: string[] }>(`/encounters/${id}/complete`, { method: 'POST', body: JSON.stringify(body) }),
  reopen: (id: string) => api<{ id: string; endedAt: null }>(`/encounters/${id}/reopen`, { method: 'POST', body: JSON.stringify({}) }),
  /** "Save for later": remember the tab the doctor paused on; Resume lands there. */
  park: (id: string, tab: string, note?: string) => api<{ id: string; parkedAt: string; parkedTab: string | null; parkedNote: string | null }>(`/encounters/${id}/park`, { method: 'POST', body: JSON.stringify({ tab, note }) }),
};
export interface IncompleteEncounter {
  id: string;
  startedAt: string;
  type: string | null;
  parkedAt?: string | null;
  parkedTab?: string | null;
  parkedNote?: string | null;
  patientId: string;
  patient: string;
  practitionerId: string;
  practitioner: string;
  gaps: string[];
}
export interface GenerateDietChartInput {
  weightKg: number; heightCm: number; activity?: string; ageYears?: number; sex?: string;
  conditions?: string[]; ckdStage?: number; onDialysis?: boolean; weightGoal?: string;
}
export interface DietChart {
  generatedAt: string | null;
  inputs: { ageYears: number; sex: string; weightKg: number; heightCm: number; activity: string; ckdStage: number; onDialysis: boolean; weightGoal: string; conditions: string[] };
  bmi: number; bmiCategory: string;
  planType: string; planLabel: string; precedence: string | null; conflictsNote: string | null;
  energy: { bmr: number; tdee: number; targetKcal: number; weightGoal: string; basis: string };
  protein: { gPerKg: number; grams: number; note: string };
  macros: { carb: string; fat: string; fibre: string; addedSugar: string };
  micros: { sodium: string; potassium: string; phosphorus: string; fluid: string };
  emphasise: string[]; limit: string[]; avoid: string[];
  swaps: { from: string; to: string; caveat: string }[];
  cautions: string[];
  mealBudget: { breakfast: number; lunch: number; snack: number; dinner: number };
  week: { day: string; breakfast: string; lunch: string; snack: string; dinner: string }[];
  disclaimer: string; text: string;
}

// ---- prescriptions ----
export interface RxItem {
  id: string; medicineId?: string | null; medicine?: { name: string } | null;
  drugText?: string | null; dose?: string | null; frequency?: string | null;
  durationDays?: number | null; dispensedQty: string | number;
}
export interface Prescription {
  id: string; status: string; signedAt?: string | null; createdAt?: string;
  items: RxItem[]; alerts?: any[];
  clinic?: ClinicHeader;
  patient?: { id: string; fullName: string; sex?: string; dob?: string | null; phone?: string | null };
  prescriber?: { fullName: string } | null;
  packageRecs?: { id: string; packageId: string; note?: string | null; status: string; package: { name: string; kind: string; price: string | number; durationMonths?: number | null } }[];
}
export interface AddItemResult {
  blocked?: boolean;
  alerts?: { kind: string; detail: string; severity?: string }[];
  item?: RxItem;
}

export interface PendingRx { prescriptionId: string; patientId: string; patient: string; phone: string; prescriber?: string | null; createdAt: string; items: string[]; estTotal: number }
/** A prescription the doctor has signed. Read-only; reception never sees unsigned drafts. */
export interface SignedRx {
  id: string; patientId: string; patient: string; phone: string | null;
  prescriber: string | null; signedAt: string | null; createdAt: string; status: string;
  itemCount: number; items: string[];
}
export interface RxFavourite { id: string; medicineId: string; dose?: string | null; frequency?: string | null; durationDays?: number | null; medicine?: { name: string } }

export const prescriptionsApi = {
  create: (data: unknown) => api<{ id: string }>('/prescriptions', { method: 'POST', body: JSON.stringify(data) }),
  /** Follow-up: copy the previous visit's script onto this encounter, allergy-screened line by line. */
  repeatLast: (encounterId: string) =>
    api<{ prescriptionId: string; repeatedFrom: string | null; added: string[]; skipped: { drug: string; why: string }[] }>(`/prescriptions/repeat-last/${encounterId}`, { method: 'POST' }),
  get: (id: string) => api<Prescription>(`/prescriptions/${id}`),
  /** Read-only lookup for an encounter. Lets the panel show an existing prescription without
   *  create()-ing one just because the tab was opened. */
  byEncounter: (encounterId: string) => api<Prescription[]>(`/prescriptions?encounterId=${encounterId}`),
  pending: () => api<PendingRx[]>('/prescriptions/pending'),
  /** Signed prescriptions clinic-wide — reception's view of the finished record. */
  signed: (f: { q?: string; from?: string; to?: string } = {}) => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return api<SignedRx[]>(`/prescriptions/signed${p.toString() ? `?${p}` : ''}`);
  },
  favourites: () => api<RxFavourite[]>('/prescriptions/favourites'),
  addFavourite: (data: unknown) => api<RxFavourite>('/prescriptions/favourites', { method: 'POST', body: JSON.stringify(data) }),
  removeFavourite: (id: string) => api(`/prescriptions/favourites/${id}`, { method: 'DELETE' }),
  addItem: (id: string, data: unknown) => api<AddItemResult>(`/prescriptions/${id}/items`, { method: 'POST', body: JSON.stringify(data) }),
  /** Correct one line. Returns the same { blocked, alerts } shape as addItem when the new drug
   *  trips an allergy, so the caller reuses the existing override prompt. */
  updateItem: (id: string, itemId: string, data: unknown) =>
    api<AddItemResult>(`/prescriptions/${id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** Remove one line. Refused on a signed prescription or an already-dispensed medicine. */
  removeItem: (id: string, itemId: string) =>
    api<{ removed: string; name: string }>(`/prescriptions/${id}/items/${itemId}`, { method: 'DELETE' }),
  sign: (id: string, signature: string) => api(`/prescriptions/${id}/sign`, { method: 'PUT', body: JSON.stringify({ signature }) }),
  dispense: (id: string, items: { itemId: string; qty: number }[]) =>
    api(`/prescriptions/${id}/dispense`, { method: 'POST', body: JSON.stringify({ items }) }),
  recommendPackage: (id: string, packageId: string, note?: string) => api(`/prescriptions/${id}/packages`, { method: 'POST', body: JSON.stringify({ packageId, note }) }),
  removeRecommendation: (recId: string) => api(`/prescriptions/package-recs/${recId}`, { method: 'DELETE' }),
  recommendations: (patientId: string) => api<PkgRec[]>(`/prescriptions/recommendations?patientId=${patientId}`),
};

export interface PkgRec { id: string; packageId: string; note: string | null; status: string; package: { id: string; name: string; kind: string; price: string | number; durationMonths: number | null } }

// ---- Outside medication: what the patient arrived on, and how their doses have moved ----
// Deliberately separate from prescriptionsApi — these are drugs prescribed elsewhere that we do
// not stock or dispense, so nothing here touches Prescription/PrescriptionItem or billing.

/** What the doctor is doing to the dose — the only reliable direction signal, since strengths
 *  are free text ("24/26mg", "100mcg/puff") and cannot be compared numerically. */
export type MedAction = 'increase' | 'reduce' | 'frequency' | 'stabilise' | 'stop' | 'restart';
export type MedStatus = 'active' | 'increasing' | 'tapering' | 'stopped';
/** cancelled = a human decided it was wrong. superseded = it was mechanically overtaken. */
export type ChangeState = 'planned' | 'applied' | 'cancelled' | 'superseded';

export interface ExternalMedicine {
  id: string; name: string; drugClass: string | null; form: string | null; strengths: string[];
}
/** A dose change the doctor recommended, which the patient has not been confirmed to have made. */
export interface PendingPlan {
  id: string;
  action: MedAction;
  toStrength: string | null;
  toFrequency: string | null;
  baselineStrength: string | null;
  baselineFrequency: string | null;
  plannedFor: string | null;
  reviewOn: string | null;
  reason: string | null;
  note: string | null;
  changedAt: string;
  /** The date the patient was told to change has arrived. */
  due: boolean;
  /** The dose moved since this was planned — confirm with care. */
  drifted: boolean;
}
export interface PatientMedication {
  id: string;
  drug: string;
  drugClass: string | null;
  externalMedicineId: string | null;
  /** Dose options from the catalogue entry — populates the strength dropdown. */
  strengths: string[];
  strength: string | null;
  frequency: string | null;
  status: MedStatus;
  prescribedBy: string | null;
  indication: string | null;
  startedOn: string | null;
  stoppedOn: string | null;
  notes: string | null;
  reviewOn: string | null;
  /** Review date reached and no later change has already served as the review. */
  reviewDue: boolean;
  /** Direction of the last applied move — 'stabilise' and 'never moved' both read as active. */
  lastAction: MedAction | null;
  pendingPlan: PendingPlan | null;
  changeCount: number;
  createdAt: string;
}
export interface MedicationChange {
  id: string; encounterId: string | null;
  state: ChangeState;
  action: MedAction | null;
  fromStrength: string | null; toStrength: string | null;
  fromFrequency: string | null; toFrequency: string | null;
  fromStatus: string | null; toStatus: MedStatus;
  baselineStrength: string | null; baselineFrequency: string | null;
  plannedFor: string | null; effectiveOn: string | null; reviewOn: string | null;
  appliedAt: string | null; appliedBy: string | null;
  stateReason: string | null; supersededById: string | null;
  reason: string | null; note: string | null;
  changedBy: string | null; changedAt: string;
}

export interface RecordChangeInput {
  action: MedAction;
  toStrength?: string;
  toFrequency?: string;
  /** A FUTURE date makes this a recommendation instead of a record. */
  plannedFor?: string;
  /** Back-date a change that already happened. */
  effectiveOn?: string;
  reviewOn?: string;
  reason?: string;
  note?: string;
  encounterId?: string;
}

export const medicationsApi = {
  /** The whole active outside-drug catalogue, uncapped. */
  catalogue: (q = '') => api<ExternalMedicine[]>(`/external-medicines${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  addToCatalogue: (data: { name: string; drugClass?: string; form?: string; strengths?: string[] }) =>
    api<ExternalMedicine>('/external-medicines', { method: 'POST', body: JSON.stringify(data) }),
  forPatient: (patientId: string) => api<PatientMedication[]>(`/patients/${patientId}/medications`),
  add: (patientId: string, data: unknown) =>
    api<{ id: string }>(`/patients/${patientId}/medications`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => api<{ id: string }>(`/medications/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** One dose move. `plannedFor` in the future raises a recommendation and leaves the patient's
   *  current dose alone; otherwise it records the change as already true. */
  recordChange: (id: string, data: RecordChangeInput) =>
    api<{ planned: boolean; id: string }>(`/medications/${id}/changes`, { method: 'POST', body: JSON.stringify(data) }),
  /** Confirm the patient actually made a recommended change. */
  applyChange: (changeId: string, data: { effectiveOn?: string; encounterId?: string } = {}) =>
    api<{ applied: boolean; alreadySettled?: boolean; superseded?: boolean; reason?: string }>(
      `/medication-changes/${changeId}/apply`, { method: 'POST', body: JSON.stringify(data) }),
  /** They didn't, or the doctor changed their mind. */
  cancelChange: (changeId: string, reason?: string) =>
    api<{ cancelled: boolean; alreadySettled: boolean }>(`/medication-changes/${changeId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  changes: (id: string) => api<MedicationChange[]>(`/medications/${id}/changes`),
  reviewDue: () => api<any[]>('/medications/review-due'),
  plansDue: () => api<any[]>('/medications/plans-due'),
};

export interface AppointmentSlot { start: string; end: string; free: boolean; reason?: string }
export interface SlotsResponse { date: string; closed: boolean; slotMin: number; durationMin: number; practitionerId: string | null; slots: AppointmentSlot[] }
export interface DayHours { closed?: boolean; open?: string; close?: string; breaks?: [string, string][] }
export interface ClinicHours {
  slotMin: number; defaultDurationMin: number; leadTimeMin: number; horizonDays: number;
  cancelCutoffMin: number; maxParallel: number;
  week: Record<string, DayHours>; closedDates: string[]; extraDates: Record<string, DayHours>;
  practitioners: Record<string, unknown>;
}
export interface AppointmentPatch {
  startsAt?: string; endsAt?: string; durationMin?: number;
  practitionerId?: string | null; resourceId?: string | null; serviceId?: string | null;
  status?: string; note?: string; acceptRescheduleRequest?: boolean; declineRescheduleRequest?: boolean;
}
/** A lead-desk appointment booked into a clinic — shown on the Schedule before the lead is a patient. */
export interface LeadBooking {
  id: string; fullName: string; phone: string;
  appointmentAt: string | null; status: string;
  diseaseInterest?: string | null; owner?: string | null;
}
export const schedulingApi = {
  resources: () => api<Resource[]>('/resources'),
  practitioners: () => api<Practitioner[]>('/practitioners'),
  appointments: (date: string, practitionerId?: string) =>
    api<Appointment[]>(`/appointments?date=${date}${practitionerId ? `&practitionerId=${practitionerId}` : ''}`),
  requests: () => api<Appointment[]>('/appointments/requests'),
  /** Lead-desk appointments booked into this clinic for the day (not yet patients). */
  leadBookings: (date: string) => api<LeadBooking[]>(`/appointments/lead-bookings?date=${date}`),
  slots: (p: { date: string; practitionerId?: string; resourceId?: string; serviceId?: string; durationMin?: number }) => {
    const q = new URLSearchParams({ date: p.date });
    if (p.practitionerId) q.set('practitionerId', p.practitionerId);
    if (p.resourceId) q.set('resourceId', p.resourceId);
    if (p.serviceId) q.set('serviceId', p.serviceId);
    if (p.durationMin) q.set('durationMin', String(p.durationMin));
    return api<SlotsResponse>(`/appointments/slots?${q.toString()}`);
  },
  update: (id: string, patch: AppointmentPatch) => api<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  hours: () => api<ClinicHours>('/appointments/hours'),
  setHours: (patch: Partial<ClinicHours>) => api<ClinicHours>('/appointments/hours', { method: 'PUT', body: JSON.stringify(patch) }),
  appointmentsForPatient: (patientId: string) => api<Appointment[]>(`/appointments?patientId=${patientId}`),
  book: (data: unknown) => api<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  series: (data: unknown) =>
    api<{ seriesId: string; created: number; skipped: string[] }>('/appointment-series', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  checkIn: (apptId: string) => api(`/appointments/${apptId}/check-in`, { method: 'POST' }),
  queue: () => api<QueueItem[]>('/queue'),
  call: (tokenId: string) => api(`/queue/${tokenId}/call`, { method: 'POST' }),
  advance: (tokenId: string, state: string) =>
    api(`/queue/${tokenId}/advance`, { method: 'POST', body: JSON.stringify({ state }) }),
};

// ---- inventory ----
export interface StockRow {
  medicineId: string; name: string; type?: string | null; manufacturer?: string | null;
  onHand: number; nearestExpiry?: string | null; min?: number | null; max?: number | null; belowReorder: boolean;
  critical?: number | null; status?: 'critical' | 'reorder' | 'ok' | null;
  avgDailyUse?: number | null; levelSource?: 'auto' | 'manual' | null;
  packs?: { id: string; label: string; salePrice: number; onHand: number }[];
}
export interface MedicinePackItem { id: string; packSize: number; unit: string; label: string; salePrice: number; gstRate: number; hsnSac?: string | null; mrp?: number | null; isActive: boolean }
export interface MedicineItem { id: string; name: string; type?: string | null; manufacturer?: string | null; isConsumable: boolean; salePrice?: number; gstRate?: number; hsnSac?: string | null; packs?: MedicinePackItem[] }
export interface SupplierItem { id: string; name: string; gmpStatus?: string | null; leadTimeMeanDays?: number | null; gstin?: string | null; contact?: string | null; isActive?: boolean }
export interface ReorderSuggestion { medicineId: string; name: string; onHand: number; min: number; max: number; critical: number; suggestedQty: number; lastCost: number }
export interface RecomputeLevelsResult {
  updated: number; skippedLowVolume: number;
  clinics: { clinicId: string; clinic: string; updated: number }[];
  unmatched: { description: string; qty90d: number }[];
}

// ---- services (M10) ----
export interface ServiceRow { id: string; name: string; type?: string | null; providerRole?: string | null; price: string | number; durationMin?: number | null; isActive?: boolean }
export interface BomRow { medicineId: string; medicine: string; qty: number }
export interface DeliveryRow { id: string; cost?: string | number | null; deliveredAt: string; service?: { name: string; price: string | number }; patient?: { fullName: string }; provider?: { fullName: string } | null }

export const servicesApi = {
  /** `includeInactive` is for the catalogue screen only — every selling surface wants live rows. */
  list: (includeInactive = false) => api<ServiceRow[]>(`/services${includeInactive ? '?includeInactive=1' : ''}`),
  create: (data: unknown) => api<ServiceRow>('/services', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => api<ServiceRow>(`/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** Soft retire — the row survives so old bills and deliveries still read correctly. */
  remove: (id: string) => api<ServiceRow & { pastDeliveries: number; upcomingAppointments: number }>(`/services/${id}`, { method: 'DELETE' }),
  restore: (id: string) => api<ServiceRow>(`/services/${id}/restore`, { method: 'POST' }),
  getBom: (id: string) => api<BomRow[]>(`/services/${id}/bom`),
  setBom: (id: string, items: { medicineId: string; qty: number }[]) => api(`/services/${id}/bom`, { method: 'PUT', body: JSON.stringify({ items }) }),
  deliver: (data: unknown) => api<{ id: string; cost: number; price: number }>('/service-deliveries', { method: 'POST', body: JSON.stringify(data) }),
  deliveries: () => api<DeliveryRow[]>('/service-deliveries'),
};

export const inventoryApi = {
  medicines: (q = '') => api<MedicineItem[]>(`/medicines${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  /** Every active consumable, uncapped — the plain list is limited to 100 rows by name. */
  consumables: () => api<MedicineItem[]>('/medicines?consumable=1'),
  manufacturers: () => api<{ id: string; name: string }[]>('/manufacturers'),
  stock: () => api<StockRow[]>('/stock'),
  expiring: (days = 30) => api<any[]>(`/stock/expiring?days=${days}`),
  grn: (data: unknown) => api<{ id: string; items: number }>('/grn', { method: 'POST', body: JSON.stringify(data) }),
  consume: (data: unknown) => api('/stock/consume', { method: 'POST', body: JSON.stringify(data) }),
  createMedicine: (data: unknown) => api('/medicines', { method: 'POST', body: JSON.stringify(data) }),
  // pack variants
  packs: (medicineId: string) => api<MedicinePackItem[]>(`/medicines/${medicineId}/packs`),
  createPack: (medicineId: string, data: unknown) => api<MedicinePackItem>(`/medicines/${medicineId}/packs`, { method: 'POST', body: JSON.stringify(data) }),
  updatePack: (packId: string, data: unknown) => api<MedicinePackItem>(`/packs/${packId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePack: (packId: string) => api<{ ok: boolean }>(`/packs/${packId}`, { method: 'DELETE' }),
  // raise PO (auto-filled from reorder levels)
  suppliers: () => api<SupplierItem[]>('/suppliers'),
  allSuppliers: () => api<SupplierItem[]>('/suppliers/all'),
  createSupplier: (data: unknown) => api<SupplierItem>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: unknown) => api<SupplierItem>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  reorderSuggest: () => api<ReorderSuggestion[]>('/purchase-orders/suggest'),
  createPo: (data: unknown) => api<{ id: string; items: number; status: string }>('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  // auto-computed critical/reorder/max levels
  setReorderRule: (data: { medicineId: string; minQty: number; maxQty: number; criticalQty?: number }) =>
    api<{ id: string; source: string }>('/reorder-rules', { method: 'POST', body: JSON.stringify(data) }),
  recomputeLevels: (all = false) => api<RecomputeLevelsResult>('/inventory/levels/recompute', { method: 'POST', body: JSON.stringify({ all }) }),
  // O7 goods receipt & QC
  openPos: () => api<OpenPo[]>('/purchase-orders/open'),
  receive: (data: unknown) => api<{ id: string; items: number }>('/grn/receive', { method: 'POST', body: JSON.stringify(data) }),
  qcQueue: () => api<QcBatch[]>('/qc/queue'),
  qcDecision: (batchId: string, decision: 'release' | 'quarantine' | 'reject', note?: string) =>
    api(`/batches/${batchId}/qc`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  // O5 batch traceability & recall
  searchBatches: (q = '') => api<TraceBatch[]>(`/batches${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  batchRecall: (batchId: string) => api<any>(`/batches/${batchId}/recall`),
  /** Every medicine this patient has taken, chain-wide, tagged with the dispensing clinic. */
  patientBatches: (patientId: string) => api<{ batchNo: string; medicine: string; qty: number; at: string; qcStatus: string; clinic: string | null }[]>(`/patients/${patientId}/batches`),
  // O8 cycle count / O9 picking / O10 storage env
  countSchedule: () => api<any>('/cycle-count/schedule'),
  recordCount: (data: unknown) => api('/cycle-count', { method: 'POST', body: JSON.stringify(data) }),
  pickingList: (days = 2) => api<any>(`/picking-list?days=${days}`),
  envLog: () => api<any>('/storage-env'),
  recordEnv: (data: unknown) => api('/storage-env', { method: 'POST', body: JSON.stringify(data) }),
};

// ---- monthly physical stock audit ----
export interface StockAuditRow {
  /** 'review' = counting closed, discrepancy list waiting for an approver. 'signed' = approved AND posted to stock. */
  id: string; clinicId: string; periodMonth: string; status: 'open' | 'counting' | 'review' | 'signed';
  openedBy: string | null; openedAt: string;
  counter1By: string | null; counter1At: string | null; counter2By: string | null; counter2At: string | null;
  signedBy: string | null; signedAt: string | null; signedNote: string | null;
  itemsCounted: number; mismatchCount: number; netVarianceValue: number;
  /** Who was at the clinic during the count, as stated by the auditor — never derived. */
  teamPresent: { userId: string | null; name: string; role: string | null }[] | null;
}
export interface StockAuditCountLine {
  id: string; medicineId: string; medicine: string; systemQty: number; countedQty: number; variance: number;
  mismatch: boolean; countedBy: string | null; countedAt: string; note: string | null;
  unitCost: number | null; value: number;
  /** A later re-count replaced this line; kept for the trail but not applied. */
  superseded: boolean;
}

/** One row of the count sheet — a SKU to walk to the shelf and count. */
export interface StockSheetRow {
  medicineId: string; name: string; onHand: number; hasNegative: boolean; lots: number;
  countedQty: number | null; countedAt: string | null; countedBy: string | null; note: string | null;
}
export interface StockAuditDetail extends StockAuditRow {
  openedByName: string | null; counter1Name: string | null; counter2Name: string | null; signedByName: string | null;
  clinic: ClinicHeader | null;
  /** Loss and gain are reported separately on purpose — a net of zero can hide ₹50,000 each way. */
  lossValue: number; gainValue: number; netValue: number;
  countedSkus: number;
  /** Sheet items with no count. Approval is refused while this is non-empty. */
  uncounted: { medicineId: string; name: string; onHand: number }[];
  /** Who counted how many items — different people may count different parts of the sheet. */
  counters: { name: string; items: number }[];
  counts: StockAuditCountLine[];
}
export const stockAuditApi = {
  list: () => api<StockAuditRow[]>('/stock-audit'),
  current: () => api<StockAuditDetail | null>('/stock-audit/current'),
  open: () => api<StockAuditRow & { created: boolean }>('/stock-audit/open', { method: 'POST' }),
  attest: (id: string) => api<StockAuditRow & { alreadyAttested?: boolean }>(`/stock-audit/${id}/attest`, { method: 'POST' }),
  detail: (id: string) => api<StockAuditDetail>(`/stock-audit/${id}`),
  sheet: (id: string) => api<StockSheetRow[]>(`/stock-audit/${id}/sheet`),
  saveCounts: (id: string, lines: { medicineId: string; countedQty: number; note?: string }[]) =>
    api<{ saved: number; uncounted: number; countedAt: string }>(`/stock-audit/${id}/counts`, { method: 'POST', body: JSON.stringify({ lines }) }),
  uncounted: (id: string) => api<{ medicineId: string; name: string; onHand: number }[]>(`/stock-audit/${id}/uncounted`),
  team: (id: string, team: { userId?: string; name: string; role?: string }[]) =>
    api<StockAuditRow>(`/stock-audit/${id}/team`, { method: 'POST', body: JSON.stringify({ team }) }),
  /** Approve AND post every variance to stock — this is what moves stock, not the counting. */
  sign: (id: string, note?: string) => api<StockAuditDetail & { alreadyPosted?: boolean }>(`/stock-audit/${id}/sign`, { method: 'POST', body: JSON.stringify({ note }) }),
};

export interface TraceBatch { batchId: string; medicine: string; batchNo: string; qcStatus: string; expiry: string | null; qtyOnHand: number; supplier: string | null; coaRef: string | null; heavyMetal: string | null; requiresCoa: boolean }

export interface OpenPoItem { poItemId: string; medicineId: string; medicine: string; requiresCoa: boolean; qty: number; qtyReceived: number; outstanding: number; unitPrice: number }
export interface OpenPo { id: string; supplier: string | null; supplierId: string | null; status: string; orderedAt: string; expectedDate: string | null; items: OpenPoItem[] }
export interface QcBatch { batchId: string; medicine: string; batchNo: string; qty: number; expiry: string | null; qcStatus: string; coaRef: string | null; heavyMetal: string | null; supplier: string | null; requiresCoa: boolean }

// ---- billing (M11) ----
export interface BillLineView {
  description: string; hsnSac?: string | null; qty: string | number; unitPrice: string | number;
  /** Rupees knocked off this line. The invoice shows list price → discount → net. */
  discount?: string | number;
  /** medicine | prescription_item | service | package. Already in the payload (`lines: true`);
   *  the invoice uses it to list dispensed medicines separately, without prices. */
  sourceType?: string;
  gstRate: string | number; cgst: string | number; sgst: string | number; igst: string | number; amount: string | number;
}
export interface ClinicHeader { name: string; code: string; gstin?: string | null; address?: string | null; phone?: string | null }
export interface Bill {
  id: string; number: string; total: string | number; taxTotal: string | number; payState: string;
  placeOfSupply?: string | null;
  /** Next follow-up date the desk picked at checkout (YYYY-MM-DD). */
  nextFollowupOn?: string | null;
  /** Paise added to round the total UP to a whole rupee (0 when none). */
  roundOff?: number | string | null; gstin?: string | null; createdAt?: string; discountTotal?: string | number;
  discountPct?: string | number; discountApproval?: string;
  paidAmount?: string | number;
  /** Balance the clinic gave up collecting. The invoice still shows the ORIGINAL total — this is
   *  shown as its own line so a closed bill never prints "balance due". */
  writeOffAmount?: string | number;
  writtenOffAt?: string | null;
  writeOffReason?: string | null;
  lines: BillLineView[];
  clinic?: ClinicHeader;
  patient?: { fullName: string; phone?: string | null; identifiers?: { value: string }[] };
  /** Who saw the patient, from their encounter at this clinic — null for a walk-in with no visit. */
  practitioner?: string | null;
  practitionerAt?: string | null;
  /** True only when that person holds a clinical role; gates the "Dr." + AYUSH-practitioner claim. */
  practitionerClinical?: boolean;
  /** Who raised the bill, and who took the money. `role` is the raw role name; the UI labels it. */
  raisedBy?: { name: string; role: string | null } | null;
  collectedBy?: { name: string; role: string | null } | null;
  /** Value on this bill paid out of a protocol pool. NOT part of `total` — the patient owes total. */
  coveredTotal?: string | number;
  /** Set on the create/checkout response when a protocol absorbed part of this bill. */
  coverage?: { saleId: string; name: string; spent: number } | null;
}
/** What was on a bill. Shipped with the list, so expanding a row costs no round trip. */
export interface BillLineItem {
  id: string; description: string; sourceType: string;
  qty: string | number; unitPrice: string | number; discount: string | number;
  gstRate: string | number; amount: string | number;
  /** Rupees of this line the protocol paid; `amount` is already net of it. */
  coveredAmount?: string | number;
  packageSaleId?: string | null;
}
export interface BillListItem {
  id: string; number: string; total: string | number; paidAmount?: string | number;
  discountTotal?: string | number; taxTotal?: string | number;
  payState: string; dueDate?: string | null; createdAt: string;
  writeOffAmount?: string | number; writtenOffAt?: string | null; writeOffReason?: string | null;
  pendingChange?: PendingBillChange; clinic?: HomeClinicTag | null;
  lines?: BillLineItem[];
  coveredTotal?: string | number;
}
/**
 * A money decision queued on a bill. The VALUE matters, not just its presence:
 *   'void'     — the bill is about to be deleted, so the counter must NOT collect against it
 *   'writeoff' — the balance may be given up, but collection stays open; if the patient pays after
 *                all, take the money (the write-off is re-clamped to the real balance on approval)
 * Anything gating the Collect button must test for 'void' specifically, never truthiness.
 */
export type PendingBillChange = 'void' | 'writeoff' | null;

export interface Installment { seq: number; dueAt: string; amount: number | string; state: string; note?: string | null }
export interface DueBill {
  id: string; number: string; patientId: string; patient: string; phone: string | null;
  total: number; paidAmount: number; writeOffAmount: number; outstanding: number; payState: string;
  dueDate: string | null; createdAt: string; overdue: boolean;
  nextInstallment: { seq: number; dueAt: string; amount: number } | null;
  installments: Installment[];
  /** Set when a deletion OR a write-off is already queued — do not offer to request another. */
  pendingChange: PendingBillChange;
}
export interface DuesExportRow {
  Clinic: string; ClinicCode: string; BillNo: string; BillDate: string;
  Patient: string; FileNo: string; MRN: string; Phone: string; Category: string;
  BillTotal: string; Paid: string; WrittenOff: string; Outstanding: string; Status: string;
  DueDate: string; DaysOverdue: number; NextInstalmentDate: string; NextInstalmentAmt: string;
}
export interface DuesExport {
  generatedAt: string;
  totalBills: number;
  totalOutstanding: number;
  byClinic: Record<string, { bills: number; outstanding: number }>;
  rows: DuesExportRow[];
}

/** A protocol's outstanding balance — the second leg of the dues worklist (new-model sales). */
export interface ProtocolDue {
  saleId: string; patientId: string; patient: string; phone: string | null;
  protocol: string; priceDue: number; collected: number; outstanding: number;
  soldAt: string; payByDate: string; months: number; requiresFullPayment: boolean; overdue: boolean;
}
/** A patient owing on their account (restructured legacy dues) — the third leg. */
export interface AccountDebit {
  patientId: string; patient: string; phone: string | null;
  owed: number; oldestDue: string | null; overdue: boolean;
}
export interface DuesSummary {
  totalOutstanding: number; overdueCount: number; bills: DueBill[];
  protocolDues: ProtocolDue[]; accountDebits: AccountDebit[];
}
export interface SuggestedLine { sourceType: string; sourceId?: string; description: string; qty: number; unitPrice: number; gstRate: number }
export interface BillablePack { id: string; label: string; packSize: number; unit: string; salePrice: number; gstRate: number; hsnSac?: string | null; onHand: number }
export interface BillableMedicine { id: string; name: string; type?: string | null; salePrice: number; gstRate: number; hsnSac?: string | null; onHand: number; packs?: BillablePack[] }
export interface BillableService { id: string; name: string; type?: string | null; price: number; gstRate: number }
export interface BillCatalog { medicines: BillableMedicine[]; services: BillableService[] }
export interface BillableLine { sourceType: string; sourceId?: string; description: string; qty: number; unitPrice: number; gstRate: number; hsnSac?: string | null }
export interface Billables { services: BillableLine[]; prescriptionItems: BillableLine[] }

/** A row of the Deleted bills register — read from bill_archive, where voided bills are stored separately. */
export interface VoidedBill {
  id: string; billId: string; number: string; patient: string | null; total: number;
  /** ₹ collected on the bill when it was deleted. The deletion refunds it and drops it from every
   *  total, so this register is the only remaining record that it was ever taken. */
  collected: number;
  reason: string; requestedBy: string | null; approvedBy: string | null;
  voidedAt: string; createdAt: string | null;
}
/** A medicine sold with no lot on record — the bill still goes through, Inventory must reconcile. */
export interface Shortage { medicineId: string; medicine: string; need: number; onHand: number; short: number }
export interface PaymentHistoryRow {
  id: string; orderId: string; at: string; kind: 'payment' | 'refund';
  method: string; amount: number; reference: string | null; by: string | null;
  verified: boolean; reason?: string | null;
}
export interface PaymentHistory { collected: number; rows: PaymentHistoryRow[] }
export interface DaySheet {
  date: string; collected: number; refunded: number; net: number;
  byMethod: { method: string; count: number; amount: number }[];
  payments: { at: string; method: string; amount: number; reference: string | null; bill: string; patient: string }[];
  refunds: { at: string; amount: number; reason: string | null; bill: string }[];
  billsRaised: { count: number; gross: number; tax: number; discount: number };
  voided: { number: string; total: number; patient: string; reason: string | null; at: string }[];
}

export interface BillHistoryRow {
  id: string; number: string; createdAt: string;
  patientId: string; patient: string; phone: string | null;
  lineCount: number;
  total: number; paid: number; writtenOff: number; balance: number;
  /** Collected within the searched date window; null when no window was set. */
  paidInPeriod: number | null;
  payState: string; discountTotal: number;
  writeOffReason?: string | null; writtenOffAt?: string | null;
  raisedBy: string | null;
  pendingChange?: PendingBillChange;
  /** How the bill was settled. Empty while unpaid; more than one entry on a split payment. */
  modes: { mode: string; amount: number }[];
}

/** Cash/UPI/card totals for exactly the bills listed alongside them. */
export interface BillHistory {
  rows: BillHistoryRow[];
  byMode: { mode: string; count: number; amount: number }[];
}

/** Result of requesting a bill deletion — always queued for accounts approval. */
export interface BillChangeResult {
  applied: boolean; // always false now; kept for response-shape stability
  approval?: { id: string; approverRole: string; note?: string | null };
}

/** Result of requesting a write-off — always queued. `amount` is what the server accepted after
 *  clamping to the real outstanding, which can be less than what was asked for. */
export interface BillWriteOffResult extends BillChangeResult {
  amount: number;
  outstanding: number;
}

export const billingApi = {
  create: (data: unknown) => api<Bill & { shortages?: Shortage[] }>('/bills', { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) => api<Bill & { total: number | string }>(`/bills/${id}`),
  list: (patientId: string) => api<BillListItem[]>(`/bills?patientId=${patientId}`),
  suggest: (patientId: string) => api<SuggestedLine[]>(`/bills/suggest?patientId=${patientId}`),
  catalog: () => api<BillCatalog>('/bills/catalog'),
  billables: (patientId: string) => api<Billables>(`/bills/billables?patientId=${patientId}`),
  /** Request a bill's DELETION (bills are never editable). Always queues for a second person from
   *  accounts — accountant within their ₹ cap, senior accountant above. */
  requestVoid: (id: string, reason: string) =>
    api<BillChangeResult>(`/bills/${id}/void-request`, { method: 'POST', body: JSON.stringify({ reason }) }),
  /** Delete the bill outright — no queue, no second person. Needs billing_void:edit (admin,
   *  senior doctor, medical director). Still refused if any money has been collected. */
  voidNow: (id: string, reason: string) =>
    api<{ ok: boolean; id: string; payState: string; direct: boolean; closedRequest: string | null }>(
      `/bills/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  /**
   * Give up on a balance that will never be collected — the patient took their medicine and stopped
   * the rest of the treatment. ALWAYS queues for a second person; there is no direct route.
   * `amount` omitted = the whole outstanding. Nothing moves: no refund, no stock, no change to the
   * invoice total.
   */
  requestWriteOff: (id: string, data: { amount?: number; reason: string }) =>
    api<BillWriteOffResult>(`/bills/${id}/writeoff-request`, { method: 'POST', body: JSON.stringify(data) }),
  voided: () => api<VoidedBill[]>('/bills/voided'),
  changeLimits: () => api<{ approverRole: string; caps: Record<string, number> }>('/bills/rules/bill-change-limits'),
  setChangeLimits: (data: { caps?: Record<string, number>; approverRole?: string }) =>
    api<{ approverRole: string; caps: Record<string, number> }>('/bills/rules/bill-change-limits', { method: 'PUT', body: JSON.stringify(data) }),
  /** Read-only look-back over every bill raised at this clinic. Gated billing:view. */
  history: (f: { q?: string; from?: string; to?: string; payState?: string } = {}) => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return api<BillHistory>(`/bills/history${p.toString() ? `?${p}` : ''}`);
  },
  discountLimits: () => api<{ approverRole: string; caps: Record<string, number> }>('/bills/rules/discount-limits'),
  /** The signed-in user's own discount ceiling — lets the counter warn before raising the bill. */
  myDiscountCap: () => api<{ cap: number; approverRole: string }>('/bills/rules/my-discount-cap'),
  visitingCharge: () => api<{ amount: number; upiId: string; upiName: string; razorpay: boolean }>('/bills/rules/visiting-charge'),
  setVisitingCharge: (data: { amount?: number; upiId?: string; upiName?: string; razorpay?: boolean }) =>
    api<{ amount: number; upiId: string; upiName: string; razorpay: boolean }>('/bills/rules/visiting-charge', { method: 'PUT', body: JSON.stringify(data) }),
  dues: () => api<DuesSummary>('/bills/dues'),
  /** Recovery sheet across EVERY clinic the user can see, uncapped — for the CSV download. */
  duesExport: () => api<DuesExport>('/bills/dues/export'),
  daysheet: (date?: string) => api<DaySheet>(`/bills/daysheet${date ? `?date=${date}` : ''}`),
  setPaymentPlan: (id: string, data: { dueDate?: string | null; installments?: { dueAt: string; amount: number; note?: string }[] }) =>
    api<{ billId: string; dueDate: string | null; outstanding: number; installments: Installment[] }>(`/bills/${id}/payment-plan`, { method: 'PUT', body: JSON.stringify(data) }),
  setDiscountLimits: (data: { caps?: Record<string, number>; approverRole?: string }) =>
    api<{ approverRole: string; caps: Record<string, number> }>('/bills/rules/discount-limits', { method: 'PUT', body: JSON.stringify(data) }),
  /** No-negative-stock billing block, per clinic. Off by default; a clinic's first signed monthly
   *  audit turns it on automatically — this is the read + admin manual override. */
  inventoryBlock: () => api<{ clinicId: string; enforce: boolean }>('/bills/rules/inventory-block'),
  setInventoryBlock: (enforce: boolean) => api<{ clinicId: string; enforce: boolean }>('/bills/rules/inventory-block', { method: 'PUT', body: JSON.stringify({ enforce }) }),
};

// Unified checkout — medicines + services + packages + prescription → ONE bill.
export const checkoutApi = {
  create: (data: unknown) => api<Bill>('/checkout', { method: 'POST', body: JSON.stringify(data) }),
};

// Public, token-gated invoice view (patient share link — no auth).
export interface VisitSlipData {
  bookingRef: string; visitAt: string; apptStatus: string; status: string;
  patient: { name: string; phone?: string | null; sex?: string | null; dob?: string | null; mrn?: string | null };
  clinic: { name: string; address?: string | null; phone?: string | null };
  amount?: number | null; paidAmount?: number | null; billNumber?: string | null;
}
/** What the public landing page is allowed to know. `stats` is null below the small-sample floor. */
export interface PublicTestimonials {
  stats: { patients: number; ratings: number; notes: number; overall: number | null; positivePct: number } | null;
  testimonials: { name: string; date: string; overall: number; comment: string }[];
}

export const publicApi = {
  bill: (id: string, token: string) => api<Bill>(`/public/bills/${id}?token=${encodeURIComponent(token)}`),
  visit: (id: string, token: string) => api<VisitSlipData>(`/portal/visit/${id}?t=${encodeURIComponent(token)}`),
  /**
   * Deliberately a bare fetch, not api(). api() attaches whatever bearer token happens to be in
   * localStorage, so a logged-in staff member browsing the marketing page would send their
   * credentials to an endpoint that has no business seeing them.
   */
  testimonials: async (): Promise<PublicTestimonials> => {
    const res = await fetch('/v1/public/testimonials');
    if (!res.ok) throw new ApiError(res.status, null);
    return res.json();
  },
};

// ---- CRM / leads (M14/M15) ----
export interface LeadRow {
  id: string; fullName: string; phone: string; email?: string | null;
  /** Where the lead came from — admin-only. The API returns null for these on every non-admin
   *  login, so the desk sees the enquiry, never the ad spend behind it. */
  source?: string | null; sourceDetail?: string | null;
  campaignName?: string | null; adName?: string | null; landingUrl?: string | null;
  status: string; owner?: string | null; ownerId?: string | null;
  nextActionAt?: string | null; createdAt: string; overdue: boolean; convertedPatientId?: string | null;
  callStatus?: string | null; appointmentAt?: string | null;
  lostReason?: string | null;
  /** The lead's most recent free-text note, for the table's Note column (null when it has none). */
  lastNote?: string | null;
  /** Triage: null = still with the telecalling team; set when a telecaller sent it to a clinic. */
  routedToClinicAt?: string | null;
  /** Who routed it. Null on backfilled/auto leads — those may still be routed by any telecaller. */
  routedById?: string | null;
  /** Make's clinic hint — preselects the Send-to-clinic dropdown, never auto-routes. */
  suggestedClinicId?: string | null;
  /** Set once someone marks this lead junk — who, so the junk-review worklist has context. */
  junkMarkedBy?: string | null; junkMarkedAt?: string | null;
  /** A registered patient carrying this lead's number (chain-wide) — shown in place of the
   *  "Inbound +91…" placeholder on inbound-call leads. */
  matchedPatient?: { id: string; fullName: string } | null;
  /** Escalation marks: handed to Level 2 by the daily cutoff job / flagged to Level 3 as untouched. */
  escalatedToL2At?: string | null; escalatedToL3At?: string | null;
  /** The three-level desk. 1 = awaiting qualification at Level 1, 2 = qualified and being worked. */
  level?: number;
  qualifiedAt?: string | null; qualifiedBy?: string | null;
  /** Response SLA. `slaBreached` is computed server-side so the rule and the badge can never disagree. */
  responseDueAt?: string | null; respondedAt?: string | null; slaBreached?: boolean;
  appointmentClinicId?: string | null;
  /** Set automatically when the patient actually attended — matched on phone number. */
  visitedAt?: string | null;
}
export type LeadRuleKind = 'lead_assignment' | 'lead_sla' | 'lead_followup' | 'lead_transfer' | 'call_targets' | 'lead_response_sla';

/** How long the desk has to attend a lead. Times are IST 'HH:MM'; workingDays are 0=Sun…6=Sat. */
export interface ResponseSlaConfig {
  enabled: boolean;
  dayStart: string;
  dayEnd: string;
  withinMin: number;
  nextDayBy: string;
  workingDays: number[];
}

export interface LevelPerson {
  userId: string; name: string;
  received: number; qualified: number; pending: number;
  slaMet: number; slaBreached: number; slaPct: number;
  medianMinutes: number | null;
  junkMarked: number; junkReopened: number;
  contacted: number; followUps: number; appointments: number;
  visited: number; converted: number; lost: number; conversionPct: number;
}
export interface LeadProductivity {
  range: { from: string; to: string; clamped: boolean };
  scope: string;
  levels: { level: 1 | 2; people: LevelPerson[]; totals: Omit<LevelPerson, 'userId' | 'name'> }[];
  /** Unattended leads whose deadline has already passed — the number to act on right now. */
  liveBreaches: number;
}

/** Signals from the phone-dedupe gate in leads.create() — same number, no duplicate row created. */
export interface LeadCreateResult extends Partial<LeadRow> {
  deduped?: boolean; reopened?: boolean; isPatient?: boolean; existingPatientId?: string | null; leadId?: string;
}
export interface LeadFunnel { total: number; new: number; junk: number; contacted: number; followUp: number; appointment: number; visited: number; lost: number; converted: number; overdue: number; junkReview: number; conversionRate: number; triage: number; slaDue: number; escalated?: number; byLevel?: Record<number, number>; /** Arrived today on the IST calendar, whatever stage they are at now. */ newToday?: number }
export interface LeadActivityRow { id: string; type: string; body: string; createdAt: string; user?: { fullName: string } | null }
export interface DueFollowup { id: string; fullName: string; phone: string; status: string; owner?: string | null; nextActionAt?: string | null; overdue: boolean }
export interface LeadCall {
  id: string; leadId?: string | null; direction: string; provider: string; status: string; disposition?: string | null;
  durationSec?: number | null; talkTimeSec?: number | null; hasRecording: boolean; agent?: string | null; startedAt: string;
}
/** An existing patient who rang in and is waiting for a clinic to call them back. */
export interface PatientCallbackRow {
  id: string; leadId: string; patientId: string; clinicId: string;
  clinic: string | null;
  name: string; phone: string;
  requestedAt: string; dueAt: string | null; note: string | null;
  assignedTo: string | null; resolvedAt: string | null; escalatedAt: string | null;
  /** Names, not uuids — whoever picks this up must see who put it on them without asking around. */
  assignedToName: string | null; requestedByName: string | null;
  resolvedByName: string | null; resolvedNote: string | null;
  /** Derived server-side from dueAt, never stored — editing the SLA rule re-answers it. */
  breached: boolean;
}

/** The hand-over as the lead card shows it: which clinic was asked, by whom, and by when. */
export interface LeadPatientCallback {
  id: string; clinicId: string; clinic: string | null;
  requestedAt: string; requestedByName: string | null;
  assignedTo: string | null; assignedToName: string | null;
  dueAt: string | null; note: string | null;
  resolvedAt: string | null; resolvedByName: string | null; resolvedNote: string | null;
  escalatedAt: string | null; breached: boolean;
}

export interface LeadDetail extends LeadRow {
  ownerId?: string | null; lostReason?: string | null;
  area?: string | null; diseaseInterest?: string | null; gender?: string | null; age?: number | null;
  externalRef?: string | null; utm?: Record<string, string> | null;
  activities: LeadActivityRow[];
  calls?: LeadCall[];
  patientCallbacks?: LeadPatientCallback[];
}
// ---- staff notification bell ----
export interface StaffNotification {
  id: string; clinicId: string; kind: string; body: string; status: string;
  patientId?: string | null; providerRef?: string | null; readAt?: string | null; createdAt: string;
}
export const notificationsApi = {
  mine: () => api<{ items: StaffNotification[]; unread: number }>('/notifications/mine'),
  readAll: () => api<{ count: number }>('/notifications/mine/read-all', { method: 'POST' }),
};

/**
 * Staff push registration. No web caller — a browser has no Expo push token — but it lives here so
 * the mobile apps inherit the same auth headers, error type and base URL as every other call.
 */
export const pushApi = {
  register: (data: { deviceId: string; token: string; platform?: string }) =>
    api<{ ok: boolean; reason?: string }>('/push/register', { method: 'POST', body: JSON.stringify(data) }),
  unregister: (deviceId: string) =>
    api<{ ok: boolean; reason?: string }>('/push/register', { method: 'DELETE', body: JSON.stringify({ deviceId }) }),
};

/** The desk level the user is "working as" on the Leads page (1|2|3). Every lead write carries it
 *  as `asLevel`, so the log is stamped and the lead moves to that level. */
let leadWorkLevel: number | null = null;
export function setLeadWorkLevel(l: number | null) { leadWorkLevel = l; }
export const leadsApi = {
  list: (qs = '') => api<LeadRow[]>(`/leads${qs}`),
  funnel: () => api<LeadFunnel>('/leads/funnel'),
  /** Last-call outcomes present in the caller's leads, commonest first, with a count each. */
  callOutcomes: () => api<{ value: string; count: number }[]>('/leads/call-outcomes'),
  get: (id: string) => api<LeadDetail>(`/leads/${id}`),
  create: (data: unknown) => api<LeadCreateResult>('/leads', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => api(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ asLevel: leadWorkLevel ?? undefined, ...(data as object) }) }),
  addActivity: (id: string, data: unknown) => api(`/leads/${id}/activities`, { method: 'POST', body: JSON.stringify({ asLevel: leadWorkLevel ?? undefined, ...(data as object) }) }),
  convert: (id: string, data: unknown = {}) => api<{ patientId: string; already: boolean; linkedExisting?: boolean }>(`/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
  call: (id: string) => api<{ callRef: string; status: string; provider: string; error?: string; callId?: string; leg?: 'toolbar' | 'phone'; fellBack?: string; duplicateOf?: string; suppressed?: true; inFlight?: true; invalidNumber?: true }>(`/leads/${id}/call`, { method: 'POST' }),
  outcome: (id: string, data: { disposition: string; connected?: boolean; note?: string; status?: string; nextActionAt?: string | null }) =>
    api<{ nextActionAt?: string | null }>(`/leads/${id}/outcome`, { method: 'POST', body: JSON.stringify({ asLevel: leadWorkLevel ?? undefined, ...data }) }),
  due: (withinHours?: number) => api<DueFollowup[]>(`/leads/due${withinHours ? `?withinHours=${withinHours}` : ''}`),
  assign: (id: string, data: { ownerId?: string }) => api(`/leads/${id}/assign`, { method: 'POST', body: JSON.stringify(data) }),
  statsSeries: (days = 14) => api<{ days: { date: string; created: number; converted: number }[] }>(`/leads/stats-series?days=${days}`),
  bulk: (data: { ids: string[]; status?: string; nextActionAt?: string; ownerId?: string; lostReason?: string }) =>
    api<{ updated: number; failed: string[] }>('/leads/bulk', { method: 'POST', body: JSON.stringify(data) }),
  transfer: (data: { fromOwnerId?: string; leadIds?: string[]; toOwnerId?: string; statusIn?: string[]; note?: string }) =>
    api<{ moved: number; failed: string[] }>('/leads/transfer', { method: 'POST', body: JSON.stringify(data) }),
  getRules: (kind: LeadRuleKind) => api<any>(`/leads/rules/${kind}`),
  putRules: (kind: LeadRuleKind, config: Record<string, unknown>) =>
    api(`/leads/rules/${kind}`, { method: 'PUT', body: JSON.stringify({ config }) }),
  /** Level 3's scorecard over both levels — per person and rolled up. */
  productivity: (from?: string, to?: string) =>
    api<LeadProductivity>(`/leads/productivity${from || to ? `?from=${from ?? ''}&to=${to ?? ''}` : ''}`),
  // The reviewer's verdict on a lead marked junk by someone else (see the 'junk_review' segment).
  junkReview: (id: string, verdict: 'confirmed' | 'reopened', note?: string) =>
    api<LeadDetail>(`/leads/${id}/junk-review`, { method: 'POST', body: JSON.stringify({ verdict, note }) }),
  /** The telecaller's hand-over: send a qualified lead to its clinic. */
  routeClinic: (id: string, data: { clinicId: string; note?: string }) =>
    api<LeadRow & { owner?: string | null; via?: string }>(`/leads/${id}/route-clinic`, { method: 'POST', body: JSON.stringify(data) }),
  /**
   * The caller is already a patient and wants this clinic to ring them back. Not a qualification:
   * the lead does not move through the desk, the clinic is simply told, on a 30-minute clock.
   */
  patientCallback: (id: string, data: { clinicId: string; patientId?: string; note?: string }) =>
    api<{ id: string; clinic: string; patientName: string; dueAt: string | null }>(`/leads/${id}/patient-callback`, { method: 'POST', body: JSON.stringify(data) }),
  resolvePatientCallback: (cbId: string, note?: string) =>
    api<PatientCallbackRow>(`/leads/patient-callbacks/${cbId}/resolve`, { method: 'POST', body: JSON.stringify({ note }) }),
  patientCallbacks: (includeResolved?: boolean) =>
    api<PatientCallbackRow[]>('/leads/patient-callbacks' + (includeResolved ? '?includeResolved=true' : '')),
  /** Active clinics for the Send-to-clinic dropdown. */
  routeTargets: () => api<{ id: string; code: string; name: string }[]>('/leads/route-targets'),
  journey: (from?: string, to?: string) =>
    api<LeadJourney>(`/leads/journey${from || to ? `?from=${from ?? ''}&to=${to ?? ''}` : ''}`),
  journeyStrip: () => api<JourneyStrip>('/leads/journey/strip'),
  journeyCsv: async (from?: string, to?: string): Promise<void> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const clinic = getClinic();
    if (clinic) headers['X-Clinic-Id'] = clinic;
    const res = await fetch(`${P().baseUrl}/v1/leads/journey.csv?from=${from ?? ''}&to=${to ?? ''}`, { headers });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'lead-journey.csv';
    await P().saveBlob(await res.blob(), name);
  },
};

// ---- Lead journey: the accountability report (BI CRM tab + the Leads-page strip) ----
export interface JourneyStrip { inTriage: number; unassigned: number; neverCalled: number; routedToday: number; firstCallHours: number }
export interface JourneyDay {
  date: string; arrived: number; calledWithin: number; calledLater: number; neverCalled: number;
  routed: number; converted: number; junked: number;
  channels: Record<string, number>; deliveriesLost: number;
}
export interface LeadJourney {
  from: string; to: string; firstCallHours: number; teamView: boolean;
  totals: { arrived: number; calledWithin: number; calledLater: number; neverCalled: number; routed: number; converted: number; junked: number };
  days: JourneyDay[];
  triage: { withTelecaller: number; unassigned: number; aging: { under24h: number; d1to3: number; over3d: number } };
  routing: { byClinic: { clinic: string; routed: number; within4h: number; within24h: number; within3d: number; over3d: number }[] };
  telecallers: { id: string; name: string; inTriageNow: number; firstCalls: number; routed: number }[];
  clinics: { clinic: string; received: number; worked: number; converted: number }[];
  neverCalled: { id: string; fullName: string; phone: string; owner: string | null; ownerId: string | null; ageDays: number; routed: boolean }[];
}
export const leadCallsApi = {
  get: (id: string) => api<LeadCall>(`/lead-calls/${id}`),
};

// ---- Lead intake: the repair queue ----
// Every delivery Make.com sends is stored before it is parsed, so a lead that fails to come through
// is a row here rather than a bundle stuck in Make. These are the endpoints for dealing with them.

export type IntakeStatus = 'pending' | 'created' | 'deduped' | 'rejected' | 'failed' | 'dismissed';

export interface IntakeEvent {
  id: string;
  receivedAt: string;
  channel: string;
  sourceTag: string | null;
  deliveryId: string | null;
  dedupeKey: string;
  parsedName: string | null;
  parsedPhone: string | null;
  status: IntakeStatus;
  /** comma-joined tags: bad_phone | no_clinic | defaulted_clinic | synthesized_name | … */
  reason: string | null;
  error: string | null;
  leadId: string | null;
  clinicId: string | null;
  attempts: number;
  processedAt: string | null;
  /** true when someone has already corrected a field on this delivery */
  patched?: boolean;
}
export interface IntakeEventFull extends IntakeEvent {
  rawPayload: Record<string, unknown>;
  patch: Record<string, unknown> | null;
}
export interface IntakeList {
  rows: IntakeEvent[];
  counts: Record<IntakeStatus, number>;
  /** pending + failed + rejected — the number worth showing on a badge */
  needsAttention: number;
}
export interface IntakeResult {
  eventId: string; status: IntakeStatus; reason?: string | null; leadId?: string | null; error?: string | null;
}

export interface IntakeHealth {
  working: boolean;
  /** Which signal the answer rests on — a heartbeat is proof, lead volume is only a hint. */
  basis: 'heartbeat' | 'lead_volume' | 'nothing';
  hint: string | null;
  heartbeatAt: string | null;
  heartbeatSince: string | null;
  beats: number;
  lastDeliveryAt: string | null;
  last24h: Record<IntakeStatus, number>;
  needsAttention: number;
  open: { pending: number; failed: number; rejected: number };
}

export interface IntakeReportRow { received: number; created: number; deduped: number; rejected: number; failed: number; pending: number; dismissed: number }
export interface IntakeReport {
  from: string; to: string;
  days: (IntakeReportRow & { date: string; phones: number })[];
  bySource: (IntakeReportRow & { sourceTag: string })[];
  totals: IntakeReportRow;
  /** Deliveries that produced no lead — the figure to reconcile against Zoho. */
  unaccounted: number;
}

export const leadIntakeApi = {
  health: () => api<IntakeHealth>('/lead-intake/health'),
  report: (from?: string, to?: string) =>
    api<IntakeReport>(`/lead-intake/report${from || to ? `?from=${from ?? ''}&to=${to ?? ''}` : ''}`),
  /**
   * Downloads the delivery-level CSV. Not the shared toCsv()/download() pair used elsewhere: the
   * server owns this shape so the file matches the report exactly, and the request is
   * bearer-authenticated so it cannot be a plain <a href>.
   */
  reportCsv: async (from?: string, to?: string): Promise<void> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const clinic = getClinic();
    if (clinic) headers['X-Clinic-Id'] = clinic;
    const res = await fetch(`${P().baseUrl}/v1/lead-intake/report.csv?from=${from ?? ''}&to=${to ?? ''}`, { headers });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'intake.csv';
    await P().saveBlob(await res.blob(), name);
  },
  runSilenceCheck: () => api<{ alerted: boolean; reason?: string; recipients?: number }>('/lead-intake/silence/run', { method: 'POST' }),
  list: (qs = '') => api<IntakeList>(`/lead-intake${qs}`),
  get: (id: string) => api<IntakeEventFull>(`/lead-intake/${id}`),
  repair: (id: string, fields: Record<string, string>) =>
    api<IntakeResult>(`/lead-intake/${id}/repair`, { method: 'POST', body: JSON.stringify(fields) }),
  retry: (id: string) => api<IntakeResult>(`/lead-intake/${id}/retry`, { method: 'POST' }),
  dismiss: (id: string, reason?: string) =>
    api<IntakeResult>(`/lead-intake/${id}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) }),
  sweep: () => api<{ swept: number }>('/lead-intake/sweep/run', { method: 'POST' }),
};

export interface LeadDuplicates {
  total: number;
  groups: {
    phone: string;
    count: number;
    leads: {
      id: string; fullName: string; phone: string; status: string; source: string; createdAt: string;
      convertedPatientId: string | null; clinic: { code: string } | null; owner: { fullName: string } | null;
    }[];
  }[];
}

// ---- Ozonetel telephony admin ----
export interface AgentLineHealth {
  userId: string; name: string; ozonetelAgentId: string | null; phone: string | null; dialMode: string | null;
  calls24h: number; connected: number; rejected: number; notLoggedIn: number;
  lastVerdict: 'ok' | 'rejected' | 'not_logged_in' | 'no_answer' | 'unknown'; lastAt: string; lastExtension: string | null;
  /** Ozonetel agent Skill from the last CDR; '' = none assigned (the account-side cause of 1s rejects). */
  skill?: string | null;
}
export interface TelephonyAgent { id: string; name: string; ozonetelAgentId: string | null; roles: string[]; isActive?: boolean; canLogIn?: boolean }

export type CallOutcome = 'connected' | 'no_answer' | 'busy' | 'rejected' | 'invalid_number' | 'agent_unavailable' | 'dial_failed' | 'in_progress' | 'unknown';
export interface CallRow {
  id: string; at: string; direction: string;
  outcome: CallOutcome | null; outcomeLabel: string; status: string;
  disposition: string | null; error: string | null; number: string | null;
  agent: string | null; agentUserId: string | null;
  patientId: string | null; patient: string | null;
  leadId: string | null; lead: string | null;
  ringSec: number | null; durationSec: number | null; talkTimeSec: number | null;
  hangupBy: string | null; attemptNo: number; cycle: number | null;
  /** The "[L1] Outcome: …" note the agent saved after this call, when one exists. */
  agentNote?: string | null;
  hasRecording: boolean; awaitingProvider: boolean;
}
export interface CallSummary {
  attempts: number; connected: number; connectRate: number;
  totalTalkTimeSec: number; avgTalkTimeSec: number; failed: number;
  /** Dials the provider refused outright (no UCID) — hidden unless includeFailedDials is set. */
  neverDialled: number;
  lastAttemptAt: string | null; lastConnectedAt: string | null;
}
export interface CallLog { total: number; calls: CallRow[]; summary: CallSummary }
export interface TelephonyHealth {
  totalCalls: number; lastCallAt: string | null; lastWebhookAt: string | null;
  stuckCalls: number; webhooksWorking: boolean; hint: string | null;
}
/** Who is being dialled and why — without this the call row is an anonymous phone number. */
export interface CallCtx { patientId?: string; leadId?: string; followupTaskId?: string; purpose?: string }

export const telephonyApi = {
  // generic Ozonetel click-to-call (Patients hub etc.) — dials via the logged-in user's agent
  call: (phone: string, ctx: CallCtx = {}) =>
    api<{ callRef: string; status: string; provider: string; error?: string; callId: string }>('/telephony/call', { method: 'POST', body: JSON.stringify({ phone, ...ctx }) }),
  calls: (filter: { patientId?: string; leadId?: string; agentUserId?: string; outcome?: string; from?: string; to?: string; take?: number; includeFailedDials?: boolean } = {}) =>
    api<CallLog>(`/telephony/calls${q(filter as any)}`),
  /** Live outcome of one just-placed call — see watchDial() in dial-help.ts. */
  callStatus: (callId: string) =>
    api<{ id: string; status: string; outcome: string | null; error: string | null; talkTimeSec: number | null }>(`/telephony/calls/${callId}/status`),
  health: () => api<TelephonyHealth>('/telephony/health'),
  agents: () => api<TelephonyAgent[]>('/telephony/agents'),
  /** Who can actually dial right now — Ozonetel's own verdicts on each agent's last 24h of legs. */
  lineHealth: () => api<AgentLineHealth[]>('/telephony/agents/line-health'),
  /** The toolbar leg died unanswered — re-place the same call via the agent's own phone. */
  retryViaPhone: (callId: string) =>
    api<{ callRef: string; status: string; provider: string; error?: string; callId?: string; leg?: 'toolbar' | 'phone' }>(`/telephony/calls/${callId}/retry-via-phone`, { method: 'POST' }),
  setAgentId: (userId: string, ozonetelAgentId: string | null) =>
    api<TelephonyAgent>(`/telephony/agents/${userId}`, { method: 'PATCH', body: JSON.stringify({ ozonetelAgentId }) }),
  lookup: (phone: string) => api<{ lead: any | null; patient: any | null }>(`/telephony/lookup?phone=${encodeURIComponent(phone)}`),
  subscribe: () => api<{ callEventsURL: string; postCallURL: string; postCallNote: string; ok: boolean; status: number; body: any; error?: string }>('/telephony/subscribe', { method: 'POST', body: JSON.stringify({}) }),
  /**
   * Fetch a recording as a blob URL. It cannot be an <audio src> because the stream is
   * bearer-authenticated and the provider's expiring MP3 URL must never reach the browser.
   * Caller is responsible for URL.revokeObjectURL when done.
   */
  recording: async (callId: string): Promise<string> => P().blobUrl(await fetchRecording(callId)),
  /** The same bytes, saved to the user's device. Same authenticated fetch — a call recording can
   *  never be a plain <a href> because the request needs an Authorization header and the
   *  provider's expiring MP3 URL must not reach the browser. */
  downloadRecording: async (callId: string, filename: string): Promise<void> => {
    await P().saveBlob(await fetchRecording(callId), filename);
  },
};

/** One authenticated GET of a recording's bytes, shared by play and download. */
async function fetchRecording(callId: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const clinic = getClinic();
  if (clinic) headers['X-Clinic-Id'] = clinic;
  const res = await fetch(`${P().baseUrl}/v1/telephony/calls/${callId}/recording`, { headers });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.blob();
}

// ---- CRM telecalling pods ----
export interface PodAgent {
  id: string; name: string; email?: string | null; phone?: string | null;
  ozonetelAgentId?: string | null; roles: string[];
  isActive?: boolean;
  /** false = an attribution-only record: mapped to an Ozonetel Agent ID but cannot sign in. */
  canLogIn?: boolean;
  /** false = they belong to another clinic — visible so their mapping is not hidden, but read-only here. */
  editable?: boolean;
}
export interface Pod {
  id: string; name: string; assignRule: 'round_robin' | 'least_loaded' | 'manual'; isActive: boolean;
  manager?: { id: string; name: string } | null; members: { id: string; name: string }[]; openLeads: number;
}
export interface PodPerf { pod: { id: string; name: string; assignRule: string }; members: { id: string; name: string; open: number; converted: number; junk: number; total: number; conversionRate: number }[] }
export type InboundStrategy = 'round_robin' | 'least_loaded' | 'fixed';
export interface InboundDesk { podId: string | null; memberIds: string[]; eligible: PodAgent[]; strategy: InboundStrategy; fixedUserId: string | null }
export interface JunkReviewDesk { enabled: boolean; userIds: string[]; eligible: PodAgent[] }
export const podsApi = {
  list: () => api<Pod[]>('/pods'),
  agents: () => api<PodAgent[]>('/pods/agents'),
  unpodded: () => api<PodAgent[]>('/pods/unpodded'),
  /** Map a person to an Ozonetel Agent ID. Pass `userId` to link somebody who already has a
   *  JClinic account, or `fullName` to create an attribution-only record. No password — an Agent
   *  ID is an attribute of a person, not a login. */
  upsertAgent: (data: { userId?: string; fullName?: string; email?: string; phone?: string; ozonetelAgentId?: string; podId?: string }) =>
    api<{ id: string; linked: boolean; canLogIn: boolean; isActive: boolean; ozonetelAgentId: string | null }>(
      '/pods/agents', { method: 'POST', body: JSON.stringify(data) }),
  /** Clears the Agent ID only — does not disable the person's login. */
  unmapAgent: (userId: string) => api<{ unmapped: boolean; name: string }>(`/pods/agents/${userId}`, { method: 'DELETE' }),
  create: (data: { name: string; managerId?: string; assignRule?: string }) => api<Pod>('/pods', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) => api(`/pods/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addMember: (id: string, userId: string) => api(`/pods/${id}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeMember: (id: string, userId: string) => api(`/pods/${id}/members/${userId}`, { method: 'DELETE' }),
  distribute: (id: string) => api<{ assigned: number; pending: number }>(`/pods/${id}/distribute`, { method: 'POST' }),
  performance: (id: string) => api<PodPerf>(`/pods/${id}/performance`),
  // Inbound-call desk: telecaller(s) who receive auto-created inbound-call leads, and how — round
  // robin / least-loaded / a single fixed agent. Decides ownership after Ozonetel connects the
  // call, NOT which phone actually rings — that's Ozonetel's own Skills/ACD config.
  inboundDesk: () => api<InboundDesk>('/pods/inbound-desk'),
  setInboundDesk: (userIds: string[], strategy: InboundStrategy = 'round_robin', fixedUserId?: string | null) =>
    api<InboundDesk>('/pods/inbound-desk', { method: 'PUT', body: JSON.stringify({ userIds, strategy, fixedUserId }) }),
  // Junk re-verification desk: the reviewer pool a junked lead round-robins to (excluding whoever marked it).
  junkReviewDesk: () => api<JunkReviewDesk>('/pods/junk-review'),
  setJunkReviewDesk: (userIds: string[], enabled = true) =>
    api<JunkReviewDesk>('/pods/junk-review', { method: 'PUT', body: JSON.stringify({ userIds, enabled }) }),
};

// ---- packages (M20) ----
export interface Pkg {
  id: string; name: string; kind: 'session' | 'treatment_plan'; price: string | number;
  type?: string | null; durationMonths?: number | null;
  rolloverPolicy?: string; renewalPolicy?: string; isActive?: boolean;
  diseaseIds?: string[]; diseaseNames?: string[];
  /** How many times it has been sold — what the config screen uses to explain frozen fields. */
  salesCount?: number;
  items?: { id: string; qty: string | number; serviceId?: string | null; medicineId?: string | null }[];
  caps?: { category: string; capType: string; capAmount?: string | number | null }[];
}
export interface PkgPayment {
  billNumber: string; total: number; paid: number; outstanding: number;
  /** ₹ that must be COLLECTED before the protocol can be used (minUpfrontPct% of the bill). */
  upfrontDue: number; minUpfrontPct: number; belowUpfront: boolean;
  payByDate: string; overdue: boolean;
  /** belowUpfront || overdue — drawing is blocked while true. */
  suspended: boolean;
}
export interface PkgDrawdown { at: string; category: string; item: string; qty: number; value: number; covered: number; overage: number }
export interface PkgBalance {
  saleId: string; kind: string; state: string; expiresAt?: string | null;
  /** One-off custom protocol (combined value pool + payment discipline). */
  custom?: boolean;
  sessions: { packageItemId: string; serviceId?: string | null; medicineId?: string | null; total: number; used: number; remaining: number }[];
  plan: { category: string; capType: string; medicineId?: string | null; serviceId?: string | null; allotted: number; consumed: number; remaining: number }[];
  /** Dispensed-items ledger, latest first. */
  drawdowns?: PkgDrawdown[];
  /** Present only for custom sales. */
  payment?: PkgPayment | null;
  /** The single source of truth for what may be spent right now. */
  allowance?: ProtocolAllowance | null;
}
export type PkgUnits =
  | { kind: 'session'; total: number; used: number; remaining: number }
  | { kind: 'plan'; caps: { category: string; capType: string; allotted: number; remaining: number }[] };
export interface PkgSale {
  id: string; soldAt: string; state: string; package?: { name: string; kind: string; custom?: boolean }; units?: PkgUnits;
  expiresAt?: string | null;
  /** Timeline passed while still active — consumption is blocked until a rollover is approved. */
  lapsed?: boolean;
  /** A rollover request is already waiting in the approvals queue. */
  pendingRollover?: boolean;
}

export const packagesApi = {
  list: (kind?: string, diseaseId?: string, includeInactive?: boolean) => {
    const qs = new URLSearchParams();
    if (kind) qs.set('kind', kind);
    if (diseaseId) qs.set('diseaseId', diseaseId);
    if (includeInactive) qs.set('includeInactive', 'true');
    const s = qs.toString();
    return api<Pkg[]>(`/packages${s ? `?${s}` : ''}`);
  },
  /** Reconfigure an existing protocol. Cannot change what it contains — see UpdatePackageDto. */
  update: (id: string, data: unknown) => api<Pkg>(`/packages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** Retire / reactivate — its own permission (protocols:delete); soft always. */
  setActive: (id: string, isActive: boolean) => api<Pkg>(`/packages/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  create: (data: unknown) => api<Pkg>('/packages', { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) => api<any>(`/packages/${id}`),
  sell: (packageId: string, patientId: string, recommendationId?: string) => api<{ saleId: string; billNumber: string | null; priceDue?: number }>('/package-sales', { method: 'POST', body: JSON.stringify({ packageId, patientId, recommendationId }) }),
  listSales: (patientId: string) => api<PkgSale[]>(`/package-sales?patientId=${patientId}`),
  balance: (saleId: string) => api<PkgBalance>(`/package-sales/${saleId}/balance`),
  consumption: (saleId: string) => api<{ medicine: string; batchNo: string; qty: number; reason: string | null; via: string; at: string }[]>(`/package-sales/${saleId}/consumption`),
  consumeSession: (saleId: string, packageItemId: string) => api(`/package-sales/${saleId}/consume-session`, { method: 'POST', body: JSON.stringify({ packageItemId }) }),
  draw: (saleId: string, data: unknown) => api<{ covered: number; overage: number; coveredByPlan: boolean; inFormulary: boolean }>(`/package-sales/${saleId}/draw`, { method: 'POST', body: JSON.stringify(data) }),
  renew: (saleId: string, data: unknown = {}) => api<{ newSaleId: string; rolledOver: Record<string, number>; billNumber: string | null }>(`/package-sales/${saleId}/renew`, { method: 'POST', body: JSON.stringify(data) }),
  discontinue: (saleId: string, data: { reason: string; refund?: number; notes?: string }) => api(`/package-sales/${saleId}/discontinue`, { method: 'POST', body: JSON.stringify(data) }),
  /** Ask to extend a lapsing/lapsed protocol (no new bill). Lands in the approvals queue for the
   *  configured roles (default: senior doctor / medical director). */
  requestRollover: (saleId: string, data: { extendMonths: number; reason: string }) =>
    api<{ approval: Approval }>(`/package-sales/${saleId}/rollover-request`, { method: 'POST', body: JSON.stringify(data) }),
  rolloverConfig: () => api<{ approverRoles: string[]; maxExtendMonths: number }>('/rules/protocol-rollover'),
  setRolloverConfig: (data: { approverRoles?: string[]; maxExtendMonths?: number }) =>
    api<{ approverRoles: string[]; maxExtendMonths: number }>('/rules/protocol-rollover', { method: 'PUT', body: JSON.stringify(data) }),
  /** Custom protocol: per-patient value package at a governed discount. NOTHING is billed at
   *  request time — a senior doctor / medical director approves it in the queue first. */
  requestCustom: (data: { patientId: string; name: string; billedAmount: number; capAmount: number; durationMonths: number; note?: string }) =>
    api<{ approval: Approval | null; autoCreated: boolean; created?: { saleId: string; payByDate: string }; upfrontDue: number; payByDate: string; approverName?: string | null }>('/package-sales/custom', { method: 'POST', body: JSON.stringify(data) }),
  customPending: (patientId?: string) =>
    api<Approval[]>(`/package-sales/custom/pending${patientId ? `?patientId=${patientId}` : ''}`),
  customConfig: () => api<CustomProtocolConfig>('/rules/custom-protocol'),
  setCustomConfig: (data: Partial<CustomProtocolConfig>) =>
    api<CustomProtocolConfig>('/rules/custom-protocol', { method: 'PUT', body: JSON.stringify(data) }),
  /** Live pools a patient holds + what may be spent right now. Drives the counter banner. */
  allowance: (patientId: string) =>
    api<{ protocols: ProtocolAllowance[] }>(`/package-sales/custom/allowance?patientId=${patientId}`),
};

/**
 * One computation, shared by the counter banner, the Protocols page, the portal card and the
 * server-side gate that actually refuses a draw — so they can never quote different numbers.
 */
export interface ProtocolAllowance {
  saleId: string; patientId: string; clinicId: string; name: string;
  soldAt: string; expiresAt: string | null; durationMonths: number;
  billId: string | null; billNumber: string | null; entitlementId: string | null;
  cap: number; consumed: number; poolLeft: number;
  total: number; paid: number; writeOff: number; outstanding: number; fullyPaid: boolean;
  /** Value ceiling set by cash received: paying in full releases the whole cap. */
  cashAllowance: number;
  /** Spendable right now. */
  available: number;
  /** Value dispensed beyond the cash backing it — only non-zero after a refund. */
  overdrawn: number;
  limitedBy: 'cash' | 'cap' | null;
  usable: boolean;
  blockedReasons: { code: string; message: string; status: number }[];
  minUpfrontPct: number; upfrontDue: number; payByDate: string;
}
export interface CustomProtocolConfig {
  approverRoles: string[]; maxDiscountPct: number; minMonths: number; maxMonths: number;
  /** % of the bill that must be collected before the protocol can be used. */
  minUpfrontPct: number;
  /** Hard ceiling on a NEW protocol's value pool (capAmount). Existing protocols are unaffected. */
  maxCapAmount?: number;
  /** Optional ceiling on a protocol's billed value. Null/absent = no ceiling. */
  maxProtocolAmount?: number | null;
  /** Floor on a protocol's billed value (the old max cap, re-purposed by the owner 13 Aug 2026). */
  minProtocolAmount?: number;
  /** Discount authority by protocol VALUE: inside a band → created outright; above the band's limit → refused. */
  discountBands?: { upTo: number; maxPct: number }[];
  /** Above the last band: up to this % outright; more → approval by `approverUserId`. */
  topBand?: { autoApprovePct: number };
  approverUserIds?: string[];
  approverNames?: string[];
}
/** Which limit applies to a protocol of this value (mirror of the API's bandFor). */
export function protocolBandFor(cfg: CustomProtocolConfig, cap: number): { kind: 'band' | 'top'; upTo: number | null; maxPct: number } {
  const bands = [...(cfg.discountBands ?? [{ upTo: 15000, maxPct: 5 }, { upTo: 30000, maxPct: 10 }, { upTo: 50000, maxPct: 15 }])].sort((a, b) => a.upTo - b.upTo);
  for (const b of bands) if (cap <= b.upTo + 1e-9) return { kind: 'band', upTo: b.upTo, maxPct: b.maxPct };
  return { kind: 'top', upTo: null, maxPct: cfg.topBand?.autoApprovePct ?? 15 };
}
export const DISC_REASONS = [
  { v: 'clinical_success', label: 'Recovered / clinical success', cls: 'clinical' },
  { v: 'referred_higher_care', label: 'Referred to higher care', cls: 'clinical' },
  { v: 'deteriorated', label: 'Deteriorated', cls: 'clinical' },
  { v: 'died', label: 'Died', cls: 'clinical' },
  { v: 'adverse_event', label: 'Adverse event', cls: 'clinical' },
  { v: 'affordability', label: 'Affordability / financial', cls: 'churn' },
  { v: 'dissatisfaction', label: 'Dissatisfaction', cls: 'churn' },
  { v: 'relocated', label: 'Relocated', cls: 'churn' },
  { v: 'personal', label: 'Personal', cls: 'churn' },
  { v: 'other', label: 'Other', cls: 'churn' },
];

// ---- biomarkers (M7) ----
export interface PanelFull {
  id: string; name: string;
  markers: { id: string; groupLabel?: string | null; frequencyRule: any; biomarker: { id: string; name: string; unit?: string | null; isEventDriven: boolean } }[];
}
export interface EnterResultResp {
  flag: string | null;
  referenceRange: { low?: number | null; high?: number | null; criticalLow?: number | null; criticalHigh?: number | null } | null;
}
export interface Trend {
  biomarker: { id: string; name: string; unit?: string | null } | null;
  referenceRange: { low?: number | null; high?: number | null } | null;
  results: { id: string; valueNum?: number | null; valueText?: string | null; unit?: string | null; takenAt: string; flag: string | null }[];
}
/** A test the patient owes, computed live from their active diseases + last result. */
export type DueStatus = 'overdue' | 'due' | 'upcoming' | 'never';
export interface DueTest {
  patientId: string; patient: string; phone: string | null;
  biomarkerId: string; biomarker: string; unit: string | null; assesses: string | null;
  panelId: string; panel: string; groupLabel: string | null;
  frequency: string | null; intervalDays: number;
  lastDoneAt: string | null; lastValue: number | string | null;
  nextDue: string; status: DueStatus; daysLate: number;
  ordered: boolean; orderedAt: string | null; snoozedUntil: string | null;
}
export interface BulkResultResp { saved: number; failed: { biomarkerId: string; error?: string }[]; results: { biomarkerId: string; ok: boolean; flag?: string | null; error?: string }[] }

export const biomarkersApi = {
  panels: () => api<PanelFull[]>('/panels'),
  enter: (data: unknown) => api<EnterResultResp>('/lab-results', { method: 'POST', body: JSON.stringify(data) }),
  enterBulk: (results: unknown[]) => api<BulkResultResp>('/lab-results/bulk', { method: 'POST', body: JSON.stringify({ results }) }),
  trend: (patientId: string, biomarkerId: string) => api<Trend>(`/patients/${patientId}/biomarkers/${biomarkerId}/trend`),
  /** Every tracked test for one patient (all statuses). */
  recalls: (patientId: string) => api<DueTest[]>(`/recalls?patientId=${patientId}`),
  /** Clinic-wide worklist of late tests. */
  due: (overdueOnly = true) => api<DueTest[]>(`/biomarkers/due?overdueOnly=${overdueOnly}`),
  orderTests: (patientId: string, biomarkerIds: string[], panelId?: string) =>
    api<{ ordered: { name: string }[]; message: string | null }>('/test-orders', { method: 'POST', body: JSON.stringify({ patientId, biomarkerIds, panelId }) }),
  snooze: (patientId: string, biomarkerId: string, days: number, reason?: string) =>
    api<{ ok: boolean; snoozedUntil: string }>(`/recalls/${biomarkerId}/snooze`, { method: 'POST', body: JSON.stringify({ patientId, days, reason }) }),
  recent: () => api<RecentBiomarker[]>('/biomarkers/recent'),
  /** The whole marker catalogue (~154 rows). Small and static, so callers load it once and filter
   *  in the browser rather than round-tripping a search. Needs biomarkers:view, which doctors hold. */
  catalog: () => api<{ id: string; name: string; unit?: string | null; assesses?: string | null }[]>('/biomarkers'),
};

export interface RecentBiomarker {
  id: string;
  patientId: string;
  patientName: string;
  patientSex: string;
  biomarker: string;
  value: number | string | null;
  unit?: string | null;
  flag: string | null;
  takenAt: string;
  createdAt: string;
}


// ---- payments (M12) ----
/** Everything the printable payment receipt (/print/receipt/:orderId) renders. */
export interface ReceiptData {
  clinic: { name: string | null; code: string | null; gstin: string | null; address: string | null; phone: string | null };
  patient: { fullName: string | null; phone: string | null };
  receiptNumber: string; billNumber: string; collectedAt: string;
  method: string | null; reference: string | null;
  /** Present only on a cheque tender — the instrument the receipt has to name. */
  cheque?: { no: string | null; bank: string | null; date: string | null; drawer: string | null } | null;
  amountReceived: number; billTotal: number; paidToDate: number; balanceDue: number;
  payState: string; collectedByName: string | null;
  /** Next follow-up date the desk picked at checkout (YYYY-MM-DD), printed on the receipt. */
  nextFollowupOn?: string | null;
  /** Set on protocol-installment receipts: the PROTOCOL's running balance (the born-paid invoice's
   *  own balance is always ₹0, which answers the wrong question for the patient). */
  protocol?: { name: string; priceDue: number; collectedToDate: number; protocolBalance: number } | null;
}
/** The patient's money account (advances + restructured legacy dues). */
export interface LedgerEntryRow {
  id: string; kind: string; amount: number; note: string | null;
  billId: string | null; originalBillNumber: string | null;
  originalBillDate: string | null; originalDueDate: string | null; restructureNote: string | null;
  by: string | null; at: string;
}
export interface LedgerAccount { balance: number; credit: number; owed: number; entries: LedgerEntryRow[] }
export interface AdvanceReceiptData {
  clinic: { name: string | null; code: string | null; gstin: string | null; address: string | null; phone: string | null } | null;
  patient: { fullName: string | null; phone: string | null } | null;
  receiptNo: string | null; collectedAt: string; method: string | null; reference: string | null;
  amount: number; accountCredit: number; collectedByName: string | null;
}
export const ledgerApi = {
  account: (patientId: string) => api<LedgerAccount>(`/ledger/${patientId}`),
  deposit: (data: { patientId: string; amount: number; method: string; reference?: string }) =>
    api<{ orderId: string; receiptNo: string; amount: number; balance: number; credit: number; owed: number }>('/ledger/deposit', { method: 'POST', body: JSON.stringify(data) }),
  /** Settle account dues — mints a born-paid invoice; surface the receipt (orderId) immediately. */
  collect: (data: { patientId: string; amount: number; method: string; reference?: string } & ChequeInput) =>
    api<{ billId: string; billNumber: string; orderId: string; amount: number; excessDeposited: number; depositReceiptNo: string | null; balance: number; credit: number; owed: number }>('/ledger/collect', { method: 'POST', body: JSON.stringify(data) }),
  refundCredit: (data: { orderId: string; amount: number; reason: string }) =>
    api<{ refundId: string; amount: number; balance: number; credit: number; owed: number }>('/ledger/refund-credit', { method: 'POST', body: JSON.stringify(data) }),
  depositReceipt: (orderId: string) => api<AdvanceReceiptData>(`/ledger/deposit-receipt/${orderId}`),
}
export const paymentsApi = {
  createOrder: (billId: string, amount?: number) => api<{ id: string; amount: string | number }>('/payment-orders', { method: 'POST', body: JSON.stringify({ billId, amount }) }),
  captureCash: (orderId: string, amount?: number) => api<{ orderId: string; paidAmount: number }>(`/payments/${orderId}/capture-cash`, { method: 'POST', body: JSON.stringify({ amount }) }),
  // One-step multi-method collection (cash / upi / cards / netbanking / savein) with a txn reference.
  // `orderId` identifies the collection so the counter can open its printable receipt.
  collect: (billId: string, method: string, reference?: string, amount?: number, cheque?: ChequeInput,
    // Split tender (cash + UPI in one counter visit): when present, the single-method args are
    // ignored and the legs are sent instead -- the server books one order/txn per leg.
    splits?: ({ method: string; reference?: string; amount: number } & ChequeInput)[]) =>
    api<{ orderId: string; txnId: string; amount: number; method: string; reference: string | null; paidAmount: number; payState: string; excessCredited?: number; advanceReceiptNo?: string | null }>('/payments/collect', { method: 'POST', body: JSON.stringify(splits?.length ? { billId, splits } : { billId, method, reference, amount, ...cheque }) }),
  /** Installment against a new-model protocol — mints a numbered invoice born paid + receipt. */
  collectForProtocol: (saleId: string, data: { amount: number; method: string; reference?: string } & ChequeInput) =>
    api<{ billId: string; billNumber: string; orderId: string; amount: number; collected: number; priceDue: number; protocolDue: number }>(`/package-sales/${saleId}/collect`, { method: 'POST', body: JSON.stringify(data) }),
  receipt: (orderId: string) => api<ReceiptData>(`/payments/receipt/${orderId}`),
  list: (billId: string) => api<PaymentHistory>(`/payments?billId=${billId}`),
  refund: (orderId: string, amount: number, reason: string) =>
    api<{ refundId: string; paidAmount: number }>(`/payments/${orderId}/refund`, { method: 'POST', body: JSON.stringify({ amount, reason }) }),
  // collect cash in one step: order -> capture
  collectCash: async (billId: string) => {
    const order = await api<{ id: string }>('/payment-orders', { method: 'POST', body: JSON.stringify({ billId }) });
    return api(`/payments/${order.id}/capture-cash`, { method: 'POST', body: JSON.stringify({}) });
  },
};

// ---- follow-up rule engine (M13) ----
export interface DueTask {
  id: string; dueAt: string; cycle: number; outcome?: string | null;
  /** Dial attempts against THIS task, and how many remain before the cycle rolls forward. */
  attempts: number; attemptsLeft: number; lastCallAt?: string | null;
  lastCall?: { outcome: string | null; at: string; error: string | null } | null;
  /** A stop has been requested on this plan and is waiting on a senior doctor. Calls continue
   *  until it is approved, so the row stays on the worklist with a badge. */
  stopPending?: boolean;
  /** Which call track this task belongs to: 'reception' (7d) | 'doctor' (15d). */
  track?: 'reception' | 'doctor' | string;
  /** Pulled forward because a receptionist flagged deteriorating health. */
  escalated?: boolean;
  /** The due date was picked by the billing desk at checkout ("Next follow-up date"). */
  fromBilling?: boolean;
  /** Latest NPS answer for this patient — the modal's "asked recently" hint. */
  lastNps?: { score: number; at: string } | null;
  plan: { id: string; patientId?: string; maxCycles?: number; patient?: { id?: string; fullName: string; phone: string } };
}
export type FollowupStatus = 'pending' | 'calling' | 'not_received' | 'completed';
export interface FollowupPlanRow { id: string; patientId: string; cycle: number; maxCycles: number; nextDue?: string | null; state: string; createdAt: string; patient?: { fullName: string } }
export interface Approval { id: string; kind: string; entityId: string; approverRole: string; note?: string | null; state: string; payload?: any; createdAt?: string }

export const followupApi = {
  dueTasks: () => api<DueTask[]>('/followup-tasks'),
  worklist: () => api<DueTask[]>('/followup-worklist'),
  plans: (patientId: string) => api<FollowupPlanRow[]>(`/followup-plans?patientId=${patientId}`),
  setStatus: (taskId: string, status: FollowupStatus) => api(`/followup-tasks/${taskId}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  complete: (taskId: string, outcome: string) => api(`/followup-tasks/${taskId}/complete`, { method: 'POST', body: JSON.stringify({ outcome }) }),
  requestStop: (planId: string, reason: 'expired' | 'discontinued') => api(`/followup-plans/${planId}/request-stop`, { method: 'POST', body: JSON.stringify({ reason }) }),
  approvals: () => api<Approval[]>('/approvals'),
  decide: (approvalId: string, decision: 'approved' | 'rejected') => api(`/approvals/${approvalId}/decide`, { method: 'POST', body: JSON.stringify({ decision }) }),
  runReminders: () => api<{ patients: number; reminders: number }>('/reminders/run', { method: 'POST' }),
};

// ---- follow-up call check-ins: health note + rating, NPS 0–10, grievance loop ----
export interface CheckinRow {
  id: string; patientId: string; taskId?: string | null; collectedBy: string; collectedByName?: string | null;
  healthRating: number | null; npsScore: number | null; healthNote: string | null;
  grievance: string | null; grievanceStatus: 'open' | 'resolved' | null; healthFlag: string | null;
  resolutionNote: string | null; resolvedAt: string | null; resolvedByName?: string | null; createdAt: string;
}
export interface GrievanceRow {
  id: string; patientId: string; patient: string; phone: string | null;
  grievance: string; createdAt: string; collectedByName: string | null;
  resolutionNote: string | null; resolvedAt: string | null; resolvedByName: string | null;
}
export interface NpsAnalytics {
  nps: { score: number | null; promoters: number; passives: number; detractors: number; responses: number };
  trend: { month: string; nps: number | null; responses: number }[];
  health: { avg: number | null; responses: number; trend: { month: string; avg: number | null; responses: number }[] };
  byCollector: { userId: string; name: string; checkins: number; npsResponses: number }[];
  grievances: { open: number; resolved: number };
  checkins: number;
}
export const checkinApi = {
  /** Saves the conversation AND completes the task in one call (tolerates a task the phone system already closed). */
  create: (data: { taskId?: string; patientId?: string; healthRating?: number; npsScore?: number; healthNote?: string; grievance?: string; healthConcern?: boolean }) =>
    api<{ checkin: CheckinRow; taskAlreadyClosed: boolean; escalated: boolean; planState?: string }>('/followup-checkins', { method: 'POST', body: JSON.stringify(data) }),
  forPatient: (patientId: string) => api<CheckinRow[]>(`/followup-checkins?patientId=${patientId}`),
  grievances: (status: 'open' | 'resolved' = 'open') => api<GrievanceRow[]>(`/followup-grievances?status=${status}`),
  resolve: (id: string, note?: string) => api(`/followup-checkins/${id}/resolve`, { method: 'POST', body: JSON.stringify({ note }) }),
  analytics: (f: { from?: string; to?: string } = {}) => {
    const p = new URLSearchParams();
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    return api<NpsAnalytics>(`/followup-checkins/analytics${p.toString() ? `?${p}` : ''}`);
  },
};

export interface PatientFeedbackRow {
  id: string; trigger: string; status: string;
  receptionRating: number | null; doctorRating: number | null; therapistRating: number | null; overallRating: number | null;
  comment: string | null; sentAt: string | null; respondedAt: string | null; createdAt: string;
}
/** A submission the patient agreed to publish, waiting for a staff decision. */
export interface ModerationRow {
  id: string; at: string | null;
  overallRating: number | null; receptionRating: number | null; doctorRating: number | null; therapistRating: number | null;
  comment: string | null;
  /** Exactly how the name would read on the website. */
  publicName: string | null;
  submittedRelation: string | null;
  /** Advisory: things worth a second look before this goes public. */
  hints: string[];
}

export const feedbackApi = {
  forPatient: (patientId: string) => api<PatientFeedbackRow[]>(`/feedback?patientId=${patientId}`),
  // Gated testimonials:edit — admin / medical director only.
  moderationQueue: () => api<ModerationRow[]>('/feedback/moderation'),
  /** `publishedComment` is a redaction of the original, not a rewrite. Omit to publish verbatim. */
  publish: (id: string, data: { publishedComment?: string; note?: string } = {}) =>
    api<{ publishState: string }>(`/feedback/${id}/publish`, { method: 'POST', body: JSON.stringify(data) }),
  reject: (id: string, note?: string) =>
    api<{ publishState: string }>(`/feedback/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
};

// ---- path-lab (M8) ----
export interface LabPartnerRow { id: string; name: string; supportsStructured: boolean; catalog: { partnerCode: string; name: string }[] }
export interface LabOrderRow { id: string; status: string; tests: string[]; partnerOrderRef?: string | null; createdAt: string; patient?: { fullName: string }; partner?: { name: string } | null }
export interface InboundRow { id: string; partnerCode?: string | null; rawPayload: any; mapped: boolean; receivedAt: string }

export const labApi = {
  partners: () => api<LabPartnerRow[]>('/lab-partners'),
  biomarkers: () => api<{ id: string; name: string }[]>('/biomarkers'),
  orders: (patientId?: string) => api<LabOrderRow[]>(`/lab-orders${patientId ? `?patientId=${patientId}` : ''}`),
  createOrder: (data: unknown) => api<LabOrderRow>('/lab-orders', { method: 'POST', body: JSON.stringify(data) }),
  inbound: () => api<InboundRow[]>('/lab-inbound?mapped=false'),
  map: (inboundId: string, biomarkerId: string) => api(`/lab-inbound/${inboundId}/map`, { method: 'POST', body: JSON.stringify({ biomarkerId }) }),
};

// ---- lab report upload → biomarker auto-sync ----
export interface LabUploadRow {
  id: string; fileName: string; mimeType: string; status: string; sizeBytes: number;
  createdAt: string; reviewedAt?: string | null; error?: string | null;
  patient?: { fullName: string; phone: string };
}
export interface LabUploadParsedRow {
  rawName: string; matchedBiomarkerId: string | null; matchedName: string | null; confidence: number;
  valueNum?: number; valueText?: string; unit?: string; unitMismatch: boolean; discarded?: boolean;
}
export interface LabUploadDetail extends LabUploadRow {
  parsed: LabUploadParsedRow[];
  reportDate?: string | null;
  patient: { fullName: string; phone: string; dob?: string | null; sex?: string };
  biomarkers: Record<string, { id: string; name: string; unit: string | null }>;
  missingExpected: { biomarkerId: string; biomarker: string; status: string }[];
}
export interface ApproveLabUploadRow { biomarkerId: string; valueNum?: number; valueText?: string; unit?: string }
export const labUploadsApi = {
  upload: (patientId: string, files: File[]) => {
    const form = new FormData();
    form.append('patientId', patientId);
    files.forEach((f) => form.append('files', f));
    return apiUpload<LabUploadRow[]>('/lab-uploads', form);
  },
  list: (status?: string) => api<LabUploadRow[]>(`/lab-uploads${status ? `?status=${status}` : ''}`),
  get: (id: string) => api<LabUploadDetail>(`/lab-uploads/${id}`),
  /** Direct path — needs Bearer + X-Clinic-Id, so it works from fetch() but NOT from an <img>,
   *  <iframe> or <video> tag. Use ticket() for anything the browser loads as a subresource. */
  fileUrl: (id: string) => `/v1/lab-uploads/${id}/file`,
  /** Exchanges the caller's permission for a 15-minute signed URL a tag can load. */
  ticket: (id: string) => api<{ url: string; expiresAt: string }>(`/lab-uploads/${id}/ticket`),
  approve: (id: string, takenAt: string | undefined, rows: ApproveLabUploadRow[]) =>
    api<{ ingested: number; skippedDuplicates: string[] }>(`/lab-uploads/${id}/approve`, { method: 'POST', body: JSON.stringify({ takenAt, rows }) }),
  reject: (id: string) => api(`/lab-uploads/${id}/reject`, { method: 'POST' }),
  addBiomarker: (name: string, unit?: string) => api<{ id: string; name: string; unit: string | null }>('/biomarkers', { method: 'POST', body: JSON.stringify({ name, unit }) }),
};

// ---- BI / Analytics (Pillar 3) ----
export interface SavedDashboard { id: string; name: string; config: any; isDefault: boolean }
function q(params: Record<string, string | undefined>) {
  const s = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
  return s ? `?${s}` : '';
}
export type AnalyticsFilter = { from?: string; to?: string; granularity?: string; sex?: string; ageBand?: string; doctorId?: string; source?: string; ownerId?: string; diseaseId?: string; stage?: string };
/** One clinic's line in the side-by-side comparison. */
export interface ClinicCompareRow {
  clinicId: string; code: string; name: string;
  gross: number; writtenOff: number; discount: number;
  /** Billed value MARKED PAID — not cash banked. The Collections tab answers the cash question. */
  billedPaid: number;
  outstanding: number; bills: number; avgBillValue: number; billedSettledRate: number;
  footfall: number; uniquePatients: number; newPatients: number;
}
export interface ClinicCompare {
  range: { from: string; to: string };
  rows: ClinicCompareRow[];
  total: Omit<ClinicCompareRow, 'clinicId' | 'code' | 'name'> & { clinics: number };
}

export interface CollectionClinic {
  clinicId: string; code: string; name: string;
  collected: number; refunded: number; net: number;
  payments: number; bills: number; billed: number; perDay: number;
  byMethod: { method: string; amount: number }[];
}
export interface CollectionReport {
  from: string; to: string; days: number;
  clinics: CollectionClinic[];
  total: { collected: number; refunded: number; net: number; billed: number; perDay: number; payments: number; bills: number; clinicsReporting: number };
}

// ---- BI Patient Tracker (the hand-kept Excel, computed live) ----
export interface TrackerRow {
  patientId: string; name: string; phone: string | null; clinic: string | null;
  diseases: { name: string; stage: string | null; stageNum: number | null }[];
  /** '2026-08-01' → billed that IST month (net of write-offs, voids out). */
  months: Record<string, number>;
  /** '2026-08-01' → the hand-typed cell ("stop", "have medicine"). */
  notes: Record<string, string>;
  total: number;
}
export interface TrackerMatrix {
  months: string[]; rows: TrackerRow[]; truncated: boolean; totalRows: number;
  allClinics: boolean; monthTotals: number[];
  /** Picker options: clinics the caller may choose, diseases that occur (active) in that scope. */
  clinics: { id: string; code: string; name: string }[];
  diseases: { id: string; name: string }[];
  applied: { clinicId: string | null; diseaseId: string | null; stage: number | null };
}
export const patientTrackerApi = {
  matrix: (f: { from?: string; to?: string; q?: string; clinicId?: string; diseaseId?: string; stage?: string } = {}) => {
    const p = new URLSearchParams();
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    if (f.q) p.set('q', f.q);
    if (f.clinicId) p.set('clinicId', f.clinicId);
    if (f.diseaseId) p.set('diseaseId', f.diseaseId);
    if (f.stage) p.set('stage', f.stage);
    const s = p.toString();
    return api<TrackerMatrix>(`/analytics/patient-tracker${s ? `?${s}` : ''}`);
  },
  // The tracker is read-only: note / remove / restore were removed with their routes (19 Aug 2026).
};

/** A cut of the overdue-to-return report: one row per clinic / doctor / disease / track. */
export interface OverdueCut {
  key: string; label: string; patients: number; avgDaysLate: number; worstDaysLate: number;
}
export interface OverdueReturnRow {
  patientId: string; name: string; phone: string | null;
  clinicId: string; clinic: string;
  track: string; dueAt: string; daysLate: number; attempts: number;
  doctor: string | null; disease: string | null; stage: number | null; lastVisit: string | null;
}
/** Patients who were due back and have not visited. */
export interface OverdueReturn {
  asOf: string;
  total: { patients: number; avgDaysLate: number; worstDaysLate: number; neverVisited: number };
  byClinic: OverdueCut[]; byDoctor: OverdueCut[]; byDisease: OverdueCut[]; byTrack: OverdueCut[];
  patients: OverdueReturnRow[];
  /** How much of the doctor / disease cut is attributable at all — printed, not hidden. */
  coverage: { withDoctor: number; withDisease: number; of: number };
}

export const analyticsApi = {
  /** Patients who were due back and have not visited — consolidated, by clinic, doctor and disease. */
  overdueReturn: (f: { clinicId?: string; kind?: string } = {}) =>
    api<OverdueReturn>(`/analytics/overdue-return${q(f as any)}`),
  /**
   * Every clinic, always — unlike every other analytics call this one ignores the clinic picker,
   * because the whole point is the chain-wide view. See the endpoint comment for why.
   */
  collection: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return api<CollectionReport>(`/analytics/collection${p.toString() ? `?${p}` : ''}`);
  },
  overview: (f: AnalyticsFilter = {}) => api<any>(`/analytics/overview${q(f)}`),
  /** Every clinic the user can see, one row each — always group-wide, whatever the picker says. */
  byClinic: (f: AnalyticsFilter = {}) => api<ClinicCompare>(`/analytics/by-clinic${q(f)}`),
  revenue: (f: AnalyticsFilter = {}) => api<any>(`/analytics/revenue${q(f)}`),
  operations: (f: AnalyticsFilter = {}) => api<any>(`/analytics/operations${q(f)}`),
  crm: (f: AnalyticsFilter = {}) => api<any>(`/analytics/crm${q(f)}`),
  clinical: (f: AnalyticsFilter = {}) => api<any>(`/analytics/clinical${q(f)}`),
  inventory: (f: AnalyticsFilter = {}) => api<any>(`/analytics/inventory${q(f)}`),
  supplyChain: (f: AnalyticsFilter = {}) => api<any>(`/analytics/inventory/supply-chain${q(f)}`),
  demandOutlook: (f: AnalyticsFilter = {}) => api<any>(`/analytics/inventory/demand-outlook${q(f)}`),
  procurement: (f: AnalyticsFilter = {}) => api<any>(`/analytics/inventory/procurement${q(f)}`),
  stockoutAlerts: () => api<any>('/analytics/inventory/stockout-alerts'),
  consumptionVariance: (f: AnalyticsFilter = {}) => api<any>(`/analytics/inventory/consumption-variance${q(f)}`),
  providers: (f: AnalyticsFilter = {}) => api<any>(`/analytics/providers${q(f)}`),
  packages: (f: AnalyticsFilter = {}) => api<any>(`/analytics/packages${q(f)}`),
  ltv: (f: AnalyticsFilter = {}) => api<any>(`/analytics/ltv${q(f)}`),
  lifecycle: (f: AnalyticsFilter = {}) => api<any>(`/analytics/lifecycle${q(f)}`),
  patient360: (id: string) => api<any>(`/analytics/lifecycle/patient/${id}`),
  report: (key: string, f: AnalyticsFilter = {}) => api<any>(`/analytics/${key}${q(f)}`),
  packageFinance: (f: AnalyticsFilter = {}) => api<any>(`/analytics/packages/finance${q(f)}`),
  providerScorecard: (f: AnalyticsFilter = {}) => api<any>(`/analytics/providers/scorecard${q(f)}`),
  encounterCompliance: (f: AnalyticsFilter = {}) => api<any>(`/analytics/clinical/encounter-compliance${q(f)}`),
  providerFunnel: (f: AnalyticsFilter & { metric?: string } = {}) => api<any>(`/analytics/providers/funnel${q(f as any)}`),
  dashboards: () => api<SavedDashboard[]>('/analytics/dashboards'),
  saveDashboard: (d: { name: string; config: any; isDefault?: boolean }) => api<SavedDashboard>('/analytics/dashboards', { method: 'POST', body: JSON.stringify(d) }),
  deleteDashboard: (id: string) => api(`/analytics/dashboards/${id}`, { method: 'DELETE' }),
  // patient feedback / team scorecard (gated analytics_providers)
  feedback: (f: AnalyticsFilter = {}) => api<FeedbackAnalytics>(`/feedback/analytics${q(f)}`),
  runFeedback: () => api<{ created: number; postVisit: number; postTreatment: number }>('/feedback/run', { method: 'POST' }),
};

export interface FeedbackAnalytics {
  summary: { sent: number; responses: number; responseRate: number; reception: number | null; doctor: number | null; therapist: number | null; overall: number | null };
  byDoctor: { doctorId: string; doctor: string; responses: number; doctorAvg: number | null; overallAvg: number | null }[];
  byTrigger: { trigger: string; responses: number; overall: number | null }[];
  trend: { month: string; overall: number | null; responses: number }[];
  recentComments: { comment: string | null; overall: number | null; trigger: string; at: string | null }[];
  /**
   * Feedback patients volunteered, kept out of every number above: nobody solicited it, so counting
   * it as outreach breaks the response rate, and self-selected volunteers would skew the provider
   * scorecard that `summary` and `byDoctor` feed.
   */
  voluntary: {
    responses: number; overall: number | null; withNotes: number; published: number; awaitingReview: number;
    /** All voluntary notes, published or not — the moderation queue only shows consented ones. */
    recentNotes: { comment: string | null; overall: number | null; at: string | null; publishState: string }[];
  };
}

// ---- clinical cohort / efficacy analytics (exhaustively segmentable) ----
export interface Segments {
  diseases: { id: string; name: string }[]; doctors: { id: string; name: string }[]; telecallers: { id: string; name: string }[];
  sources: string[]; stages: number[]; ageBands: string[]; sexes: string[];
}
export type Segment = { diseaseId?: string; stage?: string; ageBand?: string; sex?: string; doctorId?: string; ownerId?: string; source?: string; medicineId?: string; biomarkerId?: string; from?: string; to?: string };
export type CrmFilter = { ownerId?: string; source?: string; status?: string; diseaseInterest?: string; area?: string; gender?: string; createdFrom?: string; createdTo?: string; convertedFrom?: string; convertedTo?: string };
export interface CrmOptions { salespeople: { id: string; name: string }[]; sources: string[]; statuses: string[]; areas: string[]; diseases: string[] }
export const crmInsightsApi = {
  options: () => api<CrmOptions>('/analytics/crm-insights/options'),
  dashboard: (f: CrmFilter = {}) => api<any>(`/analytics/crm-insights${q(f as any)}`),
};

// ---- Ozonetel telephony dashboard (sourced from the provider's own CDR, not lead_call) ----
export interface TeleBucket { label: string; calls: number; connected: number; talkSec: number; answerRate: number }
export interface TeleAgent {
  agentCode: string; agentName: string; mappedToJclinic: boolean;
  calls: number; connected: number; inbound: number; outbound: number;
  answerRate: number; talkSec: number; avgTalkSec: number; avgWrapSec: number; avgHandleSec: number;
  holdSec: number; withRecording: number;
}
export interface TelephonyDash {
  range: { from: string; to: string };
  empty: boolean;
  totals: {
    calls: number; connected: number; answerRate: number; inbound: number; outbound: number;
    inboundConnected: number; outboundConnected: number; uniqueNumbers: number;
    totalTalkSec: number; avgTalkSec: number; avgHandleSec: number; totalWrapSec: number;
    withRecording: number; activeAgents: number; activeDays: number;
  };
  byDay: { date: string; calls: number; connected: number; inbound: number; outbound: number; talkSec: number }[];
  byHour: { hour: string; calls: number; connected: number }[];
  byDirection: { label: string; calls: number; connected: number }[];
  byCampaign: TeleBucket[]; byAgent: TeleAgent[]; byOutcome: TeleBucket[];
  byHangup: TeleBucket[]; byLocation: TeleBucket[]; bySkill: TeleBucket[];
  serviceLevels: {
    avgQueueSec: number | null; avgRingSec: number | null; avgTimeToAnswerSec: number | null;
    longestQueueSec: number; inboundAnswered: number; inboundMissed: number;
    inboundAnswerRate: number; answeredWithin20sPct: number;
  };
  missedInbound: {
    at: string | null; number: string | null; status: string | null; campaign: string | null;
    queueSec: number | null; ringSec: number | null; agentName: string | null;
    knownContact: boolean; leadId: string | null; patientId: string | null;
  }[];
  /** How many CDR calls we can tie back to a lead/patient — the CRM's blind-spot metric. */
  linkage: { linked: number; unknown: number; linkedPct: number };
  agentCoverage: { mapped: number; unmapped: string[] };
  filters: { agents: string[]; campaigns: string[] };
}
export interface TelephonyIngestHealth {
  totalStored: number; firstDay: string | null; lastDay: string | null;
  lastIngestedAt: string | null; staleDays: number | null;
}
export const telephonyDashApi = {
  dashboard: (f: { from?: string; to?: string; agentCode?: string; campaign?: string; direction?: string } = {}) =>
    api<TelephonyDash>(`/analytics/telephony${q(f as any)}`),
  health: () => api<TelephonyIngestHealth>('/analytics/telephony/health'),
  backfill: (days = 15) => api<{ days: number; totals: { checked: number; ingested: number; linked: number } }>(
    `/telephony/backfill-cdr?days=${days}`, { method: 'POST' }),
};
export const cohortApi = {
  segments: () => api<Segments>('/analytics/segments'),
  stageDistribution: (s: Segment = {}) => api<any>(`/analytics/cohort/stage-distribution${q(s as any)}`),
  progression: (s: Segment = {}) => api<any>(`/analytics/cohort/progression${q(s as any)}`),
  efficacy: (s: Segment = {}) => api<any>(`/analytics/cohort/efficacy${q(s as any)}`),
  registry: (s: Segment = {}) => api<any>(`/analytics/cohort/registry${q(s as any)}`),
  careGaps: (s: Segment = {}) => api<any>(`/analytics/cohort/care-gaps${q(s as any)}`),
  biomarkerControl: (s: Segment = {}) => api<any>(`/analytics/clinical/biomarker-control${q(s as any)}`),
  safetyAlerts: (s: Segment = {}) => api<any>(`/analytics/clinical/safety-alerts${q(s as any)}`),
  biomarkerTrajectory: (s: Segment = {}) => api<any>(`/analytics/clinical/biomarker-trajectory${q(s as any)}`),
  responder: (s: Segment = {}) => api<any>(`/analytics/clinical/responder${q(s as any)}`),
  egfrSlope: (s: Segment = {}) => api<any>(`/analytics/clinical/egfr-slope${q(s as any)}`),
  kdigoHeatmap: (s: Segment = {}) => api<any>(`/analytics/clinical/kdigo-heatmap${q(s as any)}`),
  kfre: (s: Segment = {}) => api<any>(`/analytics/clinical/kfre${q(s as any)}`),
  cancerSafety: (s: Segment = {}) => api<any>(`/analytics/clinical/cancer-safety${q(s as any)}`),
  metabolicControl: (s: Segment = {}) => api<any>(`/analytics/clinical/metabolic-control${q(s as any)}`),
};

// ---- custom report builder + AI agent ----
export interface ReportMeta {
  sources: { key: string; label: string; dimensions: { key: string; label: string }[]; measures: { key: string; label: string }[]; supportsDate: boolean }[];
  metrics: { key: string; label: string }[];
  granularities: string[];
  ops: { key: string; label: string }[];
  charts: string[];
  aiConfigured: boolean;
}
export interface ReportResult { columns: string[]; rows: { group?: string; value: number }[]; spec: any }
export interface SavedReport { id: string; name: string; spec: any; createdBy?: string; createdAt: string }
// ---- calls report (reports_calls:view) ----
export interface CallTargets {
  enabled: boolean; minAttempts: number; minConnected: number; graceDays: number;
  paceWindowDays: number; lostLookbackDays: number; dailyMin: number; dailyMax: number;
}
export interface CallAgentStat {
  agentUserId: string; name: string; calls: number; outbound: number; inbound: number;
  connected: number; connectRate: number; totalTalkSec: number; avgTalkSec: number;
  days: { date: string; calls: number }[]; daysBelowMin: number; daysAboveMax: number;
}
export interface BelowTargetLead {
  leadId: string; fullName: string; phone: string; owner: string | null; ownerId: string | null;
  ageDays: number; attempts: number; expectedAttempts: number; connected: number; reasons: string[];
}
export interface OverdueFollowupTask {
  taskId: string; patientId: string; patient: string; kind: string;
  dueAt: string; cycle: number; attempts: number; assignee: string | null; daysOverdue: number;
}
export interface JunkStat { agentUserId: string; name: string; marked: number; confirmed: number; reopened: number; pending: number; reopenRate: number }
export interface CallsReport {
  range: { from: string; to: string; clamped: boolean };
  /** 'own' = the server narrowed everything to the signed-in user. Comes from the server so the
   *  page never has to re-derive who you are from role names. */
  scope?: 'own' | 'team';
  config: CallTargets;
  agents: CallAgentStat[];
  unattended: { overdue: number; neverCalled: number; belowTarget: number; assignedBeyondGrace: number; items: BelowTargetLead[] };
  followups: { overdueTasks: number; unreachable: number; items: OverdueFollowupTask[] };
  junk: JunkStat[];
  /** How much of this report Ozonetel actually confirmed — see the note in the UI. */
  dataIntegrity: { totalCalls: number; unconfirmedLocally: number; confirmedPct: number; lastConfirmedAt: string | null };
  calls: CallLog;
}

export const reportsApi = {
  meta: () => api<ReportMeta>('/reports/meta'),
  run: (spec: any) => api<ReportResult>('/reports/run', { method: 'POST', body: JSON.stringify({ spec }) }),
  saved: () => api<SavedReport[]>('/reports/saved'),
  save: (d: { name: string; spec: any; createdBy?: string }) => api<SavedReport>('/reports/saved', { method: 'POST', body: JSON.stringify(d) }),
  del: (id: string) => api(`/reports/saved/${id}`, { method: 'DELETE' }),
  ai: (question: string) => api<{ configured: boolean; message?: string; error?: string; spec?: any; result?: ReportResult }>('/reports/ai', { method: 'POST', body: JSON.stringify({ question }) }),
  calls: (f: { from?: string; to?: string; agentUserId?: string; outcome?: string; direction?: string; take?: number; includeFailedDials?: boolean } = {}) =>
    api<CallsReport>(`/reports/calls${q({ ...f, take: f.take ? String(f.take) : undefined } as any)}`),
};

// ---- patient portal (M25) — separate patient token ----
const PORTAL_TOKEN = 'jclinic.portal';
const PORTAL_NAME = 'jclinic.portalName';
export function getPortalToken() { return P().storage.get(PORTAL_TOKEN); }
export function setPortalSession(token: string | null, name?: string) {
  if (token) { P().storage.set(PORTAL_TOKEN, token); if (name) P().storage.set(PORTAL_NAME, name); }
  else { P().storage.set(PORTAL_TOKEN, null); P().storage.set(PORTAL_NAME, null); }
}
export function getPortalName() { return P().storage.get(PORTAL_NAME); }

async function papi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };
  const token = getPortalToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${P().baseUrl}/v1${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/portal/auth')) { setPortalSession(null); P().onUnauthorized('patient'); }
    throw new ApiError(res.status, body);
  }
  return body as T;
}

async function papiUpload<T = any>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getPortalToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${P().baseUrl}/v1${path}`, { method: 'POST', headers, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface SelfRegisterData { phone: string; code: string; fullName: string; sex: string; dob?: string; email?: string; address?: Record<string, unknown>; clinicId: string; category?: string; consentName: string; consentRelation?: string; visitAt: string }
export interface PublicClinic { id: string; name: string; code: string; address?: string | null; visitingCharge: number; upiId: string; upiName: string; razorpayEnabled: boolean }
export interface RegistrationInfo {
  appointmentId: string; bookingRef: string; visitAt: string; billId: string; billNumber: string; amount: number;
  upiId: string; upiName: string; razorpayEnabled: boolean; slipUrl: string;
  clinic?: { name: string; address?: string | null; phone?: string | null };
}
export interface RegistrationStatus extends Partial<RegistrationInfo> {
  hasRegistrationVisit: boolean; payState?: string; outstanding?: number; status?: string;
  clinic?: { name: string; address?: string | null; phone?: string | null };
}
export interface PortalAppointment {
  id: string; startsAt: string; endsAt?: string | null; status: string; type: string;
  bookingRef?: string | null; patientNote?: string | null; rescheduleRequestedFor?: string | null;
  service?: string | null; practitioner?: string | null;
  clinic?: { name: string; address?: string | null; phone?: string | null } | null;
  canCancel: boolean; canReschedule: boolean;
}
export interface PortalAppointments { cancelCutoffMin: number; horizonDays: number; upcoming: PortalAppointment[]; past: PortalAppointment[] }
export interface PortalBill {
  id: string; number: string; total: number; paidAmount: number; payState: string;
  dueDate?: string | null; createdAt: string; pendingChange?: unknown; shareUrl: string;
}
/** One finished visit as the doctor recorded it — the shape behind the portal's Medical history tab. */
/** Cheque tender — sent alongside method='cheque' on every collect/checkout endpoint. */
export interface ChequeInput { chequeNo?: string; chequeBank?: string; chequeDate?: string; chequeDrawer?: string }

export interface PortalVisit {
  id: string; date: string; clinic: string | null; doctor: string | null;
  complaints: { name: string; severity: string | null }[];
  wellbeing: { energy: string | null; generalCondition: string | null; sleep: string | null } | null;
  vitals: { code: string; label: string; value: number | string | null; unit: string | null }[];
  diagnoses: { description: string; isPrimary: boolean }[];
  note: { subjective: string | null; objective: string | null; assessment: string | null; plan: string | null } | null;
  ayurveda: {
    prakriti: string | null; vataPct: number | null; pittaPct: number | null; kaphaPct: number | null;
    agni: string | null; koshtha: string | null; bala: string | null; satva: string | null; ama: boolean | null;
    srotas: string[]; summary: string | null;
  } | null;
  treatmentPlan: { medicationDays: number | null; exercise: any[] | null; yoga: any[] | null; panchkarma: any[] | null } | null;
  dietPlan: { pathya: any; apathya: any; dinacharya: string[]; yogaAsanas: string[]; pranayama: string[]; lifestyleNotes: string | null } | null;
  testsAdvised: { label: string; note: string | null; done: boolean }[];
  medicines: { name: string; dose: string | null; frequency: string | null; frequencyText: string; durationDays: number | null; instructions: string | null }[];
  files: { id: string; name: string; category: string; caption: string | null; url: string }[];
}

export const portalApi = {
  /** The patient's next follow-up (doctor track preferred), or null. */
  nextFollowup: () => api<{ dueAt: string; kind: string; clinic: string | null; clinicPhone: string | null } | null>('/portal/next-followup'),
  // public self-service registration (no token)
  publicClinics: () => papi<PublicClinic[]>('/portal/clinics'),
  registerRequestOtp: (phone: string) => papi<{ sent: boolean }>('/portal/register/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  registerVerifyOtp: (phone: string, code: string) => papi<{ valid: boolean }>('/portal/register/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  register: (data: SelfRegisterData) => papi<{ access_token: string; patient: { id: string; name: string }; registration?: RegistrationInfo }>('/portal/register', { method: 'POST', body: JSON.stringify(data) }),
  // registration visiting-charge payment
  registrationStatus: () => papi<RegistrationStatus>('/portal/registration/status'),
  payUpi: (reference: string) => papi<{ slipUrl: string; payState?: string }>('/portal/registration/pay-upi', { method: 'POST', body: JSON.stringify({ reference }) }),
  razorpayOrder: () => papi<{ keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; prefill?: { name?: string; contact?: string } }>('/portal/registration/razorpay-order', { method: 'POST', body: JSON.stringify({}) }),
  razorpayVerify: (data: { orderId: string; paymentId: string; signature: string }) => papi<{ slipUrl: string; payState?: string }>('/portal/registration/razorpay-verify', { method: 'POST', body: JSON.stringify(data) }),
  requestOtp: (phone: string) => papi<{ sent: boolean }>('/portal/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  /** `device` is mobile-only — supplying it also returns a refresh_token, so day 31 is a silent
   *  renewal rather than another OTP the clinic pays to send. The web portal omits it. */
  verifyOtp: (phone: string, code: string, device?: DeviceInfo) => papi<{ access_token: string; refresh_token?: string; patient: { id: string; name: string }; accessible: { patientId: string; name: string; relation: string }[] }>('/portal/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code, ...(device ?? {}) }) }),
  // --- mobile session + push (no web caller) ---
  registerPush: (data: { deviceId: string; token: string; platform?: string }) =>
    papi<{ ok: boolean; reason?: string }>('/portal/push/register', { method: 'POST', body: JSON.stringify(data) }),
  unregisterPush: (data: { deviceId: string }) =>
    papi<{ ok: boolean; reason?: string }>('/portal/push/register', { method: 'DELETE', body: JSON.stringify(data) }),
  logoutDevice: (deviceId: string) =>
    papi<{ revoked: number }>('/portal/auth/logout', { method: 'POST', body: JSON.stringify({ deviceId }) }),
  // caregiver / proxy access
  accessPatients: () => papi<{ id: string; name: string; relation: string; primary?: boolean; active: boolean }[]>('/portal/access/patients'),
  switchPatient: (patientId: string) => papi<{ access_token: string; patient: { id: string; name: string } }>('/portal/switch', { method: 'POST', body: JSON.stringify({ patientId }) }),
  grantedList: () => papi<{ id: string; caregiverPhone: string; relationship: string; grantedAt: string; expiresAt?: string }[]>('/portal/access/granted'),
  grantAccess: (data: { caregiverPhone: string; relationship?: string; signature: string; expiresAt?: string }) => papi('/portal/access/grant', { method: 'POST', body: JSON.stringify(data) }),
  revokeAccess: (id: string) => papi(`/portal/access/grant/${id}`, { method: 'DELETE' }),
  me: () => papi<any>('/portal/me'),
  medicalHistory: () => papi<PortalVisit[]>('/portal/medical-history'),
  labs: () => papi<any[]>('/portal/labs'),
  uploadLab: (files: File[]) => { const form = new FormData(); files.forEach((f) => form.append('files', f)); return papiUpload<{ id: string; status: string }[]>('/portal/lab-uploads', form); },
  myLabUploads: () => papi<{ id: string; fileName: string; status: string; createdAt: string; reviewedAt?: string | null }[]>('/portal/lab-uploads'),
  prescriptions: () => papi<any[]>('/portal/prescriptions'),
  appointments: () => papi<PortalAppointments>('/portal/appointments'),
  bills: () => papi<PortalBill[]>('/portal/bills'),
  /** clinicId lets the patient check availability at a branch other than their home clinic. */
  slots: (date: string, serviceId?: string, clinicId?: string) =>
    papi<SlotsResponse>(`/portal/slots?date=${date}${serviceId ? `&serviceId=${serviceId}` : ''}${clinicId ? `&clinicId=${clinicId}` : ''}`),
  cancelAppointment: (id: string, reason?: string) => papi<{ ok: boolean }>(`/portal/appointments/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
  requestReschedule: (id: string, startsAt: string, note?: string) =>
    papi<{ ok: boolean; message: string }>(`/portal/appointments/${id}/reschedule-request`, { method: 'POST', body: JSON.stringify({ startsAt, note }) }),
  services: () => papi<any[]>('/portal/services'),
  /**
   * Purpose + time, nothing else. No serviceId (patients shouldn't be picking from the billing
   * catalogue) and no free-text reason — the server rejects both, so this cannot silently regress.
   */
  book: (data: { startsAt: string; purpose: 'Doctor consultation' | 'Therapy'; clinicId?: string }) =>
    papi<{ id: string; startsAt: string; status: string; bookingRef?: string | null; message?: string }>('/portal/appointments', { method: 'POST', body: JSON.stringify(data) }),
  lifestyle: () => papi<any[]>('/portal/lifestyle'),
  addLifestyle: (data: unknown) => papi('/portal/lifestyle', { method: 'POST', body: JSON.stringify(data) }),
  messages: () => papi<ChatMessage[]>('/portal/messages'),
  unread: () => papi<{ unread: number }>('/portal/unread'),
  send: (body: string) => papi('/portal/messages', { method: 'POST', body: JSON.stringify({ body }) }),
  /** Closed = care finished. History stays readable; the composer is hidden rather than failing. */
  conversation: () => papi<{ closedAt: string | null; reason: string | null }>('/portal/conversation'),
  // ePRO symptom check-in
  symptomForm: () => papi<{ context: string; questions: { code: string; label: string; type: 'scale' | 'yesno'; options?: string[]; red: number; std?: string }[] }>('/portal/symptom-form'),
  symptomReports: () => papi<any[]>('/portal/symptom-reports'),
  submitSymptom: (data: { context: string; answers: { code: string; label: string; value: number }[]; note?: string }) => papi<{ flag: string; score: number }>('/portal/symptom-reports', { method: 'POST', body: JSON.stringify(data) }),
  // medication adherence + refills
  medications: () => papi<PortalMedication[]>('/portal/medications'),
  markMedication: (data: { medicineId?: string | null; label: string; slot?: string; date?: string; status?: string }) => papi('/portal/medications/taken', { method: 'POST', body: JSON.stringify(data) }),
  /** Medicines from outside this clinic + any dose change the doctor has recommended. Read-only. */
  outsideMedications: () => papi<PortalOutsideMed[]>('/portal/outside-medications'),
  refills: () => papi<any[]>('/portal/refill-requests'),
  requestRefill: (data: { prescriptionId?: string; note?: string }) => papi('/portal/refill-requests', { method: 'POST', body: JSON.stringify(data) }),
  // care plan + packages
  carePlan: () => papi<{ diseases: any[]; dietPlan: any; due: any[] }>('/portal/care-plan'),
  packages: () => papi<any[]>('/portal/packages'),
  packageRecommendations: () => papi<{ id: string; name: string; kind: string; type: string | null; price: number; durationMonths: number | null; note: string | null; recommendedBy: string | null; recommendedAt: string }[]>('/portal/package-recommendations'),
  dueTests: () => papi<{ diseases: { name: string; stage: number | null }[]; tests: PortalDueTest[] }>('/portal/due-tests'),
  bookTests: (labPartnerId: string, partnerCodes: string[]) => papi<{ id: string; requested: number }>('/portal/lab-orders', { method: 'POST', body: JSON.stringify({ labPartnerId, partnerCodes }) }),
  // feedback — answering a request the clinic sent ("appreciate the team"). Never published.
  feedbackPending: () => papi<{ id: string; trigger: string; createdAt: string }[]>('/portal/feedback'),
  submitFeedback: (id: string, data: { receptionRating?: number; doctorRating?: number; therapistRating?: number; overallRating?: number; comment?: string }) =>
    papi<{ status: string }>(`/portal/feedback/${id}`, { method: 'POST', body: JSON.stringify(data) }),
  // feedback — the patient sharing their experience unprompted. The only path that can reach the
  // public website, and only with publishConsent plus a staff approval.
  shareExperience: (data: { overallRating: number; receptionRating?: number; doctorRating?: number; therapistRating?: number; comment?: string; publishConsent?: boolean }) =>
    papi<{ id: string; status: string; awaitingReview: boolean }>('/portal/feedback/share', { method: 'POST', body: JSON.stringify(data) }),
  feedbackHistory: () => papi<MyFeedbackRow[]>('/portal/feedback/history'),
  withdrawFeedback: (id: string) => papi<{ withdrawn: boolean }>(`/portal/feedback/${id}/withdraw`, { method: 'POST' }),
};

/** The patient's own view of feedback they've given. Never exposes a moderator's decision as such. */
export interface MyFeedbackRow {
  id: string; at: string | null; voluntary: boolean;
  overallRating: number | null; receptionRating: number | null; doctorRating: number | null; therapistRating: number | null;
  comment: string | null;
  publication: 'live' | 'in_review' | 'withdrawn' | 'private';
  canWithdraw: boolean;
}
export interface PortalDueTest {
  biomarkerId: string; name: string; assesses: string | null; frequency: string | null; intervalDays: number | null;
  lastDone: string | null; nextDue: string | null; status: 'overdue' | 'never' | 'scheduled';
  bookable: { labPartnerId: string; labPartner: string; partnerCode: string; price: number | null } | null;
  alreadyBooked: boolean;
}
export interface PortalMedDose { key: string; label: string; time: string | null; qty: number | null; takenToday: boolean; due: boolean; }
export interface PortalMedication {
  label: string; medicineId: string | null; dose?: string | null; frequency?: string | null;
  frequencyText: string; structured: boolean; asNeeded: boolean;
  durationDays?: number | null; endsOn?: string | null;
  slots: PortalMedDose[]; allTakenToday: boolean; anyDue: boolean; streak: number;
}
/** A medicine the patient takes from outside this clinic. Read-only — no dose ticking. */
export interface PortalOutsideMed {
  label: string; form: string | null;
  strength: string | null; frequency: string | null; frequencyText: string;
  indication: string | null; prescribedBy: string | null; status: string;
  /** Their doctor has asked them to change this — the one thing on the card to act on. */
  recommendation: {
    what: string; toStrength: string | null; toFrequencyText: string | null;
    fromDate: string | null; reason: string | null;
  } | null;
}

// staff side of the portal (uses staff token)
/** Portal messaging only — WhatsApp/email were removed (unverifiable delivery). */
export type MessageChannel = 'inapp';
export interface ChatMessage { id: string; sender: 'patient' | 'staff'; body: string; channel?: MessageChannel; createdAt: string; readAt?: string | null; senderName?: string | null }
export interface ChatThread {
  patientId: string; patient: string; phone?: string | null; email?: string | null;
  /** Set once the conversation is closed: history stays readable, sending is blocked both ways. */
  closedAt?: string | null; closeReason?: string | null; closedBy?: string | null;
  messages: ChatMessage[]; lifestyle?: any[];
}
export interface ChatThreadRow { patientId: string; patient: string; lastAt: string; messages: number; unread: number; lastBody: string; lastSender: 'patient' | 'staff'; lastChannel: MessageChannel; closedAt?: string | null }
export interface ReplyResult { ok: boolean; id: string; channel: MessageChannel }
export interface PatientHit { patientId: string; patient: string; phone: string | null; mrn: string | null }
export const portalStaffApi = {
  threads: () => api<ChatThreadRow[]>('/patient-portal/threads'),
  unread: () => api<{ unread: number }>('/patient-portal/unread'),
  search: (q: string) => api<PatientHit[]>(`/patient-portal/search?q=${encodeURIComponent(q)}`),
  thread: (patientId: string) => api<ChatThread>(`/patient-portal/${patientId}`),
  reply: (patientId: string, body: string) =>
    api<ReplyResult>(`/patient-portal/${patientId}/reply`, { method: 'POST', body: JSON.stringify({ body }) }),
  close: (patientId: string, reason: string) =>
    api<{ ok: boolean; closedAt: string; reason: string }>(`/patient-portal/${patientId}/close`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reopen: (patientId: string) =>
    api<{ ok: boolean; closedAt: string | null }>(`/patient-portal/${patientId}/reopen`, { method: 'POST' }),
  alerts: () => api<any[]>('/patient-portal/alerts'),
  ackAlert: (id: string) => api(`/patient-portal/alerts/${id}/ack`, { method: 'POST' }),
  refillRequests: () => api<any[]>('/patient-portal/refills'),
  resolveRefill: (id: string) => api(`/patient-portal/refills/${id}/done`, { method: 'POST' }),
};

import type { AuthUser } from '@jclinic-mobile/api-client';

/**
 * What a staff user is allowed to see, derived from their granted permissions.
 *
 * Ported from apps/web/src/App.tsx (the `canDoc` / `canInv` / … block). The important property is
 * that it is GRANT-driven, not role-name-driven: the web app's comments record that hand-kept role
 * lists drifted from the actual permission matrix, so this reads `user.perms` — the same
 * "module:action" strings the API's PermissionsGuard enforces.
 *
 * This gates the UI only. The API re-checks every request against its live cache, so a stale
 * snapshot here shows a screen that then refuses to load rather than granting anything.
 */

export type StaffUser = AuthUser;

const has = (u: StaffUser | null, perm: string) => !!u && (u.isAdmin || (u.perms ?? []).includes(perm));
const hasAny = (u: StaffUser | null, ...perms: string[]) => perms.some((p) => has(u, p));

/**
 * The one place still keyed on role names, mirroring the web.
 *
 * "Is this person a clinician" is not expressible as a single permission — the doctor workspace is
 * gated on emr:edit, which the front desk also needs for check-in vitals.
 */
const DOCTOR_ROLES = ['doctor', 'senior_doctor', 'medical_director', 'admin'];

export function capabilities(user: StaffUser | null) {
  const roles = user?.roles ?? [];
  return {
    /** Clinician workspace: today's list, biomarker results, visit notes. */
    doctor: !!user && roles.some((r) => DOCTOR_ROLES.includes(r)),
    patients: has(user, 'patients:view'),
    scheduling: has(user, 'scheduling:view'),
    queue: has(user, 'queue:view'),
    emr: has(user, 'emr:view'),
    prescriptions: has(user, 'prescriptions:view'),
    biomarkers: has(user, 'biomarkers:view'),
    lab: has(user, 'lab:view'),
    followups: has(user, 'followups:view'),
    /** Staff side of the patient portal — threads, ePRO alerts, refill requests. */
    messages: has(user, 'portal:view'),
    leads: has(user, 'leads:view'),
    pods: has(user, 'pods:view'),
    billing: has(user, 'billing:view'),
    inventory: has(user, 'inventory:view'),
    /**
     * Today's cash collected, per clinic and chain-wide.
     *
     * Its own permission, held by EVERY role by the owner's decision — deliberately not
     * analytics_finance:view, which also unlocks revenue trends, GST, margins and patient LTV.
     */
    collection: has(user, 'analytics_collection:view'),
    admin: has(user, 'admin:view'),
  };
}

export type Capabilities = ReturnType<typeof capabilities>;

/**
 * Which tab set to show.
 *
 * Mirrors the web's `isLeadDeskOnly` redirect: a Level-1 telecaller who can only work leads is
 * sent straight to the lead desk instead of a dashboard of tiles they cannot open.
 */
export function primarySurface(user: StaffUser | null): 'doctor' | 'crm' | 'none' {
  const can = capabilities(user);
  if (can.doctor) return 'doctor';
  if (can.leads || can.followups) return 'crm';
  return 'none';
}

/** True when the user can work leads and nothing clinical — the dedicated telecaller case. */
export function isLeadDeskOnly(user: StaffUser | null): boolean {
  const can = capabilities(user);
  return can.leads && !can.doctor && !can.patients && !can.billing;
}

export { has as hasPermission, hasAny as hasAnyPermission };

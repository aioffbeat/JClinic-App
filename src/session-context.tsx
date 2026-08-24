import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPortalName, getPortalToken, portalApi, setPortalSession } from '@/src/api';
import {
  clearQueryCache,
  clearSession,
  describeDevice,
  getDeviceId,
  refreshAccessToken,
  setRefreshToken,
  setUpPush,
  unregisterPushToken,
} from '@/src/lib';

/**
 * What GET /portal/me returns.
 *
 * Declared here because the shared client types it as `any` — and that gap already caused a bug:
 * this file used to read `me.id`, which does not exist. The response carries the patient's
 * demographics and disease list; the patient ID comes from verifyOtp/switchPatient, which is where
 * the server actually establishes who the session is for.
 */
export interface PortalMe {
  name: string;
  phone: string | null;
  sex: string | null;
  dob: string | null;
  diseases: { disease: string; stage: number | null; status: string }[];
  clinicId: string;
}

export type AccessiblePatient = { patientId: string; name: string; relation: string };

type SessionState = {
  /** The signed-in patient, or null when signed out / still restoring. */
  patient: { id: string; name: string } | null;
  /** Demographics + diseases, once loaded. Null while offline with no cache. */
  me: PortalMe | null;
  /** Every chart reachable from this phone — self plus any caregiver grants. */
  accessible: AccessiblePatient[];
  signedIn: boolean;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  switchPatient: (patientId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | undefined>(undefined);

/** The patient id is cached alongside the name so a cold start knows who it is before /me returns. */
const PATIENT_ID_KEY = 'jclinic.portalPatientId';

/**
 * The handler the shared client calls when a request comes back 401.
 *
 * A module-level set rather than context because bootstrapApi() must install the handler before the
 * provider's children render, and the client keeps whatever function it is handed for the life of
 * the process.
 */
const unauthorizedListeners = new Set<() => void>();
export function useOnUnauthorized() {
  return useCallback(() => {
    unauthorizedListeners.forEach((fn) => fn());
  }, []);
}

export function PatientSessionProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [me, setMe] = useState<PortalMe | null>(null);
  const [accessible, setAccessible] = useState<AccessiblePatient[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const recovering = useRef(false);

  const hardSignOut = useCallback(async () => {
    setPortalSession(null);
    await clearSession();
    await clearQueryCache();
    setPatient(null);
    setMe(null);
    setAccessible([]);
    setSignedIn(false);
  }, []);

  /**
   * A 401 arrived. Try the refresh token once before giving up on the session.
   *
   * The client has already cleared the access token by the time we get here, so a successful
   * refresh simply puts a new one back and the next query succeeds. Only a failed refresh —
   * expired, revoked from another device, or killed by the server's reuse detection — is a real
   * sign-out. `recovering` collapses the burst of 401s that arrives when several screens resume at
   * once; refreshAccessToken() also de-duplicates internally, because presenting an
   * already-rotated token is exactly what the server treats as theft.
   */
  const recover = useCallback(async () => {
    if (recovering.current) return;
    recovering.current = true;
    try {
      const token = await refreshAccessToken();
      if (token) setPortalSession(token, getPortalName() ?? undefined);
      else await hardSignOut();
    } finally {
      recovering.current = false;
    }
  }, [hardSignOut]);

  useEffect(() => {
    const listener = () => void recover();
    unauthorizedListeners.add(listener);
    return () => {
      unauthorizedListeners.delete(listener);
    };
  }, [recover]);

  // Restore whatever survived the last run. bootstrapApi() has already hydrated storage by now.
  useEffect(() => {
    if (!getPortalToken()) return;
    setSignedIn(true);

    const cachedName = getPortalName();
    const cachedId = getCachedPatientId();
    if (cachedId) setPatient({ id: cachedId, name: cachedName ?? '' });

    portalApi
      .me()
      .then((fresh: PortalMe) => {
        setMe(fresh);
        // /me carries the display name but NOT the id — keep whichever id we already hold.
        setPatient((prev) => (prev ? { ...prev, name: fresh.name } : prev));
      })
      .catch(() => {
        /* a dead session is handled by the 401 path; anything else is offline, so keep the cache */
      });

    portalApi
      .accessPatients()
      .then((rows) => setAccessible(rows.map((r) => ({ patientId: r.id, name: r.name, relation: r.relation }))))
      .catch(() => {});
  }, []);

  /**
   * Renew proactively when the app returns to the foreground.
   *
   * The access token lives about an hour and a phone is backgrounded for far longer than that
   * routinely. Refreshing on resume means the first tap after lunch works, rather than failing once
   * and repairing itself only after a 401 round-trip.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !getPortalToken()) return;
      refreshAccessToken().then((token) => {
        if (token) setPortalSession(token, getPortalName() ?? undefined);
      });
    });
    return () => sub.remove();
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    await portalApi.requestOtp(phone);
  }, []);

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const device = await describeDevice();
    const res = await portalApi.verifyOtp(phone, code, device);
    setPortalSession(res.access_token, res.patient.name);
    if (res.refresh_token) await setRefreshToken(res.refresh_token);
    await cachePatientId(res.patient.id);
    setPatient(res.patient);
    setAccessible(res.accessible);
    setSignedIn(true);
    portalApi.me().then(setMe).catch(() => {});
    // Fire-and-forget: a declined notification permission must not fail a successful sign-in.
    void setUpPush();
  }, []);

  /**
   * Switch to another chart reachable from this phone.
   *
   * The server re-mints the token — the active patient is always the token's subject, never a
   * header or parameter — so the cache must be dropped, or the previous person's records would
   * still be on screen underneath.
   */
  const switchPatient = useCallback(async (patientId: string) => {
    const res = await portalApi.switchPatient(patientId);
    setPortalSession(res.access_token, res.patient.name);
    await cachePatientId(res.patient.id);
    setPatient(res.patient);
    await clearQueryCache();
    portalApi.me().then(setMe).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPushToken();
    try {
      await portalApi.logoutDevice(await getDeviceId());
    } catch {
      // Revoking server-side is best-effort; the local session goes regardless.
    }
    await hardSignOut();
  }, [hardSignOut]);

  const value = useMemo(
    () => ({ patient, me, accessible, signedIn, requestOtp, verifyOtp, switchPatient, signOut }),
    [patient, me, accessible, signedIn, requestOtp, verifyOtp, switchPatient, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePatientSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePatientSession must be used inside PatientSessionProvider');
  return ctx;
}

/* ------------------------------------------------------------------------------------------------
 * The patient id rides in the client's own storage map so it is available synchronously at boot,
 * alongside the token and display name that already live there.
 * --------------------------------------------------------------------------------------------- */

let cachedPatientId: string | null = null;

function getCachedPatientId() {
  return cachedPatientId;
}

async function cachePatientId(id: string) {
  cachedPatientId = id;
  try {
    await AsyncStorage.setItem(PATIENT_ID_KEY, id);
  } catch {
    // Not fatal: /me and switchPatient both re-establish it.
  }
}

/** Called once during startup, before the provider renders. */
export async function hydratePatientId() {
  try {
    cachedPatientId = await AsyncStorage.getItem(PATIENT_ID_KEY);
  } catch {
    cachedPatientId = null;
  }
}

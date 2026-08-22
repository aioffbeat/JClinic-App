import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { getPortalName, getPortalToken, portalApi, setPortalSession } from '@jclinic-mobile/api-client';
import {
  clearQueryCache,
  describeDevice,
  getDeviceId,
  refreshAccessToken,
  setRefreshToken,
  setUpPush,
  unregisterPushToken,
  clearSession,
} from '@jclinic-mobile/core';

export type AccessiblePatient = { patientId: string; name: string; relation: string };

type SessionState = {
  /** Null until hydration finishes, then the signed-in patient or `false` for signed-out. */
  patient: { id: string; name: string } | null;
  accessible: AccessiblePatient[];
  signedIn: boolean;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  switchPatient: (patientId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | undefined>(undefined);

/**
 * The handler api.ts calls when a request comes back 401.
 *
 * Exposed as its own hook because bootstrapApi() needs it before the provider's children render,
 * and it must be referentially stable — the shared client keeps whatever function it is handed for
 * the life of the process.
 */
const unauthorizedListeners = new Set<() => void>();
export function useOnUnauthorized() {
  return useCallback((scope: 'staff' | 'patient') => {
    if (scope !== 'patient') return;
    unauthorizedListeners.forEach((fn) => fn());
  }, []);
}

export function PatientSessionProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [accessible, setAccessible] = useState<AccessiblePatient[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const recovering = useRef(false);

  /**
   * A 401 arrived. Try the refresh token once before giving up on the session.
   *
   * api.ts has already cleared the access token by the time we get here, so a successful refresh
   * simply puts a new one back and React Query's next attempt succeeds. Only a failed refresh —
   * expired, revoked from another device, or killed by the server's reuse detection — is a real
   * sign-out. `recovering` collapses the burst of 401s that arrives when several screens resume at
   * once; refreshAccessToken() also de-duplicates internally, because presenting a rotated token
   * twice is exactly what the server treats as theft.
   */
  const recover = useCallback(async () => {
    if (recovering.current) return;
    recovering.current = true;
    try {
      const token = await refreshAccessToken('patient');
      if (token) {
        setPortalSession(token, getPortalName() ?? undefined);
        return;
      }
      await hardSignOut();
    } finally {
      recovering.current = false;
    }
  }, []);

  const hardSignOut = useCallback(async () => {
    setPortalSession(null);
    await clearSession('patient');
    await clearQueryCache();
    setPatient(null);
    setAccessible([]);
    setSignedIn(false);
  }, []);

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
    portalApi
      .me()
      .then((me: any) => setPatient({ id: me?.id ?? '', name: me?.fullName ?? getPortalName() ?? '' }))
      .catch(() => {
        /* the 401 path handles a dead session; anything else is offline, so keep the cached view */
      });
    portalApi.accessPatients().then(
      (rows) => setAccessible(rows.map((r) => ({ patientId: r.id, name: r.name, relation: r.relation }))),
      () => {},
    );
  }, []);

  /**
   * Renew proactively when the app comes back to the foreground.
   *
   * The access token lives about an hour and a phone is backgrounded for far longer than that
   * routinely. Refreshing on resume means the user's first tap after lunch works, instead of
   * failing once and silently repairing itself only after the 401 round-trip.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !getPortalToken()) return;
      refreshAccessToken('patient').then((token) => {
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
    if (res.refresh_token) await setRefreshToken('patient', res.refresh_token);
    setPatient(res.patient);
    setAccessible(res.accessible);
    setSignedIn(true);
    // Fire-and-forget: a denied notification permission must not fail a successful sign-in.
    void setUpPush('patient');
  }, []);

  /**
   * Switch to another chart on this phone.
   *
   * The server re-mints the token — the active patient is always the token's `sub`, never a header
   * or a parameter — so the cache must be dropped or the previous person's records would still be
   * on screen underneath.
   */
  const switchPatient = useCallback(async (patientId: string) => {
    const res = await portalApi.switchPatient(patientId);
    setPortalSession(res.access_token, res.patient.name);
    setPatient(res.patient);
    await clearQueryCache();
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPushToken('patient');
    try {
      await portalApi.logoutDevice(await getDeviceId());
    } catch {
      // Revoking server-side is best-effort; the local session goes regardless.
    }
    await hardSignOut();
  }, [hardSignOut]);

  const value = useMemo(
    () => ({ patient, accessible, signedIn, requestOtp, verifyOtp, switchPatient, signOut }),
    [patient, accessible, signedIn, requestOtp, verifyOtp, switchPatient, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePatientSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePatientSession must be used inside PatientSessionProvider');
  return ctx;
}

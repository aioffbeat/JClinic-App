import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  authApi,
  getCachedUser,
  getClinic,
  setCachedUser,
  setClinic,
  setToken,
  getToken,
  type AuthUser,
} from '@jclinic-mobile/api-client';
import {
  capabilities,
  clearQueryCache,
  clearSession,
  describeDevice,
  getDeviceId,
  refreshAccessToken,
  setRefreshToken,
  setUpPush,
  unregisterPushToken,
  type Capabilities,
} from '@jclinic-mobile/core';

type SessionState = {
  user: AuthUser | null;
  clinicId: string | null;
  can: Capabilities;
  signedIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  chooseClinic: (clinicId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | undefined>(undefined);

const unauthorizedListeners = new Set<() => void>();
export function useOnUnauthorized() {
  return useCallback((scope: 'staff' | 'patient') => {
    if (scope !== 'staff') return;
    unauthorizedListeners.forEach((fn) => fn());
  }, []);
}

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const recovering = useRef(false);

  const hardSignOut = useCallback(async () => {
    setToken(null);
    setCachedUser(null);
    setClinic(null);
    await clearSession('staff');
    await clearQueryCache();
    setUser(null);
    setClinicId(null);
    setSignedIn(false);
  }, []);

  /**
   * A 401 arrived — try the refresh token before concluding the session is over.
   *
   * api.ts has already cleared the access token by this point, so a successful refresh simply puts
   * a new one back. `recovering` collapses the burst of 401s that arrives when several screens
   * resume at once; refreshAccessToken() de-duplicates internally too, because presenting an
   * already-rotated token is exactly what the server treats as theft.
   */
  const recover = useCallback(async () => {
    if (recovering.current) return;
    recovering.current = true;
    try {
      const token = await refreshAccessToken('staff');
      if (token) setToken(token);
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

  // Restore the previous session. bootstrapApi() has already hydrated storage.
  useEffect(() => {
    if (!getToken()) return;
    setUser(getCachedUser<AuthUser>());
    setClinicId(getClinic());
    setSignedIn(true);
    /**
     * Re-read the user from the server, exactly as the web does on every page load: the cached
     * snapshot goes stale the moment an admin edits a role. /auth/me re-issues the token when
     * roles or clinics have drifted, and that token must be adopted or the API keeps enforcing the
     * old grants while the UI shows the new ones.
     */
    authApi
      .me()
      .then((fresh: any) => {
        if (fresh.access_token) {
          setToken(fresh.access_token);
          delete fresh.access_token;
        }
        setCachedUser(fresh);
        setUser(fresh);
      })
      .catch(() => {
        /* 401 is handled by the recover path; anything else means offline — keep the cached user */
      });
  }, []);

  /** Renew on resume: the access token lives about an hour, a phone is backgrounded for longer. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !getToken()) return;
      refreshAccessToken('staff').then((token) => token && setToken(token));
    });
    return () => sub.remove();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const device = await describeDevice();
    const res = await authApi.login(email, password, device);
    setToken(res.access_token);
    if (res.refresh_token) await setRefreshToken('staff', res.refresh_token);
    setCachedUser(res.user);
    setUser(res.user);
    // X-Clinic-Id is mandatory on nearly every staff route (400 without it), so a clinic must be
    // chosen at sign-in rather than lazily on the first screen that needs one.
    const first = res.user.clinics[0] ?? null;
    setClinic(first);
    setClinicId(first);
    setSignedIn(true);
    void setUpPush('staff');
  }, []);

  const chooseClinic = useCallback(async (next: string) => {
    setClinic(next);
    setClinicId(next);
    // Everything cached was scoped to the previous clinic. The web reloads the page here; the
    // app drops the cache, which is the same intent without the flash.
    await clearQueryCache();
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPushToken('staff');
    try {
      await authApi.logoutDevice(await getDeviceId());
    } catch {
      // Best-effort: the local session goes regardless.
    }
    await hardSignOut();
  }, [hardSignOut]);

  const can = useMemo(() => capabilities(user), [user]);

  const value = useMemo(
    () => ({ user, clinicId, can, signedIn, signIn, chooseClinic, signOut }),
    [user, clinicId, can, signedIn, signIn, chooseClinic, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStaffSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStaffSession must be used inside StaffSessionProvider');
  return ctx;
}

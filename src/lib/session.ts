import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './bootstrap';
import { describeDevice, getDeviceId } from './device';

/**
 * Refresh-token handling for both apps.
 *
 * The refresh token is deliberately NOT routed through the shared api.ts client:
 *   - it is a credential, so it belongs in SecureStore rather than the client's storage map;
 *   - /auth/refresh is unauthenticated, so it needs none of the client's header plumbing;
 *   - and it must be callable at the exact moment the access token has just been rejected, which
 *     is when the client has already cleared its own state.
 *
 * The access token itself stays entirely inside api.ts — nothing here touches it beyond handing
 * over a new one.
 */

const REFRESH_KEY = 'jclinic.portalRefresh';


export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string | null) {
  const key = REFRESH_KEY;
  try {
    if (token) await SecureStore.setItemAsync(key, token);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // A failed write means the session will not survive a cold start. Worth not crashing over.
  }
}

/**
 * Exchange the stored refresh token for a fresh access token.
 *
 * The result distinguishes "this session is over" from "I could not reach the server", and that
 * distinction is the whole point. They used to collapse into one `null`, and the caller answered
 * it by signing the patient out and DELETING the refresh token — directly under a comment
 * promising to keep it. One cold start with no signal, or one 15-second timeout on a slow
 * handset, ended the session permanently: the credential was gone, so every launch afterwards
 * went to the login screen and cost another SMS.
 *
 * Concurrency matters here. Several screens can 401 at once on app resume, and each would try to
 * refresh; because the server ROTATES on every call, the second request would present a token the
 * first has already consumed and the server would treat it as theft and revoke everything. The
 * in-flight promise below is what stops a routine resume from logging the user out.
 */
let inFlight: Promise<RefreshResult> | null = null;

/**
 * What the server hands back, not just the token.
 *
 * `patient` matters: refreshSession re-derives the active chart from the account (the primary
 * `self`, else the first grant), so a refresh after switching to a parent's or child's record
 * silently moves the subject back. Returning it lets the caller notice instead of keeping a
 * cached name over someone else's records.
 */
export type RefreshedSession = {
  accessToken: string;
  patient?: { id: string; name: string };
  accessible?: { patientId: string; name: string; relation: string }[];
};

/**
 * `dead` is the only outcome that justifies signing someone out: the server said 401, or there is
 * no refresh token to spend. `unreachable` covers offline, timeouts and 5xx — keep the tokens and
 * let the next attempt succeed.
 */
export type RefreshResult =
  | { ok: true; session: RefreshedSession }
  | { ok: false; reason: 'dead' | 'unreachable' };

export function refreshAccessToken(): Promise<RefreshResult> {
  if (inFlight) return inFlight;

  const run = (async (): Promise<RefreshResult> => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return { ok: false, reason: 'dead' };

    try {
      const res = await fetch(`${API_BASE}/v1/portal/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, deviceId: await getDeviceId() }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        // 401 means the session is genuinely over — drop the token so we stop retrying with it.
        // Anything else (500, a proxy hiccup) might be transient, so the token is kept and the
        // next attempt can succeed.
        if (res.status === 401) {
          await setRefreshToken(null);
          return { ok: false, reason: 'dead' };
        }
        return { ok: false, reason: 'unreachable' };
      }

      const body = await res.json();
      if (body.refresh_token) await setRefreshToken(body.refresh_token);
      // A 200 with no token is the server contradicting itself; treat it as a hiccup rather than
      // as grounds for throwing the credential away.
      if (!body.access_token) return { ok: false, reason: 'unreachable' };
      return {
        ok: true,
        session: { accessToken: body.access_token as string, patient: body.patient, accessible: body.accessible },
      };
    } catch {
      // Network failure, or the 15s timeout. The user is offline, not signed out.
      return { ok: false, reason: 'unreachable' };
    } finally {
      inFlight = null;
    }
  })();

  inFlight = run;
  return run;
}

/**
 * Is this access token past its own expiry?
 *
 * Read from the JWT rather than tracked separately: the server decides the lifetime (about an
 * hour) and the token states it, so anything we stored alongside would be a second copy able to
 * disagree. Unreadable or unsigned-looking input counts as expired — spending a refresh token we
 * did not need costs one request, while trusting a token we cannot read costs a wrong login
 * screen. The 30-second margin stops a token expiring mid-flight.
 */
export function isExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  const payload = token.split('.')[1];
  if (!payload) return true;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    if (typeof exp !== 'number') return true;
    return Date.now() >= exp * 1000 - 30_000;
  } catch {
    return true;
  }
}

/** Everything a login call needs to identify this device to the API. */
export const deviceFields = describeDevice;

/** Clear every trace of a session on this device. */
export async function clearSession() {
  await setRefreshToken(null);
  await AsyncStorage.removeItem('jclinic.portalName');
}

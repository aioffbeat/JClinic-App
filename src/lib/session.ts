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
 * Returns the new access token on success, or null if the session is gone — expired, revoked by
 * the user from another device, or (the case worth knowing about) killed by the server because a
 * consumed token was replayed. All of those are indistinguishable to us on purpose, and all mean
 * the same thing: sign in again.
 *
 * Concurrency matters here. Several screens can 401 at once on app resume, and each would try to
 * refresh; because the server ROTATES on every call, the second request would present a token the
 * first has already consumed and the server would treat it as theft and revoke everything. The
 * in-flight promise below is what stops a routine resume from logging the user out.
 */
let inFlight: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (inFlight) return inFlight;

  const run = (async (): Promise<string | null> => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

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
        if (res.status === 401) await setRefreshToken(null);
        return null;
      }

      const body = await res.json();
      if (body.refresh_token) await setRefreshToken(body.refresh_token);
      return (body.access_token as string) ?? null;
    } catch {
      // Network failure. Keep the refresh token: the user is offline, not signed out.
      return null;
    } finally {
      inFlight = null;
    }
  })();

  inFlight = run;
  return run;
}

/** Everything a login call needs to identify this device to the API. */
export const deviceFields = describeDevice;

/** Clear every trace of a session on this device. */
export async function clearSession() {
  await setRefreshToken(null);
  await AsyncStorage.removeItem('jclinic.portalName');
}

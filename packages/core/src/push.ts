import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { portalApi, pushApi } from '@jclinic-mobile/api-client';
import { getDeviceId } from './device';
import type { Scope } from './session';

/**
 * Push registration.
 *
 * Deliberately called on EVERY launch, not just the first. Expo reissues tokens — OS updates, app
 * reinstalls, restoring a backup onto a new handset — and a stale token is indistinguishable from
 * a working one until a send silently fails. Re-registering is one cheap idempotent call; not
 * re-registering is invisible breakage that shows up as "I stopped getting my reminders".
 */

/** Android requires a channel to exist before any notification can use it. */
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders and messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#119DA4',
  });
}

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'simulator' | 'denied' | 'no_project_id' | 'error' };

/**
 * Ask for permission and fetch this install's Expo push token.
 *
 * Does NOT send it anywhere — call registerPushToken() for that. Split so the UI can ask for
 * permission at a moment that makes sense (after the patient has seen why reminders help) rather
 * than throwing a system dialog at them on first launch, which is the fastest way to a permanent
 * denial.
 */
export async function getPushToken(): Promise<PushRegistration> {
  // Push tokens cannot be issued to a simulator; treat it as a non-error so dev builds are quiet.
  if (!Device.isDevice) return { ok: false, reason: 'simulator' };

  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    // Required by EAS-built apps; without it getExpoPushTokenAsync cannot tell which project the
    // token belongs to.
    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: 'no_project_id' };

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: data };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Send the token to the API so it can be attached to this device's session.
 *
 * The server answers { ok: false, reason: 'no_session' } when the device has no session row rather
 * than erroring — that means the app signed in through a path that never created one, which is a
 * bug here, not a reason to fail the launch.
 */
export async function registerPushToken(scope: Scope, token: string) {
  const deviceId = await getDeviceId();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const body = { deviceId, token, platform };
  if (scope === 'staff') return pushApi.register(body);
  return portalApi.registerPush(body);
}

/** Stop this device receiving notifications — call on sign-out, before the token is discarded. */
export async function unregisterPushToken(scope: Scope) {
  const deviceId = await getDeviceId();
  try {
    if (scope === 'staff') await pushApi.unregister(deviceId);
    else await portalApi.unregisterPush({ deviceId });
  } catch {
    // Signing out must not fail because the network did. The server also clears the push token
    // when the session is revoked, so this is belt-and-braces.
  }
}

/** Permission + fetch + send, in one call, swallowing the non-fatal outcomes. */
export async function setUpPush(scope: Scope): Promise<PushRegistration> {
  const result = await getPushToken();
  if (!result.ok) return result;
  try {
    await registerPushToken(scope, result.token);
  } catch {
    return { ok: false, reason: 'error' };
  }
  return result;
}

/**
 * How a notification behaves while the app is already open.
 *
 * Shown rather than suppressed: a dose reminder that arrives while the patient happens to be
 * reading their lab results is still the reminder they asked for.
 */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

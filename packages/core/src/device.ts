import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'jclinic.deviceId';

let cached: string | null = null;

/** RFC 4122 v4, from expo-crypto's global. Avoids pulling in a uuid dependency for one call. */
function uuid() {
  // globalThis.crypto.randomUUID exists in Hermes on SDK 52+; the fallback keeps older runtimes
  // working rather than throwing at first launch.
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID() as string;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * A stable per-install identifier.
 *
 * The API keys a DeviceSession on this, so it must survive app restarts but NOT survive a
 * reinstall — a reinstall is a new install and should get a new session rather than silently
 * inheriting the previous user's.
 *
 * Deliberately NOT the hardware id (`getAndroidId` / `identifierForVendor`): those are stable
 * across reinstalls and across users of a shared clinic handset, which is exactly the property we
 * do not want. AsyncStorage, not SecureStore — it is not a secret, and SecureStore on Android
 * survives some reinstall paths.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const fresh = uuid();
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  cached = fresh;
  return fresh;
}

/** Human-readable device name for the "where am I signed in" list. Best-effort. */
export function getDeviceName(): string {
  const model = Device.modelName ?? Device.deviceName ?? 'Unknown device';
  return `${model} (${Platform.OS})`;
}

export function getPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** The build's own version, sent at login and compared against GET /v1/mobile/config. */
export function getAppVersion(): string {
  return Application.nativeApplicationVersion ?? '0.0.0';
}

/** Everything the API's DeviceInfo wants, in one call. */
export async function describeDevice() {
  return {
    deviceId: await getDeviceId(),
    platform: getPlatform(),
    appVersion: getAppVersion(),
    deviceName: getDeviceName(),
  };
}

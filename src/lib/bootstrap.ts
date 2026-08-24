import { configureApi } from '@/src/api';
import { createNativePlatform, hydrateApiStorage, setUnauthorizedHandler } from './native-platform';

/**
 * Where the API lives.
 *
 * EXPO_PUBLIC_* is inlined into the bundle at build time, so this is a build-time constant, not a
 * runtime setting — a device build points at exactly one environment. No trailing slash and no
 * /v1: the shared client appends that itself.
 */
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/+$/, '');

let started = false;

/**
 * Install the platform adapter and load any persisted session into memory.
 *
 * MUST be awaited before rendering anything that can fire a request. The shared client reads its
 * token synchronously from an in-memory map (see native-platform.ts); if the map has not been
 * hydrated yet the first call goes out unauthenticated and bounces a perfectly good session
 * straight to the login screen.
 */
export async function bootstrapApi(onUnauthorized: () => void) {
  if (started) return;
  started = true;

  if (!API_BASE) {
    // Failing loudly here beats every request 404ing against a relative URL that means nothing
    // on a device. Almost always a missing .env or an EAS profile without the var set.
    throw new Error('EXPO_PUBLIC_API_BASE is not set — see .env.example');
  }

  configureApi(createNativePlatform(API_BASE));
  setUnauthorizedHandler(onUnauthorized);
  await hydrateApiStorage();
}

/** Unauthenticated reachability probe — used by the offline/maintenance banner. */
export async function pingApi(timeoutMs = 5000): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export type MobileConfig = {
  minSupportedVersion: string;
  latestVersion: string;
  storeUrls: { android: string | null; ios: string | null };
  maintenanceMessage: string | null;
};

/** GET /v1/mobile/config. Unauthenticated by design — it is read before there is a session. */
export async function fetchMobileConfig(timeoutMs = 5000): Promise<MobileConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/mobile/config`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as MobileConfig;
  } catch {
    // A launch must never be blocked by this call failing. No config means no version gate, which
    // is the same position we were in before the endpoint existed.
    return null;
  }
}

/** Numeric semver compare. Returns true when `version` is below `floor`. */
export function isBelowVersion(version: string, floor: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [a, b] = [parse(version), parse(floor)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const l = a[i] ?? 0;
    const r = b[i] ?? 0;
    if (l !== r) return l < r;
  }
  return false;
}

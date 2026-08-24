import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ApiPlatform } from '@/src/api';

/**
 * The React Native implementation of ApiPlatform (the web one lives at apps/web/src/platform.ts
 * in the jclinic repo).
 *
 * The whole reason this file exists: api.ts is shared verbatim between web and mobile, so it
 * cannot reach for localStorage / location / document. Everything host-specific lands here.
 */

// ---------------------------------------------------------------------------------------------
// Storage
//
// ApiPlatform.storage.get MUST be synchronous — api.ts calls getToken() inside every request, and
// making that async would force all 39 API namespaces to change shape. React Native has no
// synchronous storage, so we keep an in-memory Map as the read path and mirror writes out to the
// real store in the background. hydrate() fills the Map once at boot, before the first request.
//
// Two backing stores, on purpose:
//   SecureStore (hardware-backed keychain/keystore) for the two bearer tokens — these are
//     credentials, and this is a device that gets left on clinic counters.
//   AsyncStorage for everything else. The cached user snapshot in particular holds roles, clinics
//     and a permissions array that routinely runs past SecureStore's 2 KB comfort limit, and it is
//     not a credential — it is a UI-gating convenience that the server re-validates on every call.
// ---------------------------------------------------------------------------------------------

const SECURE_KEYS = new Set(['jclinic.token', 'jclinic.portal']);

const mem = new Map<string, string>();
let hydrated = false;

/** Every key the client reads. Listed explicitly so hydrate() is one predictable pass. */
const ALL_KEYS = ['jclinic.token', 'jclinic.portal', 'jclinic.clinic', 'jclinic.portalName', 'jclinic.user'];

/**
 * Load persisted session state into the in-memory Map. MUST be awaited during app startup,
 * before rendering anything that can fire a request — otherwise the first call goes out
 * unauthenticated and bounces the user to login despite a perfectly good stored token.
 */
export async function hydrateApiStorage(): Promise<void> {
  await Promise.all(
    ALL_KEYS.map(async (key) => {
      try {
        const value = SECURE_KEYS.has(key)
          ? await SecureStore.getItemAsync(key)
          : await AsyncStorage.getItem(key);
        if (value != null) mem.set(key, value);
      } catch {
        // A single unreadable key must not stop the app booting — worst case the user logs in again.
      }
    }),
  );
  hydrated = true;
}

export function isApiStorageHydrated() {
  return hydrated;
}

/** Fire-and-forget persistence. Writes are ordered per key so a rapid set/clear cannot invert. */
const writeQueues = new Map<string, Promise<unknown>>();
function persist(key: string, value: string | null) {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => {
      if (SECURE_KEYS.has(key)) {
        return value == null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value);
      }
      return value == null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value);
    })
    .catch(() => {
      // Swallowed deliberately: a failed write means the session does not survive a cold start.
      // Throwing here would instead break the in-flight request that triggered it.
    });
  writeQueues.set(key, next);
}

/** Await every pending write. Use before a deliberate app exit or an account switch. */
export function flushApiStorage(): Promise<unknown> {
  return Promise.all([...writeQueues.values()]);
}

// ---------------------------------------------------------------------------------------------
// Unauthorized handling
//
// api.ts cannot know what "go to login" means here — that is the navigator's business, and the
// navigator does not exist yet at module-load time. The app registers a handler at startup.
// ---------------------------------------------------------------------------------------------

type UnauthorizedHandler = () => void;
let onUnauthorizedHandler: UnauthorizedHandler = () => {};
export function setUnauthorizedHandler(fn: UnauthorizedHandler) {
  onUnauthorizedHandler = fn;
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

/** RN's Blob has no arrayBuffer(); FileReader is the portable route to base64. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read the downloaded file'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      // Strip the "data:<mime>;base64," prefix FileReader prepends.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** Sanitise a server-supplied filename before it becomes a path segment. */
function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'download';
}

/**
 * Stage bytes in the app's cache directory and return the file:// URI.
 *
 * Cache, not documents: these are transient — a CSV on its way to the share sheet, or an audio
 * file being handed to a player. The OS is free to reclaim them under storage pressure, which is
 * exactly the lifetime we want. Nothing here is the only copy of anything.
 */
async function writeToCache(blob: Blob, filename: string): Promise<string> {
  const file = new File(Paths.cache, safeName(filename));
  file.create({ overwrite: true, intermediates: true });
  file.write(await blobToBase64(blob), { encoding: 'base64' });
  return file.uri;
}

// ---------------------------------------------------------------------------------------------

export function createNativePlatform(baseUrl: string): ApiPlatform {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return {
    baseUrl: trimmed,

    storage: {
      get: (key) => mem.get(key) ?? null,
      set: (key, value) => {
        if (value == null) mem.delete(key);
        else mem.set(key, value);
        persist(key, value);
      },
    },

    onUnauthorized: () => onUnauthorizedHandler(),

    // There is no "downloads folder" to drop a file into on iOS, and writing to shared storage on
    // Android needs permissions we would rather not ask for. The platform-idiomatic move is to
    // stage the file in the app cache and hand it to the system share sheet, which lets the user
    // put it wherever they actually want it.
    saveBlob: async (blob, filename) => {
      const uri = await writeToCache(blob, filename);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: filename });
      }
    },

    // A file:// URI the RN media player can stream from — the mobile counterpart of the web's
    // blob: URL. Nothing to revoke; it lives in the cache directory the OS reclaims on its own.
    blobUrl: async (blob) => writeToCache(blob, `recording-${Date.now()}.mp3`),
  };
}

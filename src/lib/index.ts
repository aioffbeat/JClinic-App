// App-only logic: API bootstrap, device identity, sessions, push, the query client, and the
// ApiPlatform implementation the shared client is handed at startup.
//
// Shared DOMAIN logic does NOT live here — it is synced into src/api so its relative imports keep
// resolving against api.ts. See scripts/sync-api-client.mjs.
export * from './bootstrap';
export * from './device';
export * from './session';
export * from './push';
export * from './query';
export {
  createNativePlatform,
  hydrateApiStorage,
  isApiStorageHydrated,
  flushApiStorage,
  setUnauthorizedHandler,
} from './native-platform';
